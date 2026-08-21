# 약효일지 Q&A — 설계 문서

코딩 전에 정해둘 것을 먼저 적는다. 이 문서에서 합의가 끝난 뒤에 구현을 시작한다.

## 0. 전제

| | 결정 |
|---|---|
| 배포 | Q&A 착수 시점에 **Vercel로 이전**. `BASE_PATH=/`, `SITE_URL=<도메인>` 두 값만 바꾸면 된다 |
| 데이터베이스 | **Supabase 새 프로젝트**. 추모 사이트 프로젝트는 쓰지 않는다 (Auth 설정이 정반대 — 그쪽은 회원가입 차단이 전제) |
| 렌더링 | 사이트 나머지는 정적 그대로. **Q&A 화면만 정적 셸 + 클라이언트에서 데이터 로드** |
| 권한 | RLS는 `auth.uid()` 직접 비교를 기본으로 한다 |

**정적 사이트의 한계를 먼저 인정한다.** anon key는 브라우저 번들에 그대로 실린다. 이것은 Supabase의 정상적인 사용법이지만, **보안이 전부 RLS에 걸린다**는 뜻이다. RLS를 틀리면 그대로 뚫린다. 서버가 없으므로 서버측 검열·rate limit·메일 발송도 없다.

### 추모 사이트에서 가져올 것과 가져오지 말 것

| 그쪽 교훈 | 여기 적용 |
|---|---|
| 자기참조 정책은 무한재귀 | **그대로 적용** — profiles 정책이 profiles를 다시 조회하지 않게 한다 |
| `auth.email() in (subquery)` 는 조용히 0건 반환 | **그대로 적용** — 서브쿼리 비교 대신 `auth.uid()` 직접 비교 |
| 매직링크는 메일 스캐너 프리페치로 만료됨 | **그대로 적용** — 매직링크 쓰지 않는다 |
| RLS는 단순형, 차단은 회원가입 OFF로 | **적용 불가** — Q&A는 누구나 가입해야 한다. 여기서는 RLS를 제대로 써야 한다 |

### 무료 플랜 주의
Supabase 무료 플랜은 **7일 미사용 시 자동 일시중지**된다. 초기 Q&A는 글이 뜸할 수 있으므로, 일시중지되면 게시판만 죽는 것이 아니라 **로그인 자체가 안 된다**. 대시보드에서 Restore하면 복구되지만(90일 내), 공개 후 한 달쯤은 주 1회 접속 확인이 필요하다.

---

## 1. 테이블 구조

### profiles
`auth.users`와 1:1. **실명·전화번호·생년월일 칼럼을 만들지 않는다.** 없는 칸에는 쓸 수 없다.

```sql
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text not null unique check (char_length(nickname) between 2 and 20),
  role        text not null default 'user' check (role in ('user','admin')),
  created_at  timestamptz not null default now()
);
```

이메일은 `auth.users`에만 있고 **화면 어디에도 노출하지 않는다.**

### posts

```sql
create table public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  category    text not null check (category in ('record','understand','app')),
  title       text not null check (char_length(title) between 2 and 100),
  body        text not null check (char_length(body) between 5 and 5000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  deleted_by  uuid references public.profiles(id)
);
create index on public.posts (category, created_at desc) where deleted_at is null;
```

| category | 화면 이름 |
|---|---|
| `record` | 기록 방법 |
| `understand` | 약효 변화 이해 |
| `app` | 앱 사용 문의 |

**삭제는 전부 소프트 삭제다.** 실제 행을 지우지 않고 `deleted_at`을 채운다. 운영자가 지운 글을 되살릴 수 있어야 하고, 신고 처리 이력이 남아야 하기 때문이다.

### comments

```sql
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 2 and 2000),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  deleted_by  uuid references public.profiles(id)
);
create index on public.comments (post_id, created_at) where deleted_at is null;
```

대댓글 없음. 1단계만. 첫 버전에서 쪽지·친구·프로필 사진도 없다.

### reports

```sql
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  target_type  text not null check (target_type in ('post','comment')),
  target_id    uuid not null,
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  reason       text not null check (reason in ('medical_advice','personal_info','spam','other')),
  note         text check (char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  handled_at   timestamptz,
  handled_by   uuid references public.profiles(id),
  unique (reporter_id, target_type, target_id)
);
```

`unique` 제약이 같은 사람의 중복 신고를 막는다. 신고 사유 네 가지 중 앞의 둘이 이 사이트에서 실제로 필요한 것이다.

---

## 2. RLS 정책

