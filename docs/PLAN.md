# 1차 작업 계획 (확정본)

이 문서는 코드보다 먼저 합의한 내용을 남겨둔 것이다.
구조나 색을 바꾸고 싶을 때 여기부터 고친다.

## 1. 기술 스택

| | 선택 | 이유 |
|---|---|---|
| 프레임워크 | Astro (정적 빌드) | 결과물은 정적 HTML. 런타임 JS 없음 |
| 스타일 | 순수 CSS + 변수 토큰 | Tailwind 등 프레임워크 없음 |
| 그래프 | 인라인 SVG 직접 생성 | 차트 라이브러리 없음 |
| 배포 | GitHub Pages (Actions) | Vercel 이전은 환경변수 두 개만 교체 |

npm 의존성은 `astro` 하나뿐이다.

## 2. 사이트맵

```
/                          홈                       ✅ 1차
/start/                    시작하기 (CTA 도착지)     ✅ 1차
/diary/                    약효일지란 무엇인가        ✅ 1차
   └ start · output · medication · events
     graph · phs · backup · faq                    ⏳ 2차
/understand/               약효 이해하기 index       ✅ 1차
   ├ delayed-on                                    ✅ 1차 (샘플 1개)
   └ on · off · incomplete-on · on-failure
     wearing-off · dyskinesia · dystonia
     freezing · morning-off · afternoon-decline    ⏳ 2차
/graphs/                   그래프 읽기 index         ✅ 1차
   └ 패턴 10개                                      ⏳ 2차
/learn/                    배우기 index             ✅ 1차
/story/                    이야기 index             ✅ 1차

(자리만 비워둠) /analysis/ 또는 /patterns/           — 1차에서 만들지 않음
```

아직 글이 없는 항목은 링크 대신 "준비 중"으로 표시한다.
눌리지 않는 링크를 만들지 않기 위한 규칙이다.

## 3. 홈 구조

```
1  HERO         제목 → 짧은 설명 → CTA → 그래프   (모바일 순서)
2  핵심 개념     기록한다 → 곡선이 보인다 → 패턴을 이해한다
3  하루 곡선     07:00 복용 / 08:10 첫 상승 / 09:00 최고 / 11:20 하강
4  현상 찾기     7개 목록 → 개념 페이지 (진단 아님을 명시)
5  약효일지 소개  "왜 필요한가" 중심. 기능 나열 안 함
6  배우기        개념 카드 6개
7  YouTube      3개까지만
8  마지막 CTA    "기록이 쌓이면, 하루가 다르게 보이기 시작합니다."
```

## 4. 디자인 시스템

### 색

| 용도 | 값 | 비고 |
|---|---|---|
| 배경 | `#FAFAF7` | warm off-white |
| 가라앉은 배경 | `#F4F4EF` | 섹션 구분 |
| 본문 | `#202522` | 14.9:1 |
| 보조 글자 | `#5E6561` | 5.7:1 |
| 캡션 | `#69716D` | 4.8:1 |
| 강조 | `#1F6B62` | deep teal, 6.0:1 |
| 옅은 강조 | `#E7F0ED` | |
| 경계선 | `#E5E4DE` | |

그래프 전용: 곡선 `#1F6B62` · 참고 곡선 `#828D88` · 복용 시점 `#9D5D2A` · 격자 `#EBEBE4`

모든 글자색은 실제 명암비를 재서 본문 크기 기준 4.5:1을 넘도록 잡았다.
작업지시서가 제시한 보조색 `#69716D`는 캡션 색으로 옮기고, 보조 글자는 한 단계 더 진하게 해
두 단계의 위계를 두면서 둘 다 기준을 넘게 했다.

**ON/OFF를 색으로 구분하지 않는다.** 빨강·초록 신호등 배색을 쓰지 않고,
상태 구분이 필요하면 항상 글자 라벨을 함께 둔다.

### 타이포

| 용도 | 폰트 | 모바일 → 데스크톱 |
|---|---|---|
| Hero h1 / 페이지 h1 | Noto Serif KR 600 | 30 → 40 / 26 → 32 |
| h2 | Pretendard 600 | 21 → 24 |
| h3 | Pretendard 600 | 18 → 19 |
| 본문 | Pretendard 400 | 17 (줄간 1.75) |
| 보조 | Pretendard 400 | 15 |
| 캡션·축 라벨 | Pretendard 500 | 13.5 |

명조는 h1에만. 본문·숫자·시각은 전부 산세리프.
한글 본문에는 `word-break: keep-all`을 적용해 단어 중간에서 줄이 끊기지 않게 한다.

### 간격·레이아웃

```
4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128
섹션 여백   모바일 64 → 태블릿 96 → 데스크톱 112
컨테이너    최대 1160,  좌우 여백 20 → 32
본문 읽기 폭 700
radius      8 (버튼·카드) / 12 (그래프) — 최대 12
그림자      0 1px 2px rgba(32,37,34,.04) 한 단계만
터치 타깃   최소 44px
```

## 5. 폴더 구조

```
src/
  styles/     tokens · base · layout · components · graph · pages
  layouts/    BaseLayout · ConceptLayout
  components/ Header · MobileNav · Footer · Section · PageHead
              Button · DayCurve · TocList · Callout · Timeline
              FAQ · VideoCard · RelatedContent · Icon
  lib/        url.ts (경로) · curve.ts (그래프 계산) · site.ts
  scripts/    navigation.ts (사이트의 유일한 클라이언트 JS)
  data/       *.json + curves/*.json
  content/    understand/*.md
  pages/      index · start · diary · understand · graphs · learn · story
              sitemap.xml.ts · robots.txt.ts
scripts/      gen-curves.mjs (예시 곡선 생성기)
```

## 6. 모바일 계획

- 모바일이 기본 CSS. 미디어쿼리는 `768px`, `1024px` 두 개뿐
- 검증 폭: 360 / 390 / 430 / 768 / 1024 / 1440
- 카드 그리드는 모바일 1열 → 768에서 2열 → 1024에서 3열. 2-column 강제 없음
- 헤더 56px + 햄버거. 데스크톱(1024+)에서만 가로 메뉴와 CTA 노출
- 메뉴는 전체 화면 오버레이 — Esc 닫기, 포커스 가둠, 배경 스크롤 잠금
- 그래프는 좁은 화면용(360×276)과 넓은 화면용(620×300) **두 벌**을 그려 하나만 보여준다.
  하나의 SVG를 축소하면 글자까지 같이 줄어들어 모바일에서 읽을 수 없기 때문이다
- 시간축 라벨은 모바일에서 6시간 간격, 768px부터 3시간 간격

## 7. 1차에서 만들지 않은 것

로그인 · 사용자 DB · 자동 분석 · 약물 추천 · 관리자 페이지 ·
YouTube API 연동 · 개인 의료 데이터를 서버로 보내는 코드.

`/analysis/` 영역은 나중에 페이지를 더하면 되도록 구조만 비워 두었다.
