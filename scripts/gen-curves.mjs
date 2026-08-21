/**
 * 예시 곡선 생성기
 *
 * 홈페이지에 쓰이는 모든 샘플 그래프의 좌표를 만들어 src/data/curves/*.json 으로 저장한다.
 * 그래프를 HTML/SVG에 손으로 그려 넣지 않기 위한 장치이며, 곡선 모양의 근거를
 * 파라미터로 남겨 나중에 누구든 같은 그림을 다시 만들 수 있게 한다.
 *
 * 중요 — 이 곡선은 "교육용 예시"다.
 *   · 실제 혈중 농도나 개인의 반응을 예측하지 않는다.
 *   · 특정 약, 특정 용량의 곡선이 아니다.
 *   · 사이트 화면에도 항상 예시임을 함께 표기한다.
 *
 * 모양은 흡수(ka)와 소실(tau) 두 시간상수를 갖는 단순한 형태를 쓴다.
 *   f(s) = e^(-s/tau) - e^(-s/ka),  s = 경과시간 - lag
 * 곡선은 최고점이 amp가 되도록 정규화한다. 세로축에는 눈금값을 쓰지 않고
 * "낮음 / 높음"만 표시하므로, amp는 서로 다른 곡선을 비교하기 위한 상대값이다.
 *
 * 실행:  node scripts/gen-curves.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/curves');

/** 한 번의 복용이 만드는 출력 변화 */
function dosePart({ t0, lag = 30, ka = 22, tau = 150, amp = 85 }) {
  const sPeak = Math.log(tau / ka) / (1 / ka - 1 / tau);
  const fPeak = Math.exp(-sPeak / tau) - Math.exp(-sPeak / ka);
  return (t) => {
    const s = t - t0 - lag;
    if (s <= 0) return 0;
    return (amp * (Math.exp(-s / tau) - Math.exp(-s / ka))) / fPeak;
  };
}

function buildSeries(parts, [from, to], step) {
  const fns = parts.map(dosePart);
  const points = [];
  for (let t = from; t <= to; t += step) {
    let v = 0;
    for (const f of fns) v += f(t);
    points.push([t, Math.round(Math.min(100, Math.max(0, v)) * 10) / 10]);
  }
  return points;
}

/** 특정 시각의 곡선 높이 (라벨을 곡선 위에 정확히 얹기 위해) */
function valueAt(points, t) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const [t1, v1] = points[i];
    const [t2, v2] = points[i + 1];
    if (t >= t1 && t <= t2) {
      const r = t2 === t1 ? 0 : (t - t1) / (t2 - t1);
      return Math.round((v1 + (v2 - v1) * r) * 10) / 10;
    }
  }
  return points[points.length - 1][1];
}

