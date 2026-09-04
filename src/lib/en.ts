/**
 * 영문 섹션(/en/)이 쓰는 값들.
 *
 * 한국어 쪽 `src/lib/site.ts`는 손대지 않는다. 두 언어가 서로의 문구를 건드리지
 * 않도록 영문 문자열은 전부 이 파일에 모아 둔다. 이름·소개·안내문을 바꿀 때
 * 고칠 곳은 여기 한 곳이다.
 */
import type { CurveData } from './curve';

export const EN_SITE = {
  /** 앱의 영문 이름. Play 스토어 패키지명(kr.parkinson.medicationdiary)을 따랐다. */
  name: 'Medication Diary',
  /** 한국어 이름. 영문 페이지에서도 한 번은 함께 보여 준다. */
  koreanName: '약효일지',
  title: "Medication Diary — a record of how Parkinson's medication rises and falls",
  tagline:
    "A place to record how your Parkinson's medication response changes through the day, understand your own pattern, and talk about it more precisely with your care team.",
  description:
    "Record how your Parkinson's medication response changes across the day as a single curve. Plain-language notes on the words used for medication fluctuation, what to look at in the graph, and what is worth writing down.",
  locale: 'en_US',
  lang: 'en',
} as const;

/** 사이트 전체 하단 안내. 한국어 MEDICAL_NOTICE와 같은 내용을 영어로 옮긴 것이다. */
export const EN_MEDICAL_NOTICE =
  "This site exists to help you record and understand changes in Parkinson's medication response. It does not diagnose or treat, and it does not replace your care team. Decisions about which medication you take, at what dose, and at what time belong with the clinicians who look after you.";

/** 어느 페이지에서나 같은 문장으로 반복되는 짧은 주의. */
export const EN_CURVE_NOTICE =
  'Every curve on this site is an illustration generated for teaching. It does not predict blood levels or any individual response.';

/** GA4가 실제로 켜져 있을 때만 EnFooter.astro가 보여준다. 한국어 GA_NOTICE와 같은 내용이다. */
export const EN_GA_NOTICE =
  'This site may use anonymized visit statistics to understand how it is used. It does not send personal medication or health records for analytics purposes.';

/** 한국어 nav.json과 같은 순서 — 아직 영문판이 없는 이야기/질문게시판만 뺐다. */
export const EN_NAV = [
  { href: '/en/', label: 'Home' },
  { href: '/en/diary/', label: 'Medication Diary' },
  { href: '/en/terms/', label: 'Words for the ups and downs' },
  { href: '/en/graphs/', label: 'Reading graphs' },
  { href: '/en/learn/', label: 'Learn' },
  { href: '/en/start/', label: 'Getting started' },
] as const;

/**
 * DayCurve 안에 그려지는 글자들.
 * 컴포넌트의 기본값은 한국어이므로, 영문 페이지에서만 이 값을 넘긴다.
 */
export const EN_GRAPH_LABELS = {
  high: 'higher',
  low: 'lower',
  series: 'Response through the day',
  reference: 'Reference curve, for comparison',
  dose: 'Time a dose was taken',
  doseShared: 'Time a dose was taken (same on both days)',
} as const;

/** 곡선 데이터 안의 한국어 라벨을 영어로 바꾼다. 원본 JSON은 고치지 않는다. */
const CURVE_TEXT: Record<string, string> = {
  '약 복용': 'Dose',
  '첫 복용': 'First dose',
  '아침 약': 'Morning dose',
  '상승 시작': 'Starts to rise',
  '최고 출력': 'Highest point',
  '그날의 최고 출력': 'Highest point that day',
  '첫 상승': 'Starts to rise',
  '하강': 'Coming down',
  '겨우 올라오기 시작': 'Only just starting to rise',
  // p-two-days.json 의 두 날짜 라벨 — same-drug-two-days.md 에서만 쓰인다.
  '3월 12일': 'March 12',
  '3월 15일': 'March 15',
};

/** 영문 페이지에 그래프를 놓을 때 이 함수를 거친다. */
export function enCurve(curve: CurveData): CurveData {
  const t = (s: string | null) => (s == null ? s : (CURVE_TEXT[s] ?? s));
  return {
    ...curve,
    label: t(curve.label ?? null) ?? undefined,
    compare: curve.compare ? { ...curve.compare, label: t(curve.compare.label) as string } : undefined,
    doses: curve.doses.map((d) => ({ ...d, label: t(d.label) })),
    marks: curve.marks.map((m) => ({ ...m, label: t(m.label) as string })),
  };
}

/**
 * 그래프를 글로 옮긴 설명 — 화면을 읽어 주는 사용자에게 전달되는 내용이다.
 * `src/lib/curve.ts`의 describe()와 같은 구조이며 한국어 쪽은 건드리지 않는다.
 */
export function describeEn(curve: CurveData): string {
  const [from, to] = curve.window;
  const hm = (t: number) =>
    `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  const parts = [
    `The horizontal axis runs from ${hm(from)} to ${hm(to)}. The vertical axis is how well the body is moving, relative to that person's own range — higher is better movement.`,
  ];
  if (curve.compare) {
    parts.push(
      `Two days with the same dose times are drawn on top of each other: ${curve.label ?? 'the first day'} and ${curve.compare.label}.`,
    );
  }
  if (curve.doses.length) {
    parts.push(`Doses are marked at ${curve.doses.map((d) => d.time).join(', ')}.`);
  }
  if (curve.marks.length) {
    parts.push(curve.marks.map((m) => `${m.label} around ${m.time}`).join(', ') + '.');
  } else {
    const peak = curve.points.reduce((a, p) => (p[1] > a[1] ? p : a), curve.points[0]);
    parts.push(
      `The highest point is around ${String(Math.floor(peak[0] / 60)).padStart(2, '0')}:${String(peak[0] % 60).padStart(2, '0')}.`,
    );
  }
  return parts.join(' ');
}
