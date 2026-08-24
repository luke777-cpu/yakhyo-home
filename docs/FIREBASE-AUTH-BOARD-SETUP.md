# Firebase 인증 · 질문게시판 설정 순서

> 코드는 `feature/auth-board-v1` 브랜치에 다 들어 있다.
> **이 문서의 순서대로 콘솔 설정을 마쳐야 로그인이 동작한다.**
> 설정 전에는 화면이 정상으로 뜨되, 로그인 버튼을 누르면 안내 문구가 나온다.

**PowerShell 에서는 `&&` 를 쓰지 않는다.** 명령을 한 줄에 하나씩 실행한다.

---

## 0. 먼저 알아둘 것

### 이 사이트는 서버가 없다

정적 빌드(GitHub Pages)를 그대로 유지한다. Firebase 전환 때문에 SSR 로 바꾸지 않았다.
인증과 게시판은 **브라우저에서** Firebase 와 직접 통신한다.

그래서 **접근 제어는 화면이 아니라 `firestore.rules` 가 한다.**
6단계(Rules 배포)를 건너뛰면 게시판이 동작하지 않거나, 최악의 경우 아무나 아무 문서나 고칠 수 있다.

### 두 종류의 값

| | 브라우저 노출 | 이 프로젝트에서 |
|---|---|---|
| **web config** (`apiKey`, `authDomain`, `projectId`, `appId` …) | **정상** | `PUBLIC_FIREBASE_*` 로 쓴다 |
| **service account JSON / private key** | **절대 금지** | 어디에도 넣지 않는다 |

`apiKey` 라는 이름 때문에 비밀처럼 보이지만 **비밀키가 아니다.** 프로젝트를 가리키는 식별자이고,
브라우저에 나가는 것이 정상이다. 실제로 막는 것은 Rules 와 승인된 도메인 목록이다.

반대로 service account key 는 **Rules 를 통째로 무시한다.** 나중에 카카오 로그인을 붙일 때
서버(Cloud Functions) 안에서만 쓴다. → `docs/FIREBASE-KAKAO-AUTH.md`

### Supabase 에서 넘어온 이유

실제 운영 데이터를 넣기 전이라 **옮길 데이터가 없었다.** 그래서 마이그레이션 없이 갈아탔다.
부모님 추모 홈페이지의 Supabase 프로젝트는 **건드리지 않았다.** 두 프로젝트는 이제 완전히 갈라져 있다.

---

## 1. Firebase 프로젝트 만들기

**약효일지 전용 프로젝트를 새로 만든다.** 다른 프로젝트를 재사용하지 않는다.

1. https://console.firebase.google.com → **프로젝트 추가**
2. 이름: `yakhyo-home` (원하는 이름)
3. Google 애널리틱스: **사용 안 함**을 권한다. v1 에서 쓰지 않는다
4. 생성에 1분쯤 걸린다

---

## 2. 웹 앱 추가하고 config 복사

1. 프로젝트 개요 화면에서 **웹 아이콘 `</>`** 클릭
2. 앱 닉네임: `yakhyo-home-web`
3. **"Firebase Hosting도 설정하기" 는 체크하지 않는다** — 이 사이트는 GitHub Pages 에 있다
4. 나오는 `firebaseConfig` 를 그대로 옮겨 적는다

| 화면의 이름 | 넣을 곳 |
|---|---|
| `apiKey` | `PUBLIC_FIREBASE_API_KEY` |
| `authDomain` | `PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `PUBLIC_FIREBASE_PROJECT_ID` |
| `storageBucket` | `PUBLIC_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` | `PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `PUBLIC_FIREBASE_APP_ID` |
| `measurementId` (있을 때만) | `PUBLIC_FIREBASE_MEASUREMENT_ID` |

나중에 다시 보려면 **⚙ 프로젝트 설정 → 일반 → 내 앱**.

---

## 3. Authentication 켜기

1. 왼쪽 메뉴 **빌드 → Authentication** → **시작하기**
2. **Sign-in method** 탭

---

## 4. Google provider 켜기 · 승인된 도메인 등록

### Google 켜기

1. **Sign-in method → 새 제공업체 추가 → Google**
2. **사용 설정** 켜기
3. **프로젝트 지원 이메일** 선택 (필수)
4. 저장

### 승인된 도메인 — **빠뜨리면 로그인이 안 된다**

