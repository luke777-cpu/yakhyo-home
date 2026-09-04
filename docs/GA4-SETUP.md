# 방문자 분석(GA4) 설정 순서

> 목적은 방문자 수 자체가 아니라 **어떤 글이 실제로 읽히는지, 한 편을 읽은 사람이 다음 편까지
> 이어서 읽는지**를 보는 것이다. 코드는 이미 다 들어 있다 — 이 문서는 GA4 콘솔에서 값을
> 만들고, 그 값을 저장소에 연결하고, 배포 후 확인하는 순서만 다룬다.

---

## 0. 무엇이 붙었는지

- `src/components/Analytics.astro` — GA4 로더. `BaseLayout.astro`(한국어)와
  `EnBaseLayout.astro`(영어) 양쪽의 공통 `<head>`에서 한 번만 불러온다. 페이지마다 따로
  붙이지 않는다.
- `src/scripts/analytics.ts` — `data-gtag-event` 속성이 붙은 요소를 클릭하면 GA4 이벤트를
  보내는 위임 클릭 리스너. `Analytics.astro`가 GA4를 켤 때만 불러온다.
- `PUBLIC_GA_MEASUREMENT_ID` 환경변수가 비어 있거나 로컬 개발(`astro dev`) 중이면
  **아무것도 렌더링되지 않는다.** 사이트는 원래대로 런타임 JavaScript가 없는 정적 페이지로
  남는다. 값을 채우고 production 빌드를 해야만 GA4가 켜진다.

기존 화면·기능(약효일지, 그래프, PHS, Firebase 인증, 질문게시판, 관리자 기능, 학습지도,
한/영 전환, GitHub Pages 배포)은 이번 작업에서 손대지 않았다. 분석 기능은 그 위에 얹은
독립된 기능이다.

---

## 1. GA4 속성 만들고 측정 ID 받기

