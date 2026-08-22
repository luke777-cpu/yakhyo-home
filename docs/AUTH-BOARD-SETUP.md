# 인증 · 질문게시판 설정 순서

> 코드는 `feature/auth-board-v1` 브랜치에 다 들어 있다.
> **이 문서의 순서대로 콘솔 설정을 마쳐야 로그인이 동작한다.**
> 설정 전에는 화면이 정상으로 뜨되, 로그인 버튼을 누르면 안내 문구가 나온다.

**PowerShell 에서는 `&&` 를 쓰지 않는다.** 명령을 한 줄에 하나씩 실행한다.

---

## 0. 먼저 알아둘 것

### 이 사이트는 서버가 없다

정적 빌드(GitHub Pages)를 그대로 유지한다. 인증과 게시판은 **브라우저에서** Supabase 와 직접 통신한다.

그래서 **접근 제어는 화면이 아니라 Supabase 의 RLS 가 한다.**
`supabase/schema.sql` 을 적용하지 않으면 게시판이 동작하지 않거나, 최악의 경우 아무나 아무 행이나 고칠 수 있다.
**8단계를 건너뛰지 말 것.**

### 키 두 종류

| 키 | 브라우저 노출 | 이 프로젝트에서 |
|---|---|---|
| `anon` / `public` | **정상** | `PUBLIC_SUPABASE_ANON_KEY` 로 쓴다 |
| `service_role` | **절대 금지** | 어디에도 넣지 않는다. RLS 를 통째로 무시하는 키다 |

`.env` 는 `.gitignore` 에 있다. `.env.example` 만 저장소에 있고 값은 비어 있다.

---

## 1. 새 Supabase 프로젝트 만들기

**기존 프로젝트(부모님 추모 홈페이지 등)를 재사용하지 않는다.** 새로 만든다.

1. https://supabase.com/dashboard 접속
2. **New project**
3. 입력값
   - Name: `yakhyo-home` (원하는 이름)
   - Database Password: 생성되는 값을 **비밀번호 관리자에 저장**. 다시 볼 수 없다
   - Region: `Northeast Asia (Seoul)` — 한국 사용자가 대상이다
4. 생성에 1~2분 걸린다

---

## 2. URL 과 anon key 복사

1. 프로젝트 → **Project Settings** → **API**
2. 두 값을 복사

| 화면의 이름 | 넣을 곳 |
|---|---|
| **Project URL** | `PUBLIC_SUPABASE_URL` |
| **anon / public** | `PUBLIC_SUPABASE_ANON_KEY` |

`service_role` 은 복사하지 않는다.

---

## 3. Kakao Developers 앱 만들기

1. https://developers.kakao.com 로그인
2. **내 애플리케이션** → **애플리케이션 추가하기**
   - 앱 이름: `약효일지`
   - 사업자명: 개인이면 본인 이름
3. 만들어진 앱 → **앱 설정 → 앱 키** 에서 다음을 확인

| 카카오 콘솔의 이름 | Supabase 에 넣을 곳 |
|---|---|
| **REST API 키** | Kakao provider 의 **Client ID** |
| (아래 4단계에서 만드는) **Client Secret** | Kakao provider 의 **Client Secret** |

> JavaScript 키·네이티브 앱 키는 쓰지 않는다. **REST API 키**다.

---

## 4. Kakao Login 활성화

1. **제품 설정 → 카카오 로그인**
2. **활성화 설정**을 **ON**
3. **Redirect URI** 에 아래를 등록 — Supabase 가 주는 주소다

```
https://<프로젝트ref>.supabase.co/auth/v1/callback
```

`<프로젝트ref>` 는 2단계의 Project URL 에서 `https://` 와 `.supabase.co` 사이 문자열이다.

4. **보안** 탭 → **Client Secret** → **코드 생성**, 상태를 **사용함**으로
5. **동의항목** 에서 아래만 설정한다

| 항목 | 설정 | 이유 |
|---|---|---|
| 닉네임 | **선택 동의** 또는 미사용 | 게시판 닉네임은 우리가 따로 받는다 |
| 카카오계정(이메일) | **선택 동의** | 계정 식별용. 게시판에 노출하지 않는다 |
| 그 외 (성별·연령대·생일·전화번호 등) | **전부 사용하지 않음** | 받을 이유가 없다 |

> **실명·전화번호·생년월일 동의항목을 켜지 않는다.** 이 사이트는 그 정보를 저장하지 않는다.

---

## 5. Supabase 에 Kakao provider 설정

1. Supabase → **Authentication** → **Providers** → **Kakao**
2. **Enable Sign in with Kakao** 켜기
3. 입력

| 칸 | 값 |
|---|---|
| Client ID (REST API Key) | 3단계의 **REST API 키** |
| Client Secret | 4단계에서 생성한 **Client Secret** |

4. **Save**