**Authentication → Settings → 승인된 도메인**에 아래를 추가한다.

```
luke777-cpu.github.io
localhost
```

`localhost` 는 기본으로 들어 있는 경우가 많다. `github.io` 는 **직접 추가해야 한다.**
없으면 로그인 시 `auth/unauthorized-domain` 오류가 난다.

> **왜 popup 방식인가.**
> Firebase 의 인증 iframe 은 `<프로젝트>.firebaseapp.com` 에 있다. 우리 사이트는 `github.io` 라
> 서로 다른 도메인이고, `signInWithRedirect` 는 서드파티 저장소 접근에 기대기 때문에
> Safari 16.1+ · Firefox 109+ · Chrome M115+ 에서 깨진다.
> 그래서 **`signInWithPopup` 을 쓴다.** 팝업은 창 사이 postMessage 를 써서 그 영향을 받지 않는다.
> 참고: https://firebase.google.com/docs/auth/web/redirect-best-practices

### 이메일/비밀번호 켜기

1. **새 제공업체 추가 → 이메일/비밀번호**
2. **사용 설정** 켜기 (이메일 링크 방식은 켜지 않아도 된다)
3. 저장

> **v1 에서는 메일 확인을 강제하지 않는다.** 가입 즉시 쓸 수 있고, 확인 메일은 보내되
> 링크를 누르지 않아도 막지 않는다. 확인을 강제하면 메일이 스팸함에 들어갔을 때
> 사용자가 아무것도 못 하게 되기 때문이다. 나중에 필요하면 `firestore.rules` 에
> `request.auth.token.email_verified == true` 를 더해 조일 수 있다.

### 카카오

**지금은 켤 수 없다.** Firebase 가 기본 제공하지 않는다.
이유와 나중에 붙일 안전한 방법은 **`docs/FIREBASE-KAKAO-AUTH.md`** 에 따로 정리했다.
화면에는 `카카오로 시작하기 (준비 중)` 으로 비활성 버튼이 있다.

---

## 5. Firestore 만들기

1. **빌드 → Firestore Database** → **데이터베이스 만들기**
2. 모드: **프로덕션 모드에서 시작** — 테스트 모드는 30일 뒤 모두 열린다. 고르지 않는다
3. 위치: **asia-northeast3 (서울)**
4. 만들기

이 시점에는 아무도 아무것도 못 읽는다. 다음 단계에서 Rules 를 올린다.

---

## 6. Rules 와 색인 배포 — **건너뛰지 말 것**

### 방법 A. 콘솔에 붙여넣기 (간단)

1. **Firestore Database → 규칙** 탭
2. 저장소의 `firestore.rules` **전체**를 붙여넣고 **게시**
3. **Firestore Database → 색인** 탭 → `firestore.indexes.json` 의 세 색인을 손으로 만든다

### 방법 B. CLI (권장 — 색인까지 한 번에)

한 줄씩 실행한다.

```
npx firebase login
```

```
npx firebase use --add
```

(목록에서 1단계에서 만든 프로젝트를 고른다)

```
npx firebase deploy --only firestore:rules,firestore:indexes
```

### 확인

**Firestore Database → 규칙** 탭 맨 위가 `rules_version = '2';` 로 시작하고,
`match /{document=**} { allow read, write: if false; }` 가 맨 아래에 있어야 한다.

**색인** 탭에 세 개가 `사용 설정됨` 이 되어야 한다. 만들어지는 데 몇 분 걸린다.
색인이 없으면 목록 화면에서 "데이터베이스 색인이 아직 만들어지지 않았습니다" 가 뜬다.

---

## 7. 환경변수 설정

### 로컬

저장소 루트에서 (PowerShell)

```powershell
Copy-Item .env.example .env
```

`.env` 를 열어 2단계의 값을 채운다.

### GitHub Pages 배포

빌드할 때 값이 필요하다.

1. GitHub 저장소 → **Settings → Secrets and variables → Actions**
2. **New repository secret** 으로 여섯 개를 넣는다
   `PUBLIC_FIREBASE_API_KEY` · `PUBLIC_FIREBASE_AUTH_DOMAIN` · `PUBLIC_FIREBASE_PROJECT_ID` ·
   `PUBLIC_FIREBASE_STORAGE_BUCKET` · `PUBLIC_FIREBASE_MESSAGING_SENDER_ID` · `PUBLIC_FIREBASE_APP_ID`
