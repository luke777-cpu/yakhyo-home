/**
 * 공유용 미리보기 이미지(OG image)의 원본 HTML을 만든다.
 *
 * 홈 화면과 같은 색·글꼴·곡선을 쓰되, 1200×630 한 장에 맞게 배치만 다시 한다.
 * 곡선은 사이트에 쓰이는 실제 데이터(src/data/curves/day-typical.json)에서 그대로
 * 계산하므로, 곡선을 바꾸면 이 이미지도 같은 모양으로 따라온다.
 *
 * 실행:
 *   node scripts/gen-og.mjs            → scripts/og/og-card.html 생성
 *
 * 이미지로 굽기:
 *   브라우저에서 scripts/og/og-card.html 을 열고 창을 1200×630으로 맞춰 캡처하거나,
 *   headless 도구로 같은 크기로 스크린샷해 public/images/og/default.png 로 저장한다.
 *   (이미지 변환 도구를 저장소 의존성으로 추가하지 않기 위해 이 단계는 분리해 두었다.)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'scripts/og/og-card.html');

const curve = JSON.parse(readFileSync(resolve(ROOT, 'src/data/curves/day-typical.json'), 'utf8'));

/* --- 곡선을 이미지 안의 좌표로 옮긴다 (사이트의 DayCurve와 같은 방식) --- */
const W = 1060;
const H = 188;
const PAD_B = 22; // 복용 표시를 놓을 자리
const [from, to] = curve.window;
const plotH = H - PAD_B;

const x = (t) => ((t - from) / (to - from)) * W;
const y = (v) => plotH * (1 - Math.min(100, Math.max(0, v)) / 100);

const line = curve.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ');
const area = `${line} L${x(curve.points.at(-1)[0]).toFixed(1)} ${plotH} L${x(curve.points[0][0]).toFixed(1)} ${plotH} Z`;
const doses = curve.doses
  .map((d) => {
    const dx = x(d.t);
    return `<polygon points="${(dx - 7).toFixed(1)},${plotH + 9} ${(dx + 7).toFixed(1)},${plotH + 9} ${dx.toFixed(1)},${plotH - 1}" fill="#9d5d2a"/>`
      + `<line x1="${dx.toFixed(1)}" y1="14" x2="${dx.toFixed(1)}" y2="${plotH}" stroke="#9d5d2a" stroke-width="2" stroke-dasharray="4 6" opacity="0.55"/>`;
  })
  .join('\n      ');

const html = `<!doctype html>
<!--
  이 파일은 scripts/gen-og.mjs 가 만든 결과물이다. 직접 고치지 말고 스크립트를 고친다.
  1200×630 으로 캡처해 public/images/og/default.png 로 저장한다.
-->
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>약효일지 — 공유 미리보기 이미지</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600&display=swap" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #ffffff; }
  .card {
    width: 1200px; height: 630px;
    background: #fafaf7;
    border: 1px solid #e5e4de;
    padding: 62px 70px 56px;
    display: flex; flex-direction: column; justify-content: space-between;
    font-family: 'Pretendard Variable', Pretendard, system-ui, sans-serif;
    letter-spacing: -0.01em;
    word-break: keep-all;
  }
  .brand { display: flex; align-items: center; gap: 13px; }
  .brand span { font-size: 30px; font-weight: 700; letter-spacing: -0.035em; color: #202522; }
  h1 {
    margin-top: 40px;
    font-family: 'Noto Serif KR', serif; font-weight: 600;
    font-size: 58px; line-height: 1.3; letter-spacing: -0.03em; color: #202522;
  }
  .lead { margin-top: 22px; font-size: 26px; line-height: 1.55; color: #5e6561; }
  .graph { margin-top: 26px; }
</style>
</head>
<body>
  <div class="card">
    <div>
      <div class="brand">
        <svg width="46" height="46" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="9" fill="#e7f0ed"/>
          <path d="M5.5 23.5C8.6 23.5 8.4 9.5 12.4 9.5C16.4 9.5 15.8 20.5 19.4 20.5C22.6 20.5 22.6 13.5 26.5 13.5"
                fill="none" stroke="#1f6b62" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="9.6" cy="25.8" r="1.7" fill="#9d5d2a"/>
          <circle cx="20.4" cy="25.8" r="1.7" fill="#9d5d2a"/>
        </svg>
        <span>약효일지</span>
      </div>
      <h1>내 약은 언제 듣고,<br />언제 떨어질까요?</h1>
      <p class="lead">파킨슨 약효 변화를 하루의 곡선으로 기록합니다.</p>
    </div>

    <svg class="graph" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <path d="${area}" fill="rgba(31,107,98,0.10)"/>
      ${doses}
      <path d="${line}" fill="none" stroke="#1f6b62" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="0" y1="${plotH}" x2="${W}" y2="${plotH}" stroke="#c6c5bc" stroke-width="1.5"/>
    </svg>
  </div>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`생성: ${OUT}`);
console.log(`곡선 지점 ${curve.points.length}개, 복용 표시 ${curve.doses.length}개`);