> Kakao 는 Supabase 가 기본 지원하는 provider 다. 직접 OAuth 를 구현하지 않는다.
> 목록에 Kakao 가 없다면 Supabase 프로젝트가 오래된 것이니 새로 만든다.

---

## 6. 돌아올 주소(Redirect URL) 등록

Supabase → **Authentication** → **URL Configuration**

**Site URL**

```
https://luke777-cpu.github.io/yakhyo-home/
```

**Redirect URLs** — 아래를 모두 추가한다. **끝의 `/` 를 빠뜨리지 않는다.**

```
https://luke777-cpu.github.io/yakhyo-home/auth/callback/
http://localhost:4321/auth/callback/
```

> 로컬은 `BASE_PATH` 없이 도는 것이 기본이라 경로에 `/yakhyo-home` 이 붙지 않는다.
> 나중에 Vercel 로 옮기면 그 도메인의 `/auth/callback/` 을 여기에 추가하면 된다.

---

## 7. Google OAuth 설정

1. https://console.cloud.google.com → 프로젝트 생성(또는 선택)
2. **API 및 서비스 → OAuth 동의 화면**
   - User Type: **외부**
   - 앱 이름 / 지원 이메일 입력
   - **범위(Scopes)** 는 기본값(`email`, `profile`)만. 추가하지 않는다
3. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - **승인된 리디렉션 URI** 에 4단계와 같은 주소를 넣는다

```
https://<프로젝트ref>.supabase.co/auth/v1/callback
```

4. 만들어진 **클라이언트 ID** 와 **클라이언트 보안 비밀번호**를 복사
5. Supabase → **Authentication → Providers → Google** 켜고 두 값을 붙여넣은 뒤 **Save**

| Google 콘솔 | Supabase |
|---|---|
| 클라이언트 ID | Client ID |
| 클라이언트 보안 비밀번호 | Client Secret |

---

## 8. DB 스키마 적용 — **건너뛰지 말 것**

1. Supabase → **SQL Editor** → **New query**
2. 저장소의 `supabase/schema.sql` **전체**를 붙여넣는다
3. **Run**

여러 번 실행해도 안전하게 써 두었다.

### 적용됐는지 확인

SQL Editor 에서:

```sql
select relname, relrowsecurity
from pg_class
where relname in ('profiles','posts','comments','reports');
```

**네 줄 모두 `relrowsecurity = true`** 여야 한다. 하나라도 `false` 면 그 테이블은 무방비다.

정책 목록도 확인:

```sql
select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by tablename, cmd;
```

`posts` 와 `comments` 에 **delete 정책이 없어야 정상이다.** 삭제는 `deleted_at` 로만 한다.

---

## 9. 환경변수 설정

### 로컬

저장소 루트에서 (PowerShell)

```powershell
Copy-Item .env.example .env
```

`.env` 를 열어 2단계의 두 값을 채운다.

```
PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### GitHub Pages 배포

빌드할 때 값이 필요하다. **Actions secret 이 아니라 variable 로 넣어도 된다** — anon key 는 어차피 브라우저로 나가는 값이다. 다만 실수로 다른 키를 넣는 일을 막기 위해 secret 을 권한다.

1. GitHub 저장소 → **Settings → Secrets and variables → Actions**
2. **New repository secret** 두 개
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`
3. `.github/workflows/deploy.yml` 의 `npm run build` 아래 `env:` 에 두 줄을 추가한다

```yaml
      - run: npm run build
        env:
          SITE_URL: https://luke777-cpu.github.io
          BASE_PATH: /yakhyo-home
          PUBLIC_SUPABASE_URL: ${{ secrets.PUBLIC_SUPABASE_URL }}
          PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.PUBLIC_SUPABASE_ANON_KEY }}
```

> **이 두 줄은 이번 브랜치에 미리 넣지 않았다.** 값이 없는 채로 main 에 들어가면
> 지금 잘 돌고 있는 배포가 빈 값으로 빌드된다. 위 1·2를 먼저 끝낸 뒤 추가하는 편이 안전하다.

---

## 10. 로컬 테스트

한 줄씩 실행한다 (PowerShell 에서 `&&` 금지).

```powershell
npm install
```

```powershell
npm run dev
```

브라우저에서 `http://localhost:4321/` 를 연다.

### 확인 순서

| # | 할 일 | 기대 결과 |
|---|---|---|
| 1 | `/questions/` 열기 | 목록이 뜬다(비어 있음). 로그인 없이 읽힌다 |
| 2 | `/login/` 열기 | 카카오 → Google → 이메일 순서로 보인다 |
| 3 | **카카오로 시작하기** | 카카오 로그인 창 → 동의 → `/auth/callback/` → `/profile/setup/` |
| 4 | 닉네임 입력 | `/questions/` 로 이동. 헤더에 닉네임이 뜬다 |
| 5 | **질문 쓰기** | 개인정보·의료 안내가 먼저 보인다. 올리면 상세로 이동 |
| 6 | 답글 쓰기 / 수정 / 삭제 | 본인 것만 수정·삭제 버튼이 보인다 |
| 7 | 로그아웃 후 `/questions/` | 목록은 여전히 읽힌다. 「질문 쓰기」를 누르면 `/login/` 으로 |

