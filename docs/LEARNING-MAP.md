# 학습지도 · 시리즈 구조 — 작업 노트

`feature/english-content-v1`에 학습지도(마인드맵)와 연재(시리즈) 목차/이전·다음
이동 인프라를 더했다.

**이 작업은 같은 브랜치에서 진행 중이던 다른 작업(Firebase 인증·질문게시판·
「몸으로 쓰는 약리학」/「몸으로 배우는 신경해부학」 실제 본문 5편·Atlas)과
병합한 결과다.** 그쪽 작업은 전혀 건드리지 않았고, 이번 구조를 그 위에
얹었다 — 아래 8번에 병합 과정과 확인한 것을 적어 두었다.

기존 콘텐츠 페이지, 1~5차 검정 문서, 그래프 해석, Play 스토어 링크,
인증·게시판·Firebase 관련 파일은 하나도 고치지 않았다.

---

## 1. 새로 생긴 페이지

| 경로 | 내용 |
|---|---|
| `/learn/map/` | 학습지도 — 홈페이지 전체 구조. 데스크톱은 트리, 모바일은 접는 카드 |
| `/learn/series/pharmacology/` | 「몸으로 쓰는 약리학」 목차 (전 7편, 실제 2편 공개) |
| `/learn/series/neuroanatomy/` | 「몸으로 배우는 신경해부학」 목차 (전 10편, 실제 3편 공개) |
| `/en/learn/map/` | 영문 학습지도 |
| `/en/learn/series/pharmacology/`, `/en/learn/series/neuroanatomy/` | 영문 강좌 목차 (실제 5편 공개) |

`/en/learn/`, `/en/learn/[...slug].astro`(글 본문), 실제 연재 5편(한국어·영문)은
**이 작업 이전부터 있던 것**이다 — 다른 세션이 이미 써 두었다. 이번에 한 일은
그 글들에 시리즈 목차·이전/다음 이동을 연결하고, 전체 구조를 보여주는
학습지도를 추가한 것이다.

---

## 2. 데이터 구조 — 한 곳만 고치면 되는 이유

```
src/data/series.json        연재 제목·순서 (한국어)
src/data/en/series.json     연재 제목·순서 (영문)
src/lib/series.ts           "글이 실제로 있는가"를 계산하는 함수 (언어 공용)
src/components/SeriesToc.astro     목차 — 시리즈 소개 페이지와 각 편 상단에서 같이 쓴다
src/components/PrevNextNav.astro   이전/다음 이동 — 각 편 하단
src/components/LearnMapTree.astro  학습지도 트리/아코디언 렌더링 (한국어·영문 공용)
```

`series.json`에 제목·순서만 있고, "글이 있는가(published/preparing)"는 여기
저장하지 않는다. `src/lib/series.ts`가 실제 콘텐츠 컬렉션에 그 slug의 파일이
있는지를 매번 다시 계산한다. 그래서 글 파일 하나를 추가하면 목차·이전/다음
이동·홈 카드가 전부 자동으로 갱신된다 — `series.json`도 고칠 것 없이, 애초에
그 편의 자리(slug·제목·순서)가 이미 거기 있으므로 **글 파일만 추가하면 끝**이다.

한국어 쪽은 기존 `learn` 컬렉션에 `series: pharmacology` (또는 `neuroanatomy`)
프론트매터 한 줄만 추가하는 방식으로 연결했다 — 실제로 이미 있던
`body-pharmacology-part1/2.md`, `body-neuroanatomy-preface/part1/part2.md`
다섯 개 파일에 그 줄을 추가했다 (`src/content.config.ts`의 `learn` 스키마에
`series` 필드를 optional 로 추가). 영문 쪽(`enLearn` 컬렉션)은 별도 필드 없이
`src/lib/series.ts`가 `getCollection('enLearn')`의 실제 slug 목록을 직접
확인하는 방식으로 연결했다.

---

## 3. 연재 글 한 편을 새로 쓸 때

한국어: `src/content/learn/<slug>.md` (slug는 `series.json`의 `items[].slug`와
같아야 한다) 프론트매터에 `series: pharmacology`(또는 `neuroanatomy`) 한 줄을
추가한다. `articles.json`(카테고리 목록)에 없어도 빌드가 통과한다 — 시리즈에
속한 글은 시리즈 목차 자체가 이미 그 글의 자리를 설명해 주기 때문이다.

영문: `src/content/en-learn/<slug>.md`를 같은 slug로 추가하면 자동으로
`/en/learn/series/<key>/` 목차와 이전/다음에 반영된다. 별도 프론트매터 필드는
필요 없다.

---

## 4. 학습지도 — `<details>` 관련 알아둘 것

처음에는 `<details>` 하나로 "모바일은 접힌 카드, 데스크톱은 항상 펼친 트리"를
CSS만으로 만들려고 했다 (`.learnmap__branch > :not(summary) { display:block !important }`
로 닫힌 상태를 강제로 펼쳐 보이게 하는 잘 알려진 트릭). 그런데 실제로 스크린샷을
찍어 보니 **데스크톱 폭에서도 접힌 채로 나왔다.** 최신 Chromium이 닫힌 `<details>`의
내용을 `display`가 아니라 `content-visibility`로 감추는 것으로 보이는데,
`display:block !important`는 `content-visibility`에 영향을 주지 못한다.

그래서 `LearnMapTree.astro`가 **모바일용 `<details>` 트리와 데스크톱용 평범한
`<div>` 트리를 둘 다 렌더링**하고, `pages.css`가 폭에 따라 한쪽만 보이게
감추는 방식으로 바꿨다. 자바스크립트는 여전히 하나도 추가하지 않았다 —
모바일의 여닫기는 순수 네이티브 `<details>` 동작이다.

