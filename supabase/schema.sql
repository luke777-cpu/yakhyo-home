-- ============================================================
-- 약효일지 홈페이지 — 인증 + 질문게시판 v1 스키마
--
-- 적용 방법은 docs/AUTH-BOARD-SETUP.md 8단계를 따른다.
-- Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 실행한다.
-- 여러 번 실행해도 안전하도록 썼다(idempotent).
--
-- 설계 원칙
--  - 개인 식별 정보를 스키마에 두지 않는다. 실명·전화번호·주소 칼럼이 없다.
--    이메일은 auth.users 에만 있고 public 스키마로 복사하지 않는다.
--  - 모든 테이블에 RLS 를 켠다. 정책 없이 켜면 아무도 못 읽으므로 정책을 명시한다.
--  - 삭제는 soft delete 다. DELETE 정책을 아예 두지 않아 hard delete 가 불가능하다.
--  - 정책은 auth.uid() 를 직접 비교한다. 같은 테이블을 되짚는 정책을 만들지 않는다
--    (자기참조 정책은 무한 재귀를 일으킨다).
-- ============================================================

-- ---------- 공통: updated_at 자동 갱신 ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================
-- profiles — 게시판에 보이는 유일한 신원. 닉네임뿐이다.
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- 2~20자. 앞뒤 공백만으로 이루어진 닉네임을 막는다.
  constraint profiles_nickname_len check (char_length(btrim(nickname)) between 2 and 20)
);

-- 대소문자만 다른 닉네임을 같은 것으로 본다.
create unique index if not exists profiles_nickname_lower_key
  on public.profiles (lower(btrim(nickname)));

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ============================================================
-- posts — 질문
-- ============================================================
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  body        text not null,
  status      text not null default 'published',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint posts_title_len  check (char_length(btrim(title)) between 2 and 120),
  constraint posts_body_len   check (char_length(btrim(body))  between 2 and 5000),
  constraint posts_status_chk check (status in ('published', 'hidden'))
);

create index if not exists posts_live_idx
  on public.posts (created_at desc)
  where deleted_at is null and status = 'published';

create index if not exists posts_author_idx on public.posts (author_id, created_at desc);

drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

-- ============================================================
-- comments — 답글
-- ============================================================
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint comments_body_len check (char_length(btrim(body)) between 1 and 2000)
);

create index if not exists comments_post_idx
  on public.comments (post_id, created_at)
  where deleted_at is null;

drop trigger if exists comments_touch on public.comments;
create trigger comments_touch before update on public.comments
  for each row execute function public.touch_updated_at();

-- ============================================================
-- reports — 신고. v1 에서는 접수만 하고 화면은 만들지 않는다.
-- ============================================================
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  target_type  text not null,
  target_id    uuid not null,
  reason       text not null,
  created_at   timestamptz not null default now(),

  constraint reports_target_chk check (target_type in ('post', 'comment')),
  constraint reports_reason_chk check (reason in ('medical_advice', 'personal_info', 'spam', 'other'))
);

create index if not exists reports_target_idx on public.reports (target_type, target_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.posts    enable row level security;
alter table public.comments enable row level security;
alter table public.reports  enable row level security;

-- ---------- profiles ----------
-- 읽기는 public. 게시판이 닉네임을 보여주려면 로그인하지 않은 방문자도 읽을 수 있어야 한다.
-- 이 테이블에는 닉네임 말고 공개되면 곤란한 값이 없다.
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public on public.profiles
  for select using (true);

-- 자기 행만 만들 수 있다. 남의 id 로 프로필을 만들 수 없다.
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- DELETE 정책 없음. 계정 삭제는 auth.users 가 지워질 때 cascade 로만 일어난다.

-- ---------- posts ----------
-- 살아 있는 글은 누구나 읽는다. 여기에 **작성자 본인은 자기 글을 항상 읽는다**를 더한다.
--
-- 뒤쪽 조건이 왜 필요한가:
-- PostgreSQL 은 UPDATE 할 때 바뀐 행이 SELECT 정책도 통과하는지 본다.
-- 그래서 `deleted_at is null` 만 두면 deleted_at 를 채우는 순간 새 행이
-- 자기 SELECT 정책에 걸려 **본인조차 자기 글을 소프트 삭제할 수 없다.**
-- (로컬 PostgreSQL 16 에서 실제로 재현해 확인했다.)
-- 작성자에게 자기 글을 보이게 하면 이 문제가 사라진다.
-- 목록에서 지운 글이 보이지 않게 하는 것은 클라이언트가 .is('deleted_at', null) 로 한다.
drop policy if exists posts_select_live on public.posts;
create policy posts_select_live on public.posts
  for select using (
    (deleted_at is null and status = 'published')
    or auth.uid() = author_id
  );

-- 로그인했고, 닉네임을 만든 사람만 쓸 수 있다.
-- 닉네임 설정을 화면에서만 강제하면 우회할 수 있으므로 DB 에서 막는다.
drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts
  for insert with check (
    auth.uid() = author_id
    and exists (select 1 from public.profiles p where p.id = auth.uid())
  );

-- 본인 글만, 그리고 아직 지우지 않은 글만 고칠 수 있다.
-- soft delete(= deleted_at 채우기)도 이 정책을 탄다.
-- with check 에 author_id 비교를 둬서 남에게 글을 넘길 수 없게 한다.
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update
  using (auth.uid() = author_id and deleted_at is null)
  with check (auth.uid() = author_id);

-- DELETE 정책 없음 → hard delete 불가.

-- ---------- comments ----------
-- posts 와 같은 이유로 작성자 본인 조건을 더한다. 없으면 자기 답글을 지울 수 없다.
drop policy if exists comments_select_live on public.comments;
create policy comments_select_live on public.comments
  for select using (deleted_at is null or auth.uid() = author_id);

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own on public.comments
  for insert with check (
    auth.uid() = author_id
    and exists (select 1 from public.profiles p where p.id = auth.uid())
    -- 지워졌거나 숨겨진 글에는 댓글을 달 수 없다.
    and exists (
      select 1 from public.posts t
      where t.id = post_id and t.deleted_at is null and t.status = 'published'
    )
  );

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments
  for update
  using (auth.uid() = author_id and deleted_at is null)
  with check (auth.uid() = author_id);

-- DELETE 정책 없음.

-- ---------- reports ----------
-- 접수만 된다. SELECT 정책이 없으므로 anon/authenticated 키로는 아무도 읽을 수 없다.
-- 운영자는 Supabase 대시보드(서버 측)에서 본다.
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert with check (auth.uid() = reporter_id);

-- ============================================================
-- 확인용 — 실행 후 RLS 가 실제로 켜졌는지 본다.
--   select relname, relrowsecurity from pg_class
--   where relname in ('profiles','posts','comments','reports');
-- 네 줄 모두 relrowsecurity = true 여야 한다.
-- ============================================================