**전부 `enable row level security`를 켠 뒤 정책을 명시한다.** 켜지 않으면 anon key로 전체 테이블이 열린다.

### 운영자 판정 — 재귀를 끊는 함수

`profiles`를 조회해 admin을 판정하는데, 그 조회가 다시 `profiles` 정책을 타면 무한재귀가 난다. `security definer`로 RLS를 우회해 끊는다.

```sql
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;
revoke execute on function public.is_admin() from anon;
```

### profiles

```sql
alter table public.profiles enable row level security;

-- 닉네임은 글쓴이 표시에 필요하므로 공개. 이 테이블에 민감정보를 두지 않는 이유이기도 하다.
create policy profiles_read on public.profiles
  for select to anon, authenticated using (true);

create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
```

삭제 정책은 만들지 않는다. 탈퇴는 `auth.users` 삭제로 연쇄된다.

### posts

```sql
alter table public.posts enable row level security;

create policy posts_read on public.posts
  for select to anon, authenticated using (deleted_at is null);

create policy posts_insert_self on public.posts
  for insert to authenticated with check (author_id = auth.uid());

create policy posts_update_self on public.posts
  for update to authenticated
  using (author_id = auth.uid() and deleted_at is null)
  with check (author_id = auth.uid());

create policy posts_update_admin on public.posts
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
```

`for delete` 정책은 **아예 만들지 않는다.** 정책이 없으면 거부되므로 하드 삭제 경로가 원천적으로 없다.

운영자 update 정책은 본문까지 고칠 수 있다. 운영자가 본문을 바꾸는 일은 없어야 하므로, 필요하면 트리거로 `deleted_at`/`deleted_by` 외 칼럼 변경을 막는다. **1단계에서는 운영자가 한 명이므로 트리거 없이 간다.**

### comments — posts와 동일한 형태

```sql
alter table public.comments enable row level security;

create policy comments_read on public.comments
  for select to anon, authenticated using (deleted_at is null);

create policy comments_insert_self on public.comments
  for insert to authenticated with check (author_id = auth.uid());

create policy comments_update_self on public.comments
  for update to authenticated
  using (author_id = auth.uid() and deleted_at is null)
  with check (author_id = auth.uid());

create policy comments_update_admin on public.comments
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
```

### reports — 신고 내역은 운영자만 본다

```sql
alter table public.reports enable row level security;

create policy reports_insert_self on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());

create policy reports_read_admin on public.reports
  for select to authenticated using (public.is_admin());

create policy reports_update_admin on public.reports
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
```

신고자는 자기 신고도 다시 볼 수 없다. 신고 내역이 서로에게 보이면 갈등이 생긴다.

### 배포 전 확인 (이 순서로)

1. 로그아웃 상태에서 목록·상세가 **읽히는지**
2. 로그아웃 상태에서 글쓰기가 **막히는지**
3. 다른 사람 글을 수정·삭제하려 할 때 **막히는지**
4. `select * from pg_policies where schemaname='public'` 로 정책이 의도대로 붙었는지
5. 삭제한 글이 목록과 상세에서 **사라지는지**

---

## 3. 화면 흐름

```
/qa/                  목록 — 누구나 읽기
                      분류 탭 3개 · 최신순 · 20개씩
/qa/[id]/             상세 + 댓글 — 누구나 읽기
/qa/write/            글쓰기 — 로그인 필요
/qa/login/            로그인
/qa/nickname/         닉네임 설정 — 최초 로그인 직후 1회
/qa/admin/            신고 목록 — 운영자만
```

### 로그인

**Google OAuth를 기본으로, 이메일 + 비밀번호를 보조로 둔다.**
매직링크는 쓰지 않는다 — 메일 스캐너가 링크를 미리 열어 도착 전에 만료시키는 문제를 이미 겪었다.

```
로그인 버튼 → Supabase Auth
  → profiles 행 있음 → 원래 있던 화면으로 복귀
  → profiles 행 없음 → /qa/nickname/ 으로 보내 닉네임 설정 (건너뛸 수 없음)
```

닉네임을 설정하기 전에는 글쓰기·댓글이 되지 않는다. 클라이언트에서 막고, DB에서도 `profiles` 외래키가 없으면 insert가 실패한다.

### 글쓰기 화면

```
┌──────────────────────────────────────┐
│ ⚠ 개인정보 안내 (항상 보임, 접히지 않음) │
├──────────────────────────────────────┤
│ 분류  [기록 방법 ▾]                    │
│ 제목  [                          ]    │
│ 내용  [                          ]    │
│       [                          ]    │
│                                      │
│ [ 올리기 ]        남은 글자 4,820      │
└──────────────────────────────────────┘
```