### RLS 가 실제로 막는지 확인 (권장)

브라우저 두 개(또는 시크릿 창)로 서로 다른 계정에 로그인한 뒤,
A 가 쓴 글의 주소를 B 가 `/questions/edit/?id=...` 로 직접 연다.

**「본인이 쓴 글만 수정할 수 있습니다」가 나와야 한다.**
화면 검사를 우회해 요청을 보내도 RLS 가 거부한다.

---

## 11. 문제가 생기면

| 증상 | 원인 |
|---|---|
| 「아직 로그인 설정이 끝나지 않았습니다」 | 9단계 환경변수 미설정. `npm run dev` 를 다시 시작해야 반영된다 |
| 「이 로그인 방법이 아직 Supabase 에서 켜지지 않았습니다」 | 5·7단계 provider 미활성 |
| 카카오 창에서 `KOE006` / redirect 오류 | 4단계 Redirect URI 오타. `https://<ref>.supabase.co/auth/v1/callback` 이어야 한다 |
| 로그인 후 빈 화면이나 원래 자리로 돌아옴 | 6단계 Redirect URLs 에 `/auth/callback/` 이 없음. **끝의 `/` 확인** |
| 글은 보이는데 쓰기가 안 됨 | 8단계 미적용, 또는 닉네임 미설정. `/profile/setup/` 확인 |
| 「권한이 없습니다」 | 정상이다. 남의 글을 고치려 한 경우 RLS 가 막은 것 |

---

## 12. v1 에 일부러 넣지 않은 것

- 이미지·파일 첨부
- 쪽지
- 추천 / 좋아요
- 카테고리
- 신고 **화면** (`reports` 테이블과 insert 정책만 준비. 운영 화면은 다음 단계)
- 관리자 기능

`reports` 는 **SELECT 정책이 없다.** anon/authenticated 키로는 아무도 읽을 수 없고,
운영자가 Supabase 대시보드에서만 본다. 신고 화면을 만들 때 관리자 판별 방식을 먼저 정해야 한다.

---

## 부록 A. 로컬 PostgreSQL 로 RLS 를 직접 검증하는 법

Supabase 에 올리기 전에 정책이 실제로 막는지 확인할 수 있다.
이 방법으로 실제 버그를 하나 잡았다 — 부록 B 참고.

`auth` 스키마와 `auth.uid()` 를 흉내내는 파일을 만든다.

```sql
-- shim.sql
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, auth to anon, authenticated;
```

한 줄씩 실행한다.

```
createdb rlstest
psql -d rlstest -f shim.sql
psql -d rlstest -f supabase/schema.sql
psql -d rlstest -c "grant select, insert, update on all tables in schema public to anon, authenticated;"
```

그다음 사용자를 흉내내어 시험한다.

```sql
set role authenticated;
set request.jwt.claim.sub = '<사용자 uuid>';
-- 이제부터의 쿼리는 그 사용자로 실행된다
```

**RLS 는 테이블 소유자와 superuser 에게는 적용되지 않는다.**
반드시 `set role authenticated` 또는 `set role anon` 을 한 뒤에 시험해야 의미가 있다.

---

## 부록 B. 소프트 삭제와 SELECT 정책의 관계 (중요)

`posts_select_live` 를 이렇게 두면 **본인조차 자기 글을 지울 수 없다.**

```sql
-- 이렇게 하면 안 된다
create policy posts_select_live on public.posts
  for select using (deleted_at is null and status = 'published');
```

PostgreSQL 은 `UPDATE` 할 때 **바뀐 뒤의 행이 SELECT 정책도 통과하는지** 본다.
소프트 삭제는 `deleted_at` 을 채우는 `UPDATE` 이므로, 새 행이 `deleted_at is null` 에 걸려
`new row violates row-level security policy` 로 거부된다.

그래서 작성자 본인 조건을 더했다.

```sql
create policy posts_select_live on public.posts
  for select using (
    (deleted_at is null and status = 'published')
    or auth.uid() = author_id
  );
```

이러면 **작성자에게는 자기가 지운 글도 보인다.** 목록에서 감추는 일은 클라이언트가 한다 —
게시판 쿼리마다 `.is('deleted_at', null)` 이 붙어 있다.
정책과 클라이언트 양쪽에서 거르므로, 한쪽을 고치더라도 지운 글이 남에게 노출되지는 않는다.

`comments_select_live` 도 같은 이유로 같은 모양이다.