3. `.github/workflows/deploy.yml` 의 `npm run build` 아래 `env:` 에 여섯 줄을 더한다

```yaml
      - run: npm run build
        env:
          SITE_URL: https://luke777-cpu.github.io
          BASE_PATH: /yakhyo-home
          PUBLIC_FIREBASE_API_KEY: ${{ secrets.PUBLIC_FIREBASE_API_KEY }}
          PUBLIC_FIREBASE_AUTH_DOMAIN: ${{ secrets.PUBLIC_FIREBASE_AUTH_DOMAIN }}
          PUBLIC_FIREBASE_PROJECT_ID: ${{ secrets.PUBLIC_FIREBASE_PROJECT_ID }}
          PUBLIC_FIREBASE_STORAGE_BUCKET: ${{ secrets.PUBLIC_FIREBASE_STORAGE_BUCKET }}
          PUBLIC_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.PUBLIC_FIREBASE_MESSAGING_SENDER_ID }}
          PUBLIC_FIREBASE_APP_ID: ${{ secrets.PUBLIC_FIREBASE_APP_ID }}
```

> **이 여섯 줄은 이번 브랜치에 미리 넣지 않았다.** 값이 없는 채로 main 에 들어가면
> 지금 잘 돌고 있는 배포가 빈 값으로 빌드된다. 1·2단계를 먼저 끝낸 뒤 추가하는 편이 안전하다.

---

## 8. 로컬 테스트

한 줄씩 실행한다.

```powershell
npm install
```

```powershell
npm run dev
```

브라우저에서 `http://localhost:4321/` 를 연다.

| # | 할 일 | 기대 결과 |
|---|---|---|
| 1 | `/questions/` | 목록이 뜬다(비어 있음). 로그인 없이 읽힌다 |
| 2 | `/login/` | 카카오(준비 중) → Google → 이메일 순서 |
| 3 | **Google로 계속하기** | 팝업 → 계정 선택 → `/profile/setup/` |
| 4 | 닉네임 입력 | `/questions/` 로 이동. 헤더에 닉네임이 뜬다 |
| 5 | **질문 쓰기** | 개인정보·의료 안내가 먼저 보인다. 올리면 상세로 |
| 6 | 답글 · 수정 · 삭제 | 본인 것만 버튼이 보인다 |
| 7 | 다른 계정으로 같은 닉네임 | **"이미 쓰고 있는 닉네임입니다"** |
| 8 | 로그아웃 후 `/questions/` | 목록은 읽힌다. 「질문 쓰기」는 `/login/` 으로 |

### Rules 를 직접 시험하기

```
npm run test:rules
```

에뮬레이터를 자동으로 받아(최초 1회 약 137MB) 45개 시나리오를 돌린다.
**Rules 를 고칠 때마다 이 명령을 돌린다.** 콘솔에 올리기 전에 여기서 걸러진다.

---

## 9. 문제가 생기면

| 증상 | 원인 |
|---|---|
| 「아직 로그인 설정이 끝나지 않았습니다」 | 7단계 환경변수 미설정. `npm run dev` 를 다시 시작해야 반영된다 |
| `auth/unauthorized-domain` | 4단계 승인된 도메인에 `luke777-cpu.github.io` 가 없다 |
| 「이 로그인 방법이 아직 Firebase 에서 켜지지 않았습니다」 | 4단계 provider 미활성 |
| 팝업이 안 열림 | 브라우저가 막았거나 인앱 브라우저다. 크롬·사파리로 열거나 이메일 로그인 |
| 「데이터베이스 색인이 아직…」 | 6단계 색인 미배포 또는 생성 중 |
| 목록이 비어 있는데 글은 있다 | Rules 미배포. 질의에 `deletedAt == null` 이 없으면 Rules 가 거부한다 |
| 「권한이 없습니다」 | 정상이다. 남의 글을 고치려 한 경우 Rules 가 막은 것 |

---

## 10. 데이터 구조와 알아둘 점

### 컬렉션