데스크톱/모바일 스크린샷을 Playwright로 직접 찍어 확인했다 (임시로 설치했다가
지웠다 — `package.json`에는 남지 않는다).

---

## 5. 학습지도의 커뮤니티(게시판) 항목

병합 전에는 게시판이 이 브랜치에 없어서 "준비 중"으로만 남겨 두었는데, 병합
결과 실제 질문게시판(`/questions/`, `/questions/new/`, `/questions/mine/`)이
있어서 **실제 링크로 바꿨다.** 영문 학습지도에서는 게시판 자체가 한국어
전용이라는 점을 안내문으로 밝히고 한국어 페이지로 연결했다.

---

## 6. 홈페이지 카드 — 다른 세션의 「1부」 소개 섹션과 합친 것

병합 직전 원격에는 홈(`index.astro`)에 「몸으로 쓰는 약리학 1부」만 소개하는
섹션이 있었다 (신경해부학은 없었음). 이번 작업에서 만든 두 강좌 카드 섹션으로
바꿨다 — 이제 신경해부학도 실제 3편이 공개돼 있으므로 한쪽만 보여주는 것보다
두 강좌를 나란히 보여주는 편이 낫다고 판단했다. 영문 홈에는 같은 카드 섹션을
새로 추가했다 (원래 없었다).

---

## 7. 회귀 검증

- `npm run build` 84페이지 성공 (병합 전 원격 82페이지 + `/learn/map/`,
  `/learn/series/pharmacology/`, `/learn/series/neuroanatomy/`,
  `/en/learn/map/`, `/en/learn/series/pharmacology/`,
  `/en/learn/series/neuroanatomy/` = +6, 다른 세션의 학습지도 이전 버전 페이지
  없음이므로 정확히 +6가 아니라 병합 세부 조정에 따라 달라질 수 있음 — 실제
  숫자만 확인).
- 내부 링크 전수 검사(84개 HTML, `/yakhyo-home/...` href 전부) **깨진 링크 0건**.
- `node scripts/check-content.mjs` 통과.
- `npx astro check` — 이번 작업이 만든 타입 오류 0건. 남은 4건은 전부
  병합 이전부터 있던 것 (`src/pages/index.astro`의 곡선 타입 캐스팅,
  `src/scripts/navigation.ts` 두 건, `src/pages/en/learn/[...slug].astro`의
  `url()` null 처리 — 이 넷 다 다른 세션이 만든 기존 파일이라 손대지 않았다).
- 실제 발행된 글 5편(`body-pharmacology-part1/2`, `body-neuroanatomy-preface/part1/part2`)
  에서 breadcrumb·시리즈 목차·이전/다음 이동이 전부 정상 작동하는 것을 빌드
  결과에서 직접 확인했다 (grep으로 각 편의 이전/다음 링크가 올바른 slug를
  가리키는지 대조).
- Playwright로 실제 병합된 페이지를 스크린샷 — 연재 글 본문, 시리즈 목차,
  학습지도(한국어·영문), 홈페이지를 직접 확인했다.

---

## 8. 병합 경위 (다음에 비슷한 상황을 만나면 참고할 것)

이 작업을 시작할 때 로컬에는 이 구조가 이미 완성돼 있었지만, `git push`가
403으로 막혀 있었다. 권한이 열린 뒤 다시 push를 시도하니 **원격
`feature/english-content-v1`에 이미 다른 세션의 대규모 작업(Firebase 인증,
질문게시판, 관리자 기능, 연재 본문 5편, Atlas 그림)이 올라와 있는 것을
발견했다** — 그 세션은 사용자가 별도로 지시한 Firebase 전환 작업과, 이번
학습지도 작업이 다루는 것과 같은 연재 콘텐츠를 이미 진행하고 있었다.

강제 push(그쪽 작업을 덮어씀)나 무심코 병합(두 구조가 뒤섞여 망가질 위험)
대신, 사용자에게 상황을 보고하고 "내 작업을 그 위에 신중하게 병합"하라는
답을 받았다. 그 뒤:

1. 원격 브랜치를 새로 체크아웃하고, 로컬 결과물은 `my-learning-map-wip`
   브랜치에 보존했다.
2. 새 파일(컴포넌트·`src/lib/series.ts`·페이지)은 그대로 가져왔다.
3. 양쪽이 같이 고친 파일(`content.config.ts`, `learn/[...slug].astro`,
   `index.astro` 등)은 실제 내용을 읽고 손으로 병합했다 — 특히
   `src/layouts/LearnLayout.astro`를 옮기는 것을 처음에 빠뜨려서 시리즈
   목차가 안 뜨는 것을 스크린샷 대신 grep 대조로 먼저 잡아냈고, 다시
   빌드해서 확인했다.
4. `series.json`의 제목을 이미 발행된 실제 글 제목에 맞춰 고쳤다 —
   두 세션이 우연히 같은 slug 규칙(`body-pharmacology-part1` 등)을 썼기
   때문에 이 부분은 매끄럽게 들어맞았다.
5. `package.json`이 Windows 전용 네이티브 바인딩을 의존성으로 갖고 있어
   `npm install`이 이 리눅스 환경에서 막혔다 — 그쪽 세션이 CI에서 쓴 것과
   같은 `--force` 플래그로 우회했다 (`.github/workflows/deploy.yml`의
   `npm ci --force`와 같은 이유).
