/** 예시 곡선 데이터의 형태와, 그것을 SVG 좌표로 옮기는 계산 */

export interface CurvePoint extends Array<number> {
  0: number; // 자정 기준 분
  1: number; // 출력의 상대적 높이 (0-100)
}

export interface CurveData {
  id: string;
  note: string;
  window: [number, number];
  step: number;
  points: number[][];
  reference?: number[][];
  doses: { t: number; time: string; label: string | null }[];
  marks: { t: number; time: string; label: string; v: number }[];
}

export interface Box {
  W: number;
  H: number;
  padT: number;
  padL: number;
  padR: number;
  plotH: number;
  doseLane: number;
  tickLane: number;
}

export function makeScales(box: Box, [from, to]: [number, number]) {
  const plotW = box.W - box.padL - box.padR;
  const span = to - from || 1;
  const x = (t: number) => box.padL + ((t - from) / span) * plotW;
  const y = (v: number) => box.padT + box.plotH * (1 - Math.min(100, Math.max(0, v)) / 100);
  return { x, y, plotW, axisY: box.padT + box.plotH, topY: box.padT };
}

export function toLine(points: number[][], x: (t: number) => number, y: (v: number) => number): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ');
}

export function toArea(
  points: number[][],
  x: (t: number) => number,
  y: (v: number) => number,
  baseY: number,
): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${toLine(points, x, y)} L${x(last[0]).toFixed(1)} ${baseY.toFixed(1)} L${x(first[0]).toFixed(1)} ${baseY.toFixed(1)} Z`;
}

/** 시간축 눈금. 좁은 화면에서는 major만 보이도록 minor를 따로 표시한다. */
export function timeTicks([from, to]: [number, number]): { t: number; label: string; major: boolean }[] {
  const span = to - from;
  const step = span > 600 ? 180 : span > 300 ? 120 : 60;
  const start = Math.ceil(from / step) * step;
  const ticks: { t: number; label: string; major: boolean }[] = [];
  let i = 0;
  for (let t = start; t <= to; t += step) {
    ticks.push({ t, label: String(Math.floor(t / 60) % 24 || (t >= 1440 ? 24 : 0)).padStart(2, '0'), major: i % 2 === 0 });
    i += 1;
  }
  return ticks;
}

/** 그래프를 글로 옮긴 설명. 화면을 못 보는 사용자에게 읽히는 내용이다. */
export function describe(curve: CurveData): string {
  const [from, to] = curve.window;
  const hm = (t: number) =>
    `${String(Math.floor(t / 60) % 24).padStart(2, '0')}시 ${t % 60 ? `${t % 60}분` : ''}`.trim();
  const parts = [`가로축은 ${hm(from)}부터 ${hm(to)}까지의 시각, 세로축은 출력의 상대적인 높이입니다.`];
  if (curve.doses.length) parts.push(`약 복용 시점은 ${curve.doses.map((d) => d.time).join(', ')}입니다.`);
  if (curve.marks.length) {
    parts.push(curve.marks.map((m) => `${m.time} 무렵 ${m.label}`).join(', ') + '.');
  } else {
    const peak = curve.points.reduce((a, p) => (p[1] > a[1] ? p : a), curve.points[0]);
    parts.push(`가장 높은 지점은 ${String(Math.floor(peak[0] / 60)).padStart(2, '0')}:${String(peak[0] % 60).padStart(2, '0')} 무렵입니다.`);
  }
  return parts.join(' ');
}

/** SVG 안의 title/desc를 연결하기 위한 id. 빌드 결과가 매번 같도록 순번을 쓴다. */
let idSeq = 0;
export function nextGraphId(): string {
  idSeq += 1;
  return `graph-${idSeq}`;
}
