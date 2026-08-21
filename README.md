# 약효일지 공식 홈페이지

파킨슨 약효 변화를 기록하고, 자신의 패턴을 이해하고, 치료진과 더 정확하게 이야기하기 위한 사이트.

- 정적 사이트 (Astro, 런타임 JavaScript 없음 — 모바일 메뉴 토글만 예외)
- 1차 배포: GitHub Pages
- 개인 의료 데이터를 서버로 보내는 코드는 없다

## 개발

```bash
npm install
npm run dev        # http://localhost:4321/yakhyo-home/
npm run build      # dist/ 생성
npm run preview    # 빌드 결과 확인
```

## 배포 주소 바꾸기

저장소 이름이나 호스팅 경로는 소스 어디에도 하드코딩되어 있지 않다.
`astro.config.mjs`가 환경변수 두 개만 읽는다.

| | `SITE_URL` | `BASE_PATH` |
|---|---|---|
| GitHub Pages | `https://luke777-cpu.github.io` | `/yakhyo-home` |
| Vercel | `https://<도메인>` | `/` |

GitHub Pages 값은 `.github/workflows/deploy.yml`에 들어 있다.
Vercel로 옮길 때는 Vercel 환경변수에 같은 이름으로 넣고 워크플로를 지우면 된다.
사이트 안의 모든 링크는 `src/lib/url.ts`의 `url()`을 거치므로 그 외에 고칠 곳이 없다.

## 내용 고치기

글과 목록은 코드가 아니라 데이터 파일에 있다.

| 고치고 싶은 것 | 파일 |
|---|---|
| 개념 글 (약효 이해하기) | `src/content/understand/*.md` |
| 개념 목록·공개 여부 | `src/data/concepts.json` |
| 그래프 읽기 목록 | `src/data/graph-patterns.json` |
| 홈의 "겪는 현상" 목록 | `src/data/symptoms.json` |
| 약효일지 하위 항목 | `src/data/diary-topics.json` |
| 배우기 글·분류 | `src/data/articles.json`, `learn-categories.json` |
| YouTube 영상 | `src/data/videos.json` |
| 이야기 업데이트 기록 | `src/data/story-updates.json` |
| 앱·스토어·채널 주소 | `src/data/links.json` |
| 상단 메뉴 | `src/data/nav.json` |

목록 항목의 `status`를 `preparing`에서 `published`로 바꾸면 링크가 살아난다.
글이 없는 상태에서 링크만 걸리는 일을 막기 위한 장치다.

## 예시 그래프

사이트에 나오는 모든 곡선은 `scripts/gen-curves.mjs`가 만든 교육용 예시다.
실제 혈중 농도나 개인의 반응을 예측하지 않는다.

```bash
node scripts/gen-curves.mjs     # src/data/curves/*.json 다시 생성
```

곡선 모양을 바꾸려면 그 스크립트의 `CURVES` 배열만 고친다.
JSON을 손으로 고치지 않는다 — 다음 실행에서 덮어써진다.

## 공유 미리보기 이미지 (OG image)

`public/images/og/default.png` 한 장을 모든 페이지가 함께 쓴다.

```bash
node scripts/gen-og.mjs     # scripts/og/og-card.html 생성
```

만들어진 HTML을 브라우저에서 열어 **1200×630** 으로 캡처해
`public/images/og/default.png` 로 덮어쓴다.
곡선은 `src/data/curves/day-typical.json` 에서 계산하므로, 곡선을 바꾸면
스크립트를 다시 돌리는 것만으로 같은 모양이 따라온다.

이미지 변환 도구를 저장소 의존성으로 넣지 않기 위해 굽는 단계는 분리해 두었다.

## 글을 쓸 때의 표현 원칙

- 약을 늘리거나 줄이라는 표현을 쓰지 않는다
- 사용자의 상태를 단정하지 않는다 ("당신은 OFF입니다" 같은 표현)
- 대신 "함께 기록하면 도움이 되는 정보", "치료진과 상의할 때 보여줄 수 있는 항목"으로 쓴다
- 색만으로 상태를 구분하지 않는다. 구분이 필요하면 글자 라벨을 함께 둔다