| 컬렉션 | 문서 id | 필드 |
|---|---|---|
| `yakhyo_profiles` | Firebase `uid` | `nickname` `createdAt` `updatedAt` |
| `yakhyo_nicknames` | 정규화한 닉네임 | `uid` `nickname` `createdAt` |
| `yakhyo_posts` | 자동 | `authorId` `authorNickname` `title` `body` `status` `createdAt` `updatedAt` `deletedAt` |
| `yakhyo_comments` | 자동 | `postId` `authorId` `authorNickname` `body` `createdAt` `updatedAt` `deletedAt` |
| `yakhyo_reports` | 자동 | `reporterId` `targetType` `targetId` `reason` `createdAt` |

**실명·전화번호·주소 필드가 없다.** 이메일은 Firebase Auth 에만 있고 Firestore 로 복사하지 않는다.

### 닉네임 중복은 어떻게 막나

Firestore 에는 SQL 의 `UNIQUE` 가 없다. "먼저 조회해서 없으면 저장"은 두 사람이 동시에 하면 둘 다 통과한다.

그래서 `yakhyo_nicknames/{정규화된 닉네임}` 문서를 **예약**으로 쓰고,
**예약 확보와 프로필 저장을 하나의 트랜잭션으로 묶는다.** 예약 문서가 이미 있으면 트랜잭션이 실패한다.

정규화는 `앞뒤 공백 제거 → 소문자 → 연속 공백을 하나로` 다.
`아침산책` 과 `아침산책 ` 은 같은 이름으로 본다.

이름을 바꾸면 옛 예약 문서를 지운다. 안 지우면 그 이름이 영영 잠긴다.

### 닉네임을 바꾸면 옛 글은?

**예전 닉네임이 그대로 남는다.**

Firestore 에는 join 이 없어서 글마다 `authorNickname` 을 복사해 둔다(denormalize).
그래야 목록을 한 번의 읽기로 그릴 수 있다 — 글마다 프로필을 따로 읽으면 읽기 횟수가 글 수만큼 늘고,
그것이 그대로 비용이 된다.

옛 글을 모두 고치려면 글 수만큼 쓰기가 필요하다. v1 에서는 하지 않는다.
`/profile/setup/` 에서 이름을 바꿀 때 이 점을 화면에 안내한다.

바꾸고 싶어지면 두 가지 길이 있다.
1. 표시할 때 `authorId` 로 프로필을 다시 읽는다 → 읽기 비용이 는다
2. 이름 변경 시 Cloud Functions 가 옛 글을 일괄로 고친다 → 서버가 필요하다

### 읽기 비용

- 목록은 한 번에 **20개**만 읽고 「더 보기」로 이어 붙인다.
- **실시간 listener 를 쓰지 않는다.** 화면이 열려 있는 동안 계속 과금되기 때문이다.
  `getDocs` 로 필요할 때만 읽는다.
- 목록에 답글 수를 보여주지 않는다. 세려면 답글을 다 읽어야 해서 읽기가 몇 배로 는다.

### 시각

모든 시각은 `serverTimestamp()` 로 넣는다. Rules 가 `request.time` 과 같은지 확인하므로
**클라이언트가 시각을 위조할 수 없다.** 서버가 값을 넣기 전에는 잠깐 `null` 일 수 있어
화면에서는 그때 `방금` 으로 보여준다.

---

## 11. v1 에 일부러 넣지 않은 것

- **카카오 로그인** (→ `docs/FIREBASE-KAKAO-AUTH.md`)
- 이미지·파일 첨부, Cloud Storage
- FCM 푸시, Analytics, Crashlytics
- 쪽지 · 추천 · 카테고리
- 신고 **화면** (`yakhyo_reports` 컬렉션과 create 규칙만 준비)
- 관리자 기능

`yakhyo_reports` 는 **read 규칙이 없다.** 클라이언트에서는 아무도 읽을 수 없고,
운영자가 Firebase 콘솔에서만 본다. 신고 화면을 만들 때 관리자 판별 방식을 먼저 정해야 한다.

### 안드로이드 앱과의 연결

약효일지 앱이 Google Play 에 있으므로, 나중에 같은 Firebase 프로젝트에
**Android 앱을 추가**하면 인증·FCM·Analytics 를 함께 쓸 수 있다.
그때 홈페이지와 앱이 **같은 uid 체계**를 쓰게 되므로, 지금 uid 규칙을 흔들지 않는 편이 좋다.
이번 작업에서는 구조만 열어 두고 아무것도 구현하지 않았다.
