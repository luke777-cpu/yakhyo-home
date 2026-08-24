# 운영자(관리자) 권한 설정

이 문서는 게시판 운영자를 지정하는 방법을 설명한다. 코드가 아니라 **사람이 한 번 해야
하는 절차**다.

## 왜 custom claim 인가

이 사이트는 서버가 없다(정적 배포). 브라우저에서 도는 코드는 사용자가 얼마든지
고칠 수 있으므로, 화면의 어떤 검사도 보안이 아니다. 아래는 전부 **관리자 판별
근거로 쓰면 안 되는 것**들이다.

- `if (user.email === '...')` — 화면 코드는 조작할 수 있고, Rules 에서 이메일을
  안전하게 비교할 방법도 마땅치 않다.
- `localStorage` 의 값 — 아무나 브라우저 개발자 도구로 넣을 수 있다.
- Firestore 프로필의 `role: 'admin'` 필드 — 그 필드를 쓰는 규칙 자체를 뚫으면
  그만이고, 규칙 실수 한 번에 권한 상승 통로가 된다.

**Firebase Auth custom claim** 은 다르다. ID token 안에 서명되어 들어오는 값이라
클라이언트가 위조할 수 없고, 발급은 **Firebase Admin SDK(서버 환경)만** 할 수 있다.
그래서 Firestore Security Rules 에서 `request.auth.token.admin == true` 로 검사하면,
화면이 통째로 해킹되어도 관리자 권한을 얻을 수 없다.

이 저장소의 Rules 는 이미 그렇게 되어 있다(`isAdmin()` — firestore.rules).
남은 일은 실제 운영자 계정에 claim 을 한 번 붙이는 것이다.

## 관리자 지정 (1회성 로컬 스크립트)

Admin SDK 는 service account 로 인증한다. **private key 는 절대 이 저장소에
넣지 않는다** — 로컬 파일로만 두고, 경로는 환경변수로 넘긴다.

1. Firebase Console → 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성** →
   내려받은 JSON 을 저장소 밖의 안전한 위치에 둔다. 예: `~/secrets/yakhyo-admin.json`
2. 대상 계정의 **uid** 를 확인한다. Firebase Console → Authentication → 사용자
   목록에서 해당 이메일의 "사용자 UID" 를 복사한다.
3. 아무 폴더에서(저장소 밖 권장) 아래 스크립트를 만든다. `set-admin.mjs`:

```js
// 실행: GOOGLE_APPLICATION_CREDENTIALS=~/secrets/yakhyo-admin.json node set-admin.mjs <uid>
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const uid = process.argv[2];
if (!uid) { console.error('사용법: node set-admin.mjs <uid>'); process.exit(1); }

initializeApp({ credential: applicationDefault() });
await getAuth().setCustomUserClaims(uid, { admin: true });
console.log(`admin: true 를 부여했습니다 — ${uid}`);
```

4. 실행:

```
npm init -y && npm install firebase-admin
GOOGLE_APPLICATION_CREDENTIALS=~/secrets/yakhyo-admin.json node set-admin.mjs <대상uid>
```

## 권한 제거

같은 스크립트에서 claim 을 비우면 된다.

```js
await getAuth().setCustomUserClaims(uid, { admin: null });   // 또는 {}
```

## 반드시 알아야 할 것: token 은 바로 안 바뀐다

custom claim 은 **ID token 이 새로 발급될 때** 반영된다. token 수명은 1시간이다.
claim 을 바꾼 직후에는:

- 대상 계정에서 **로그아웃 후 다시 로그인**하는 것이 가장 확실하다.
- 또는 클라이언트에서 `user.getIdTokenResult(true)` 로 강제 갱신한다
  (사이트의 `getAdminStatus(true)` 가 이 경로다).

권한을 **제거**했을 때도 같다 — 기존 token 이 만료될 때까지(최대 1시간) 옛 권한이
남는다. 급히 끊어야 하면 Admin SDK 의 `revokeRefreshTokens(uid)` 를 함께 쓴다.

## v1 에서 하지 않는 것 (다음 단계)

- **계정 강제 삭제·정지**: Admin SDK 서버(또는 Cloud Functions)가 필요하다.
  지금은 `yakhyo_bans` 로 게시판 이용만 제한한다 — 읽기는 되고 쓰기만 막힌다.
- **Cloud Functions 배포**: 신고 접수 시 알림 등은 별도 단계로 미룬다.
- claim 발급용 **관리 서버**: 운영자가 여러 명으로 늘면 그때 만든다.
  지금은 위의 1회성 로컬 스크립트로 충분하다.