안내문은 **접히지 않는다.** 접히는 안내는 아무도 읽지 않는다.

### 목록·상세에 표시하는 것

닉네임, 분류, 작성 시각, 댓글 수. **이메일·가입일·글 수·등급 같은 것은 표시하지 않는다.**

---

## 4. 게시판 규칙

### 목록·상세 상단 (항상)

> 이 공간은 약물 처방이나 용량 조절을 위한 의료 상담 공간이 아닙니다.
> 개인의 복용 변경은 담당 치료진과 상의하세요.

### 글쓰기 화면 (항상)

> 이름, 전화번호, 주민등록번호, 병원·진료기록처럼 개인을 확인할 수 있는 정보는 올리지 마세요.
> 한 번 올라간 글은 다른 사람이 이미 읽었을 수 있습니다.

### 게시판 규칙 (별도 페이지, 글쓰기 화면에서 링크)

1. 다른 분에게 **약의 종류·용량·복용 시간을 바꾸라고 권하지 않습니다.** 내 경험을 이야기하는 것과 남에게 권하는 것은 다릅니다.
2. 개인을 확인할 수 있는 정보를 올리지 않습니다. 본인 것도, 다른 사람 것도 마찬가지입니다.
3. 특정 병원·의료진에 대한 평가는 올리지 않습니다.
4. 광고, 제품 판매, 치료 효과를 주장하는 글은 삭제합니다.
5. 질문에 답이 없어도 재촉하지 않습니다. 운영자 한 사람이 보고 있습니다.

---

## 5. 신고 · 운영 기준

### 사용자가 누르는 것
글과 댓글마다 **신고 버튼 하나.** 사유 네 가지 중 선택.

| 사유 | 화면 문구 |
|---|---|
| `medical_advice` | 약을 바꾸라고 권하는 내용입니다 |
| `personal_info` | 개인을 확인할 수 있는 정보가 있습니다 |
| `spam` | 광고이거나 판매 글입니다 |
| `other` | 그 밖의 문제 |

### 운영자가 하는 것

| 상황 | 조치 | 기준 |
|---|---|---|
| 개인정보 노출 | **즉시 삭제**, 확인은 그 뒤에 | 되돌릴 수 없는 피해라 판단을 미루지 않는다 |
| 약 조절 권유 | 삭제하지 않고 **댓글로 안내** | 선의로 쓴 글이 대부분이다. 지우면 안 돌아온다 |
| 반복되는 조절 권유 | 삭제 + 개별 안내 | 두 번째부터 |
| 광고·판매 | 즉시 삭제 | |
| 병원·의료진 평가 | 삭제 후 안내 | |
| 다툼 | 양쪽 모두에게 한 번 안내, 이어지면 해당 글 삭제 | |

**삭제할 때는 삭제했다는 사실을 남긴다.** 소프트 삭제이므로 자리에 "운영자가 삭제한 글입니다"를 표시하고, 사유는 적지 않는다.

### 신고가 없어도 봐야 하는 것
신고는 늦게 온다. 개인정보는 신고되기 전에 이미 읽힌다. **하루 한 번 새 글을 훑는 것**이 신고 기능보다 실질적이다. 글이 하루 몇 개인 동안에는 이것으로 충분하다.

---

## 6. 1단계에서 만들지 않는 것

쪽지 · 친구 · 프로필 사진 · 좋아요 · 등급 · 조회수 · 대댓글 · 알림 메일 · 검색 · 첨부파일.

**첨부파일을 넣지 않는 것이 특히 중요하다.** 사진을 올릴 수 있게 하면 진료기록과 약봉투 사진이 반드시 올라온다.

---

## 7. 구현 순서

1. Vercel 이전 (`BASE_PATH=/`) — 게시판 없이 먼저 옮기고 배포 확인
2. Supabase 프로젝트 생성 · 테이블 · RLS · `is_admin()` 함수
3. 로그아웃 상태에서 위 5가지 확인
4. 로그인 + 닉네임 설정
5. 목록 · 상세 (읽기 전용)
6. 글쓰기 · 댓글
7. 본인 수정 · 삭제
8. 신고 + 운영자 화면
9. 규칙 페이지 · 안내문

**3번을 건너뛰지 않는다.** RLS가 틀린 채로 5번까지 가면 그때는 원인을 찾기 어렵다.
