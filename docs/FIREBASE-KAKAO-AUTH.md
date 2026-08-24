# 카카오 로그인 — 왜 v1 에서 보류하는가

> **결론부터.** Firebase 는 카카오를 기본 제공하지 않는다.
> 안전하게 붙이려면 **신뢰할 수 있는 서버**가 하나 필요하고, 지금 이 사이트에는 그것이 없다.
> 그래서 v1 에서는 `카카오로 시작하기` 버튼을 **비활성**으로 두고, Google 과 이메일만 연다.
>
> 허술하게 붙이는 것보다 보류하는 편이 낫다는 판단이다. 이 문서는 그 근거와 나중에 할 일을 적어 둔 것이다.

---

## 1. Firebase 가 기본 제공하는 provider 에 카카오는 없다

Firebase Authentication 이 콘솔에서 켜기만 하면 되는 provider 는 Google · Apple · Facebook ·
X(Twitter) · GitHub · Microsoft · Yahoo · 전화번호 · 이메일 · 익명 정도다.
**카카오는 여기에 없다.** 국내 서비스라 Firebase 의 기본 목록에 들어 있지 않다.

Firebase 가 열어 둔 길은 두 가지다.

| 방법 | 카카오에 쓸 수 있나 |
|---|---|
| **OIDC / SAML provider** (Identity Platform 업그레이드 필요) | 카카오가 표준 OIDC Discovery 를 제공하지 않아 그대로 꽂히지 않는다 |
| **Custom Authentication** (직접 만든 토큰으로 로그인) | **이 길로 가야 한다** |

---

## 2. Custom Authentication 이 무엇을 요구하는가

Custom Auth 는 이렇게 동작한다.

```
카카오 로그인 → 카카오 access token
      ↓
  [ 내 서버 ]  ← 여기가 반드시 있어야 한다
      ↓ 카카오에 토큰을 물어 사용자 확인
      ↓ Firebase Admin SDK 로 custom token 발급
      ↓
클라이언트가 signInWithCustomToken(customToken)
```

가운데 `[ 내 서버 ]` 가 필요한 이유는 **Firebase Admin SDK 가 service account private key 를 쓰기 때문**이다.
그 키는 프로젝트의 모든 데이터에 무제한 접근할 수 있고 **Security Rules 를 통째로 무시한다.**

---

## 3. 그래서 브라우저에서 할 수 없다

이 사이트는 GitHub Pages 정적 배포다. 서버가 없다.
브라우저 안에서 카카오 로그인을 끝내려면 다음 중 하나를 해야 하는데, 둘 다 하면 안 된다.

| 하면 안 되는 일 | 무슨 일이 벌어지나 |
|---|---|
| **service account private key 를 클라이언트에 넣는다** | 소스를 열어보는 누구나 그 키를 가져간다. 그 키를 가진 사람은 **Rules 를 무시하고 모든 문서를 읽고 지울 수 있다.** 게시판만이 아니라 프로젝트 전체다 |
| **Kakao REST API client secret 을 클라이언트에 넣는다** | 다른 사람이 우리 앱인 척 카카오 토큰을 받아갈 수 있다 |
| **카카오 access token 을 그대로 믿고 사용자라고 인정한다** | 아무 카카오 앱에서 받은 토큰으로도 로그인이 된다. 남의 계정으로 들어가는 길이 열린다 |

세 번째가 특히 위험하다. **토큰이 "우리 앱을 위해" 발급된 것인지 확인하는 일은 서버에서만 할 수 있다.**
브라우저에서 확인하는 코드는 브라우저에서 지울 수도 있기 때문이다.

**이 세 가지를 하지 않기로 했다.** 그래서 v1 에서 카카오는 보류다.

---

## 4. 나중에 할 안전한 흐름

서버 한 조각만 있으면 된다. Cloud Functions for Firebase 가 가장 가깝다
(Firebase 프로젝트 안에 있어 Admin SDK 자격 증명이 자동으로 붙는다).

```
1. 브라우저: 카카오 로그인 → access token 획득
2. 브라우저 → Functions:  POST /kakaoLogin  { accessToken }
3. Functions: 카카오 API 로 토큰 검증
      GET https://kapi.kakao.com/v1/user/access_token_info
      Authorization: Bearer <accessToken>
   - 여기서 app_id 가 **우리 앱 id 와 같은지** 반드시 확인한다.
     이 한 줄이 "남의 앱 토큰으로 로그인"을 막는다.
4. Functions: 카카오 사용자 id 로 Firebase uid 를 정한다  (예: `kakao:1234567890`)
5. Functions: admin.auth().createCustomToken(uid)  → customToken 반환
6. 브라우저: signInWithCustomToken(customToken)
7. 이후는 Google·이메일 로그인과 완전히 같다. Rules 도 그대로 적용된다.
```

### 이때 지킬 것

| 항목 | 이유 |
|---|---|
| service account key 는 **Functions 안에서만** | 브라우저로 나가면 프로젝트 전체가 열린다 |
| Kakao client secret 도 **Functions 안에서만** | Functions 환경 설정(secret)에 둔다 |
| 3번의 **app_id 확인을 생략하지 않는다** | 이것이 없으면 검증한 척만 하는 것이다 |
| Functions 에 **호출 빈도 제한** | custom token 발급은 공짜가 아니고, 남용되면 비용이 된다 |
| uid 규칙을 **처음에 정하고 바꾸지 않는다** | uid 가 바뀌면 그 사람이 쓴 글의 `authorId` 와 끊어진다 |

### 계정 연결(같은 사람이 카카오와 Google 둘 다 쓸 때)

v1 에서는 생각하지 않는다. 나중에 붙일 때 `linkWithCredential` 또는
이메일 기준 병합을 **미리 정하고** 시작해야 한다. 나중에 고치면 이미 쌓인 글의 주인이 갈라진다.

---

## 5. 지금 화면은 어떻게 되어 있나

- `/login/` 맨 위에 **카카오 버튼이 그대로 있다.** 다만 `disabled` 이고 `(준비 중)` 이라고 적혀 있다.
- 눌러 보면 왜 준비 중인지 한 문장으로 알려 준다.
- 코드에서 여는 스위치는 `src/lib/firebase.ts` 의 `KAKAO_ENABLED` 하나다.
  Functions 가 준비되면 이 값과 버튼 동작만 바꾸면 된다.

```ts
// src/lib/firebase.ts
export const KAKAO_ENABLED = false;
```

**카카오 앱 키를 코드에 넣어 두지 않았다.** 지금 넣어 둘 이유가 없고,
넣어 두면 나중에 "이미 있으니 그냥 쓰자"가 되기 쉽다.

---

## 6. 그때까지 한국 사용자는 어떻게 하나

Google 과 이메일 두 가지가 열려 있다.

한 가지 실제 문제는 **카카오톡·인스타그램 인앱 브라우저**다.
이런 브라우저는 팝업을 막는 경우가 많아 Google 로그인이 열리지 않을 수 있다.
그래서 팝업이 막히면 이렇게 안내한다.

> 브라우저가 로그인 창을 막았습니다. 팝업을 허용하시거나, 카카오톡·인스타그램 안에서 열었다면 크롬·사파리로 열어 주세요. 이메일 로그인도 됩니다.

**이메일 로그인이 인앱 브라우저의 대비책이다.** 팝업이 필요 없기 때문이다.
