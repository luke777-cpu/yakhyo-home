# 영문 콘텐츠 (/en/) — 작업 노트

`feature/english-content-v1`에서 만든 영문 섹션의 구조와, 다음 사람이 이어서 할 일.

기존 한국어 페이지의 문구·구조·검정 문서는 **하나도 고치지 않았다.**
빌드 결과로 확인한 내용은 이 문서 맨 아래 "회귀 검증"에 있다.

---

## 1. 이번에 만든 범위 (v1)

| 경로 | 내용 |
|---|---|
| `/en/` | 영문 홈 — 무엇을 기록하는지, 세 단계, 하루 곡선 예시 |
| `/en/start/` | 시작하기 — 처음 나흘, 자주 묻는 것 |
| `/en/terms/` | 용어 목록 + 헷갈리는 세 용어(Delayed ON / Incomplete ON / ON Failure) 안내 |
| `/en/terms/<slug>/` | 용어 글 10편 |

영문 글 10편은 한국어 `src/content/understand/*.md` 를 옮긴 것이다.
새로운 주장을 넣지 않았고, 원문의 완화된 표현("~수 있습니다", "함께 이야기되는 요인")을
그대로 영어로 옮겼다. `docs/TERMINOLOGY-NOTES.md`의 원칙 세 가지가 영문에도 그대로 적용된다.

**아직 영문이 없는 것** — 그래프 읽기 11편, 약효일지 사용법 8편, 배우기 10편, 이야기.
영문 목록·홈에서 한국어 쪽으로 안내하고 있으며, 없는 링크를 걸어 두지는 않았다.

---

## 2. 파일 구조

새로 만든 파일 — 한국어 쪽과 섞이지 않도록 전부 별도 파일로 두었다.

```
src/lib/en.ts                      영문 사이트 이름·안내문·메뉴·그래프 라벨 (문구는 전부 여기)
src/layouts/EnBaseLayout.astro     <html lang="en">, og:locale, hreflang
src/layouts/EnTermLayout.astro     용어 글의 공통 틀 (섹션 순서는 한국어와 동일)
src/components/EnHeader.astro      영문 헤더 + 언어 전환 링크
src/components/EnMobileNav.astro   영문 모바일 메뉴
src/components/EnFooter.astro      영문 푸터
src/data/en/terms.json             용어 목록·공개 여부
src/content/en-terms/*.md          용어 글 10편
src/pages/en/index.astro           영문 홈
src/pages/en/start.astro           시작하기
src/pages/en/terms/index.astro     용어 목록
src/pages/en/terms/[...slug].astro 용어 글 라우트
```

스타일·곡선 데이터·아이콘·버튼 같은 것은 한국어 쪽과 **같은 것을 그대로 쓴다.**
디자인은 한 벌뿐이고, 영어라고 색이나 간격이 달라지지 않는다.

---

## 3. 영문 글 하나 더 추가하려면

1. `src/content/en-terms/<slug>.md` 를 만든다. 필드 구성은 기존 10편과 같다.
   (`src/content.config.ts` 의 `enTerms` 스키마가 빠진 항목을 빌드에서 잡는다.)
2. `src/data/en/terms.json` 에 항목을 넣고 `status` 를 `published` 로 둔다.
   글이 준비되기 전이라면 `preparing` 으로 두면 링크 대신 `In preparation` 배지가 나온다.
3. 한국어 대응 글이 있으면 프론트매터에 `koPath: /understand/<slug>/` 를 넣는다.
   `hreflang` 과 언어 전환에 쓰인다.

sitemap 은 `src/pages/sitemap.xml.ts` 가 컬렉션에서 자동으로 읽으므로 따로 고칠 것이 없다.

프론트매터 값을 큰따옴표로 **시작하지 않는다.** `npm run build` 앞단의
`scripts/check-content.mjs` 가 막는다 (한국어 글과 같은 규칙).