const hm = (t) => `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

/** 곡선 정의 — 여기만 고치면 사이트의 모든 예시 그래프가 바뀐다 */
const NORMAL = { lag: 30, ka: 22, tau: 150, amp: 85 };
// 하루 전체를 그릴 때는 소실 시간상수를 짧게 잡는다. 그래야 복용과 복용 사이의
// 오르내림이 그림에서 보인다. 여러 번 복용이 겹쳐 100을 넘지 않도록 맞춘 값이다.
const DAY = { lag: 30, ka: 22, tau: 95 };

const CURVES = [
  {
    id: 'day-typical',
    note: '하루 네 번 복용했을 때의 출력 변화 예시. 오후로 갈수록 최고점이 조금씩 낮아지는 형태.',
    window: [360, 1440],
    step: 10,
    parts: [
      { t0: 420, ...DAY, amp: 84 },
      { t0: 660, ...DAY, amp: 82 },
      { t0: 900, ...DAY, amp: 76 },
      { t0: 1140, ...DAY, amp: 70 },
    ],
    doses: [{ t: 420 }, { t: 660 }, { t: 900 }, { t: 1140 }],
  },
  {
    id: 'single-dose',
    note: '한 번의 복용이 오르고 내리는 과정. 홈 화면에서 "왜 기록하는가"를 보여주는 기준 그림.',
    window: [360, 840],
    step: 10,
    parts: [{ t0: 420, lag: 65, ka: 25, tau: 140, amp: 88 }],
    doses: [{ t: 420, label: '약 복용' }],
    marks: [
      { t: 490, label: '첫 상승' },
      { t: 540, label: '최고 출력' },
      { t: 680, label: '하강' },
    ],
  },
  {
    id: 'delayed-on',
    note: '올라오기까지 오래 걸리는 형태. 점선은 비교를 위한 참고 곡선이며 "정상"을 뜻하지 않는다.',
    window: [360, 840],
    step: 10,
    parts: [{ t0: 420, lag: 95, ka: 30, tau: 145, amp: 82 }],
    reference: [{ t0: 420, ...NORMAL }],
    doses: [{ t: 420, label: '약 복용' }],
    marks: [
      { t: 515, label: '상승 시작' },
      { t: 575, label: '최고 출력' },
    ],
  },

  /* --- 그래프 읽기 index 카드용 작은 곡선들 --------------------------------- */
  { id: 'p-normal-rise', note: '복용 뒤 완만히 올라 한동안 유지되다 내려오는 형태.',
    window: [360, 900], step: 15, parts: [{ t0: 420, ...NORMAL }], doses: [{ t: 420 }] },
  { id: 'p-delayed-rise', note: '올라오기 시작하는 시점이 뒤로 밀린 형태.',
    window: [360, 900], step: 15, parts: [{ t0: 420, lag: 95, ka: 30, tau: 145, amp: 82 }],
    reference: [{ t0: 420, ...NORMAL }], doses: [{ t: 420 }] },
  { id: 'p-incomplete', note: '올라오기는 하지만 최고점이 낮게 머무는 형태.',
    window: [360, 900], step: 15, parts: [{ t0: 420, lag: 35, ka: 24, tau: 150, amp: 40 }],
    reference: [{ t0: 420, ...NORMAL }], doses: [{ t: 420 }] },
  { id: 'p-failure', note: '복용했지만 출력 변화가 거의 나타나지 않은 형태.',
    window: [360, 900], step: 15, parts: [{ t0: 420, lag: 45, ka: 30, tau: 150, amp: 7 }],
    reference: [{ t0: 420, ...NORMAL }], doses: [{ t: 420 }] },
  { id: 'p-high-peak', note: '짧고 가파르게 최고점까지 올라가는 형태.',
    window: [360, 900], step: 15, parts: [{ t0: 420, lag: 22, ka: 13, tau: 115, amp: 100 }],
    reference: [{ t0: 420, ...NORMAL }], doses: [{ t: 420 }] },
  { id: 'p-fast-fall', note: '최고점은 비슷하지만 내려오는 속도가 빠른 형태.',
    window: [360, 900], step: 15, parts: [{ t0: 420, lag: 28, ka: 20, tau: 68, amp: 85 }],
    reference: [{ t0: 420, ...NORMAL }], doses: [{ t: 420 }] },
  { id: 'p-morning', note: '잠에서 깬 뒤 첫 복용까지, 그리고 올라오기까지의 시간을 보여주는 형태.',
    window: [300, 780], step: 15,
    parts: [{ t0: 450, lag: 55, ka: 24, tau: 150, amp: 80 }],
    doses: [{ t: 450, label: '첫 복용' }] },
  { id: 'p-wearing-off', note: '복용 간격은 그대로인데 유지되는 시간이 점점 짧아지는 형태.',
    window: [360, 1440], step: 20,
    parts: [
      { t0: 420, ...DAY, amp: 82, tau: 115 },
      { t0: 660, ...DAY, amp: 82, tau: 88 },
      { t0: 900, ...DAY, amp: 80, tau: 68 },
      { t0: 1140, ...DAY, amp: 78, tau: 56 },
    ],
    doses: [{ t: 420 }, { t: 660 }, { t: 900 }, { t: 1140 }] },
  { id: 'p-dyskinesia', note: '최고점 부근이 높고 그 뒤 내려오는 구간이 뚜렷한 형태.',
    window: [360, 900], step: 15, parts: [{ t0: 420, lag: 20, ka: 12, tau: 100, amp: 100 }],
    doses: [{ t: 420 }] },
  { id: 'p-afternoon', note: '오전에는 올라오지만 오후 복용에서는 충분히 올라오지 않는 형태.',
    window: [360, 1440], step: 20,
    parts: [
      { t0: 420, ...DAY, amp: 86 },
      { t0: 660, ...DAY, amp: 78 },
      { t0: 900, ...DAY, amp: 42 },
      { t0: 1140, ...DAY, amp: 38 },
    ],
    doses: [{ t: 420 }, { t: 660 }, { t: 900 }, { t: 1140 }] },
  { id: 'p-two-days',
    note: '같은 약을 같은 시각에 먹은 서로 다른 두 날. 어느 쪽도 기준이 아니며 그냥 다른 날이다. 첫 복용에서는 차이가 크고 두 번째 복용에서는 비슷해지도록 잡았다.',
    window: [360, 900], step: 15,
    label: '3월 12일',
    parts: [
      { t0: 420, lag: 30, ka: 22, tau: 105, amp: 84 },
      { t0: 660, lag: 30, ka: 22, tau: 105, amp: 82 },
    ],
    compare: {
      label: '3월 15일',
      parts: [
        { t0: 420, lag: 78, ka: 26, tau: 82, amp: 58 },
        { t0: 660, lag: 42, ka: 26, tau: 82, amp: 76 },
      ],
    },
    doses: [{ t: 420 }, { t: 660 }] },
  { id: 'p-whole-day', note: '하루 전체를 이어 보았을 때의 반복 형태.',
    window: [360, 1440], step: 20,
    parts: [
      { t0: 420, ...DAY, amp: 84 },
      { t0: 660, ...DAY, amp: 82 },
      { t0: 900, ...DAY, amp: 76 },
      { t0: 1140, ...DAY, amp: 70 },
    ],
    doses: [{ t: 420 }, { t: 660 }, { t: 900 }, { t: 1140 }] },
];

mkdirSync(OUT_DIR, { recursive: true });

for (const c of CURVES) {
  const points = buildSeries(c.parts, c.window, c.step);
  const out = {
    id: c.id,
    note: c.note,
    window: c.window,
    step: c.step,
    points,
    doses: (c.doses ?? []).map((d) => ({ t: d.t, time: hm(d.t), label: d.label ?? null })),
    marks: (c.marks ?? []).map((m) => ({ t: m.t, time: hm(m.t), label: m.label, v: valueAt(points, m.t) })),
  };
  if (c.label) out.label = c.label;
  if (c.reference) out.reference = buildSeries(c.reference, c.window, c.step);
  // compare 는 reference 와 다르다. reference 는 "비교용 참고"라는 위계가 있지만
  // compare 는 같은 지위의 다른 날이다. 화면에서도 색을 나누지 않는다.
  if (c.compare) {
    out.compare = { label: c.compare.label, points: buildSeries(c.compare.parts, c.window, c.step) };
  }
  writeFileSync(resolve(OUT_DIR, `${c.id}.json`), `${JSON.stringify(out)}\n`);
  const peak = points.reduce((a, p) => (p[1] > a[1] ? p : a));
  console.log(`${c.id.padEnd(16)} points=${String(points.length).padStart(3)}  peak=${peak[1]} @ ${hm(peak[0])}`);
}