1. [analytics.google.com](https://analytics.google.com) 에서 새 속성(Property)을 만든다.
   이름은 예: `약효일지 홈페이지`.
2. 데이터 스트림 → 웹 → URL에 실제 배포 주소를 넣는다.
   - GitHub Pages: `https://luke777-cpu.github.io/yakhyo-home`
3. 스트림 생성 후 보이는 **측정 ID**(`G-XXXXXXXXXX` 형태)를 복사해 둔다.

이 값은 Firebase 프로젝트의 `PUBLIC_FIREBASE_MEASUREMENT_ID`와 **다른 값**이다. 로그인
사용자 정보와 분석 데이터를 직접 연결하지 않기 위해 일부러 나눠 두었다 — Firebase Analytics
SDK(`firebase/analytics`)는 이 프로젝트 어디에서도 쓰지 않는다.

---

## 2. 환경변수 연결

### 로컬

`.env.example`을 `.env`로 복사한 뒤 값을 채운다.

```
PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

로컬에서는 `npm run build && npm run preview`로 확인한다(`npm run dev`는 항상 GA4가 꺼져
있다 — 새로고침이 방문자로 잡히는 것을 막기 위한 장치).

### GitHub Pages 배포

저장소 Settings → Secrets and variables → Actions → **Variables** 탭에서
`PUBLIC_GA_MEASUREMENT_ID`를 추가한다(`PUBLIC_FIREBASE_*`와 같은 자리).
`.github/workflows/deploy.yml`이 빌드 시 이 값을 읽어 넣는다. 코드에는 측정 ID를
하드코딩하지 않는다.

---

## 3. 이벤트 목록 (1차 도입)

너무 많은 이벤트를 한 번에 만들지 않는다는 원칙에 따라 아래 네 개만 우선 붙였다. GA4
자동 `page_view`(모든 페이지 이동에서 자동 발생)와 함께 쓰면 아래 질문에 답할 수 있다.

| 이벤트 | 언제 발생 | 파라미터 | 어디 붙어 있나 |
|---|---|---|---|
| `course_card_click` | 홈(`/`)과 배우기 목록(`/learn/`)의 강좌 카드를 눌렀을 때 | `course_name`: `pharmacology` \| `neuroanatomy` \| `learning_map` | `src/pages/index.astro`, `src/pages/learn/index.astro`, `src/pages/en/index.astro` |
| `learning_map_click` | 학습지도(`/learn/map/`, `/en/learn/map/`)에서 링크를 눌렀을 때 | `branch`: `record` \| `graph` \| `learn` \| `community` \| `app`, `label`: 링크 글자 그대로 | `src/components/LearnMapTree.astro` |
| `series_navigation` | 연재 글 하단의 이전/다음 이동을 눌렀을 때 | `series_name`(예: `pharmacology`), `current_article`(지금 글의 slug), `direction`: `prev` \| `next` | `src/components/PrevNextNav.astro` |
| `question_board_click` | 상단/모바일 메뉴에서 질문게시판을 눌렀을 때 | `source`: `header` \| `mobile_nav` | `src/components/Header.astro`, `src/components/MobileNav.astro` |

`learning_map_click`은 학습지도 안의 모든 링크(약리학·신경해부학·질문게시판 포함)를
`branch`/`label`로 함께 잡으므로, "약리학 클릭 수" 같은 개별 질문은 GA4 탐색 보고서에서
`label`로 필터링하면 된다.

연재가 3부, 4부로 늘어나도 이 표를 다시 손볼 필요는 없다 — `PrevNextNav`는
`series.json`의 실제 목차를 그대로 따라간다.

새 이벤트가 필요해지면 마크업에 `data-gtag-event="이벤트이름"`과
`data-gtag-무엇="값"`(예: `data-gtag-foo-bar="x"` → `{ foo_bar: "x" }`)만 추가하면 된다.
`src/scripts/analytics.ts`를 고칠 필요는 없다.

---

## 4. 한국어/영어 구분

기본은 URL이다 — 영문판은 전부 `/en/` 아래에 있으므로 GA4 보고서에서 페이지 경로를
`/en/`으로 필터링하면 별도 설정 없이 바로 나뉜다.

추가로 모든 자동 `page_view`에 `content_language` 파라미터(`ko` \| `en`)를 함께 보낸다.
GA4 관리자 화면 → 맞춤 정의 → 맞춤 측정기준에서 같은 이름(`content_language`)으로 등록해야
보고서 화면에 열로 나타난다(등록 전 데이터도 보존되며, 등록 시점부터 소급 적용된다).

---

## 5. 보내지 않는 것

- 이름, 이메일, 로그인 ID, Firebase Auth 사용자 정보
- 약물 기록, PHS 내용, 출력 기록 등 개인 건강 데이터
- 질문게시판의 글 제목·본문·닉네임 — 게시판 페이지 방문 자체는 자동 `page_view`로 잡히지만,
  글 내용을 이벤트 값으로 보내는 코드는 어디에도 없다(`src/pages/questions/*.astro`는
  이번 작업에서 건드리지 않았다)
- `document.title`을 글 내용으로 바꾸는 곳이 없으므로, 자동 `page_view`가 수집하는
  페이지 제목에도 게시글 내용이 섞이지 않는다

---

## 6. 배포 후 확인

1. GA4 좌측 메뉴 **Realtime**(또는 DebugView)을 열어 둔다.
2. 배포된 사이트에서 아래 순서로 직접 클릭해 본다.
   - 홈 접속 → 약리학 카드 클릭 → 약리학 1부 열기 → 다음 글 이동 → 학습지도 이동
3. 각 단계가 Realtime에 이벤트로 잡히는지 확인한다. 잡히지 않으면 먼저
   `PUBLIC_GA_MEASUREMENT_ID`가 GitHub repository variable에 실제로 저장되어 있는지,
   빌드 로그에 그 값이 전달되었는지부터 확인한다.