---

## 4. 정해 둔 값 — 바꾸려면 여기

**앱의 영문 이름을 `Medication Diary` 로 썼다.** Play 스토어 패키지명
(`kr.parkinson.medicationdiary`)을 따른 것이며, 공식 영문 명칭이 따로 정해지면
`src/lib/en.ts` 의 `EN_SITE.name` 한 곳만 고치면 전체에 반영된다.

앱 화면 자체는 한국어다. `/en/start/` 에 그 사실을 한 문단으로 밝혀 두었다.

---

## 5. 공유 파일을 건드린 곳과 이유

영문 때문에 한국어 동작이 달라지지 않도록, 공유 파일은 **전부 기본값을 한국어로 둔 선택 항목**만 추가했다.
영문 페이지에서만 다른 값을 넘긴다.

| 파일 | 추가한 것 | 기본값 |
|---|---|---|
| `src/components/DayCurve.astro` | `labels` — 그림 안 글자 | 한국어 그대로 |
| `src/components/Wordmark.astro` | `text` — 워드마크 이름 | `SITE.name` |
| `src/components/Button.astro` | `externalLabel` — 새 창 안내 | `(새 창)` |
| `src/components/TocList.astro` | `pendingLabel` — 준비 중 배지 | `준비 중` |
| `src/components/RelatedContent.astro` | `pendingLabel` — 준비 중 배지 | `준비 중` |
| `src/content.config.ts` | `enTerms` 컬렉션 | 기존 컬렉션 변경 없음 |
| `src/pages/sitemap.xml.ts` | `/en/` 경로 추가 | 기존 경로 변경 없음 |

---

## 6. 아직 하지 않은 것 — 한국어 → 영문 입구 링크

`/en/` 로 들어가는 링크를 **한국어 헤더에 아직 넣지 않았다.**
`src/components/Header.astro` 는 다른 작업(회원/게시판)에서 로그인 상태 UI 때문에
같이 고치고 있는 파일이라, 그쪽 작업이 합쳐진 뒤에 넣는 편이 충돌이 적다.

그때 넣을 것은 한 줄이다. `Header.astro` 의 `header__nav` 안, 메뉴 목록 다음:

```astro
<a class="header__link" href={url('/en/')} lang="en">EN</a>
```

`src/components/MobileNav.astro` 의 `mobilenav__list` 안에도 같은 항목을 하나 둔다:

```astro
<li><a class="mobilenav__link" href={url('/en/')} lang="en">English</a></li>
```

그 전까지 `/en/` 은 주소와 검색엔진(sitemap 에 들어 있다)으로만 닿는다.
영문 쪽에서 한국어로 나가는 링크는 이미 헤더·푸터·본문에 들어 있다.

---

## 7. 회귀 검증

`origin/main` 을 별도로 빌드해 한국어 페이지 46개를 현재 빌드와 대조했다.

- **46개 전부 내용 동일.**
- 내용이 아닌 차이 세 가지만 있고, 모두 화면에 나타나지 않는다.
  1. CSS 번들 파일 이름이 `BaseLayout.*.css` → `pages.*.css` 로 바뀌었다. **내용은 완전히 동일**(해시 같음).
  2. 모바일 메뉴 스크립트가 HTML 안에 박히던 것에서 별도 `.js` 파일로 분리됐다.
     같은 스크립트를 두 컴포넌트(한국어·영문 메뉴)가 함께 쓰기 때문이다. 동작은 같고,
     46개 HTML 에 같은 코드가 반복되던 것이 한 번 받아 캐시되는 형태로 바뀐다.
  3. SVG 안 `graph-N` 일련번호가 밀렸다. 페이지 안에서 `aria-labelledby` 짝은 그대로다.

`node scripts/check-content.mjs` 통과, `npm run build` 성공(59 페이지), `npx astro check` 에서
이번 작업이 만든 타입 오류 0건.
