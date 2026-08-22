#!/usr/bin/env node
/* ============================================================
   analyze-phase3.mjs — 3차 검정 1단계: 기술통계 우선

   이 스크립트는 환자를 분류하지 않는다.
   먼저 데이터 자체의 분포를 보여주는 것이 전부다.

   왜 분류하지 않는가:
   임의로 정한 cutoff로 먼저 나누면, 그 뒤에 보이는 "군집"은
   데이터가 아니라 cutoff가 만든 것이다. 그러면 우리 가설이
   맞는지 확인하는 것이 아니라 우리 가설을 재생산하게 된다.
   그래서 순서를 뒤집는다 — 분포를 먼저 보고, cutoff는 마지막에 제안만 한다.

   원칙
   - 원본 JSON은 읽기만 한다. 저장소에 올리지 않는다.
   - 분류 임계값(delayedRatio, incompleteRatio 등)을 쓰지 않는다.
   - "첫 상승"처럼 델타가 꼭 필요한 값은 하나로 확정하지 않고
     여러 델타로 동시에 계산해 민감도를 함께 보여준다.
   - "하강 중 복용"은 내가 정한 기울기 cutoff가 아니라
     사용자가 직접 기록한 trend='falling' 을 1차 기준으로 삼는다.
     측정된 기울기는 그 옆에 숫자로 같이 싣는다.
   - 사용자가 직접 단 state / trend / riseResult(reached·delayed·partial·failed)는
     ground truth 가 아니라 참고 라벨로 따로 보존한다.
   - IR(즉방형)과 HBS/CR(서방형)은 같은 time-to-ON 기준으로 합치지 않는다.
   - 용량 null, assumed, retrospective, 기록 공백은 메우지 않고 그대로 표시한다.

   사용법:
     node scripts/analyze-phase3.mjs <backup.json> [--out docs/PHASE3-REAL-DATA-VALIDATION.md] [--json]
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';

/* ---------- 관찰 파라미터 (분류 기준이 아니다) ---------- */
export const OBS = {
  windowBeforeMin: 90,
  windowAfterMin: 180,
  riseDeltaSweep: [5, 10, 15, 20],
  reachLevels: [50, 70, 80, 90],
  gapReportMin: 90,
  slopePointsMin: 3,
  levodopaCurveIds: ['LEVO_IR', 'LEVO_HBS', 'STALEVO'],
  irCurveIds: ['LEVO_IR', 'STALEVO'],
  crCurveIds: ['LEVO_HBS'],
};

export const OBS_NOTES = {
  windowBeforeMin: '복용 전 관찰창(분). 복용 직전 output과 기울기를 이 범위에서 본다.',
  windowAfterMin: '복용 후 관찰창(분). 지시받은 0~180분.',
  riseDeltaSweep: '"첫 상승"을 하나의 값으로 정하지 않고 이 델타들로 동시에 계산한다. 델타를 바꿔도 순서가 유지되면 그 관찰은 델타에 덜 민감한 것이다.',
  reachLevels: '도달시간을 재는 output 수준.',
  gapReportMin: '관찰창 안 기록 공백이 이보다 크면 표에 표시한다. 배제하지는 않는다.',
  slopePointsMin: '기울기를 계산하기 위한 두 점 사이 최소 간격(분). 너무 촘촘한 두 점은 기울기가 폭주한다.',
  levodopaCurveIds: '에피소드 단위로 삼는 레보도파계. 그 외 약은 에피소드로 만들지 않는다.',
  irCurveIds: '즉방형. 서방형과 시간축을 합치지 않는다.',
  crCurveIds: '서방형(HBS/CR). 별도 집계한다.',
};

/* ---------- 유틸 ---------- */
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hm = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const MIN = 60000;
const r1 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
const num = (v) => (v == null ? '—' : v);

function quantiles(arr) {
  const a = arr.filter((v) => v != null && !Number.isNaN(v)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const q = (p) => { const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo); };
  return { n: a.length, min: a[0], p25: r1(q(0.25)), median: r1(q(0.5)), p75: r1(q(0.75)), max: a[a.length - 1], sorted: a };
}

/* 정렬된 값에서 가장 큰 간격을 찾는다.
   cutoff 를 정하기 위한 것이 아니라, "cutoff 없이도 틈이 보이는가"를 보기 위한 것이다. */
function gapScan(arr, topN = 3) {
  const a = arr.filter((v) => v != null && !Number.isNaN(v)).slice().sort((x, y) => x - y);
  if (a.length < 4) return { ok: false, n: a.length, reason: '값이 4개 미만이라 틈을 논할 수 없다' };
  const spread = a[a.length - 1] - a[0];
  const gaps = [];
  for (let i = 1; i < a.length; i++) gaps.push({ lo: a[i - 1], hi: a[i], gap: r1(a[i] - a[i - 1]), belowN: i, aboveN: a.length - i });
  gaps.sort((x, y) => y.gap - x.gap);
  const top = gaps.slice(0, topN);
  return {
    ok: true, n: a.length, spread: r1(spread), top,
    // 가장 큰 틈이 전체 폭에서 차지하는 비율. 값이 클수록 자연스러운 갈라짐에 가깝다.
    largestGapRatio: spread > 0 ? r1(top[0].gap / spread) : null,
  };
}

/* ---------- 약 분류표 ---------- */
const FALLBACK_ALIASES = [
  { curveId: 'LEVO_IR', formulation: 'IR', names: ['마도파', '시네메트', '퍼킨', '레보도파', '도파민정', 'Madopar', 'Sinemet'] },
  { curveId: 'LEVO_HBS', formulation: 'HBS/CR', names: ['마도파 HBS', '마도파HBS', '시네메트 CR', '시네메트CR', 'Madopar HBS', 'Sinemet CR'] },
  { curveId: 'STALEVO', formulation: 'IR 복합', names: ['스타레보', '트리레보', 'Stalevo'] },
  { curveId: 'PRAMI_IR', formulation: 'IR', names: ['미라펙스', '미라팩스', '피디팩솔', '피디펙솔', '프라미펙솔', 'Mirapex'] },
  { curveId: 'PRAMI_ER', formulation: 'ER', names: ['미라펙스 ER', '미라펙스ER', '프라미펙솔 ER', '피디펙솔 ER', 'Mirapex ER'] },
  { curveId: 'ROPI_IR', formulation: 'IR', names: ['리큅', '로피니롤', 'Requip'] },
  { curveId: 'ROPI_ER', formulation: 'XL/ER', names: ['리큅 PD', '리큅PD', '리큅 XL', '로피니롤 서방', 'Requip XL'] },
  { curveId: 'ROTIGOTINE', formulation: '패치', names: ['뉴프로', '로티고틴', 'Neupro'] },
  { curveId: 'AMANTADINE', formulation: '정', names: ['아만타딘', '피케이멜즈', 'Symmetrel', 'Gocovri'] },
  { curveId: 'MAOB_FLAT', formulation: '정', names: ['아질렉트', '라사길린', '셀레길린', '마오비', 'Azilect', '사피나미드', '엑스어답션', '에퀴피나', '자디아고', 'Xadago'] },
  { curveId: 'ONGENTYS', formulation: '1일 1회', names: ['온젠티스', '오피카폰', 'Ongentys'] },
  { curveId: 'ENTACAPONE', formulation: '레보도파 병용', names: ['엔타카폰', '컴탄', '콤탄', 'Comtan'] },
  { curveId: 'APOMORPHINE', formulation: '주사', names: ['아포모르핀', '아포카인', 'Apokyn'] },
];

function loadDrugTable(dictPath) {
  let table = FALLBACK_ALIASES.map((d) => ({ ...d }));
  let source = '내장 별칭표 (drug-dictionary.json 없음)';
  if (dictPath && fs.existsSync(dictPath)) {
    try {
      const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
      const drugs = Array.isArray(dict.drugs) ? dict.drugs : Object.values(dict.drugs ?? {});
      if (drugs.length) { table = drugs.map((d) => ({ curveId: d.curveId, formulation: d.formulation, names: d.aliases ?? [] })); source = `drug-dictionary.json (v${dict.version})`; }
    } catch { /* 못 읽으면 내장표 */ }
  }
  const flat = [];
  for (const t of table) for (const n of t.names) flat.push({ ...t, name: n });
  flat.sort((a, b) => b.name.length - a.name.length);   // "마도파 HBS"가 "마도파"보다 먼저 맞아야 한다
  return { flat, source };
}
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');
function classifyDrug(name, flat) {
  if (!name) return null;
  const s = norm(name);
  for (const e of flat) if (s.includes(norm(e.name))) return { curveId: e.curveId, formulation: e.formulation, matched: e.name };
  return null;
}

/* ---------- 백업 파싱 ---------- */
export function parseBackup(db, flat) {
  const events = Array.isArray(db?.events) ? db.events.slice().sort((a, b) => a.ts - b.ts) : [];
  const isRetro = (e) => e.entryMode === 'retrospective' || e.retrospective === true || e.inputMethod === 'backdated_manual';
  const meds = [], states = [], symptoms = [], life = [], unknownDrugs = new Map();
  let statesNoOutput = 0;

  for (const e of events) {
    if (!e || typeof e.ts !== 'number') continue;
    const base = { id: e.id, ts: e.ts, day: dayKey(e.ts), hm: hm(e.ts), retro: isRetro(e), memo: e.memo || '' };
    if (e.type === 'med') {
      const cls = classifyDrug(e.drug, flat);
      if (!cls) unknownDrugs.set(e.drug, (unknownDrugs.get(e.drug) ?? 0) + 1);
      meds.push({ ...base, drug: e.drug ?? null, dose: e.dose ?? null, tabletMg: e.tabletMg ?? null, tabletCount: e.tabletCount ?? null,
        assumed: e.assumed === true, assumedRaw: e.assumed, fromSet: e.fromSet ?? null, curveId: cls?.curveId ?? null, formulation: cls?.formulation ?? null });
    } else if (e.type === 'state') {
      if (e.output == null || Number.isNaN(+e.output)) { statesNoOutput++; continue; }
      states.push({ ...base, output: +e.output, state: e.state ?? null, trend: e.trend ?? null, riseResult: e.riseResult ?? null,
        relatedFactorIds: e.relatedFactorIds ?? [], inputMethod: e.inputMethod ?? null,
        gait: e.gait ?? null, dysk: e.dysk ?? null, dyst: e.dyst ?? null, symptoms: e.symptoms ?? [] });
    } else if (e.type === 'symptom') {
      symptoms.push({ ...base, key: e.key ?? null, phase: e.phase ?? null, customText: e.customText ?? '',
        outputAtStart: e.outputAtStart ?? null, outputAtEnd: e.outputAtEnd ?? null });
    } else if (e.type === 'life') {
      life.push({ ...base, kind: e.kind ?? null, phase: e.phase ?? null, mealType: e.mealType ?? null, protein: e.protein === true,
        quality: e.quality ?? [], amount: e.amount ?? null, consistency: e.consistency ?? null, extras: e.extras ?? [],
        durationMin: e.durationMin ?? null, intensity: e.intensity ?? null, symptoms: e.symptoms ?? [] });
    }
  }
  const outs = states.map((s) => s.output);
  const grid = { distinct: [...new Set(outs)].sort((a, b) => a - b), mult10: outs.filter((o) => o % 10 === 0).length, total: outs.length };
  return { meds, states, symptoms, life, unknownDrugs, statesNoOutput, grid, totalEvents: events.length };
}

/* ---------- 에피소드 측정 (분류 없음) ---------- */
export function measureEpisodes(parsed, O = OBS) {
  const { meds, states } = parsed;
  const levoRaw = meds.filter((m) => O.levodopaCurveIds.includes(m.curveId));

  /* 같은 시각에 들어간 레보도파계는 임상적으로 한 번의 복용 사건이다.
     따로 세면 같은 행이 두 번 나오고 분포가 부풀려진다.
     IR과 CR이 같이 들어간 경우는 어느 쪽 시간 특성인지 가를 수 없으므로
     form='IR+CR'로 두고 §3 시간 분포에서 뺀다. */
  const byTs = new Map();
  for (const m of levoRaw) { if (!byTs.has(m.ts)) byTs.set(m.ts, []); byTs.get(m.ts).push(m); }
  const levo = [...byTs.entries()].sort((a, b) => a[0] - b[0]).map(([ts, items]) => {
    const forms = new Set(items.map((m) => O.irCurveIds.includes(m.curveId) ? 'IR' : O.crCurveIds.includes(m.curveId) ? 'CR' : '기타'));
    return {
      ts, day: items[0].day, hm: items[0].hm,
      drug: items.map((m) => m.drug).join(' + '),
      dose: items.map((m) => m.dose).every((d) => d == null) ? null : items.map((m) => m.dose ?? '?').join(' + '),
      anyDoseNull: items.some((m) => m.dose == null),
      nDrugs: items.length,
      form: forms.size > 1 ? 'IR+CR' : [...forms][0],
      assumed: items.some((m) => m.assumed), assumedUnknown: items.every((m) => m.assumedRaw === undefined),
      retro: items.some((m) => m.retro),
      curveIds: [...new Set(items.map((m) => m.curveId))],
    };
  });

  const slopeBetween = (a, b) => {
    const dtH = (b.ts - a.ts) / 3600000;
    return dtH * 60 >= O.slopePointsMin ? (b.output - a.output) / dtH : null;
  };

  return levo.map((dose, i) => {
    const nextLevo = levo.find((m) => m.ts > dose.ts);
    const nextAny = meds.find((m) => m.ts > dose.ts);
    const nextLevoMin = nextLevo ? Math.round((nextLevo.ts - dose.ts) / MIN) : null;
    const obsEndMin = Math.min(O.windowAfterMin, nextLevoMin ?? O.windowAfterMin);
    const truncated = nextLevoMin != null && nextLevoMin < O.windowAfterMin;

    const before = states.filter((s) => s.ts >= dose.ts - O.windowBeforeMin * MIN && s.ts <= dose.ts);
    const after = states.filter((s) => s.ts > dose.ts && s.ts <= dose.ts + obsEndMin * MIN)
      .map((s) => ({ ...s, dt: Math.round((s.ts - dose.ts) / MIN) }));

    const preState = before.length ? before[before.length - 1] : null;
    const preOut = preState?.output ?? null;
    const preOutAgoMin = preState ? Math.round((dose.ts - preState.ts) / MIN) : null;
    const preSlope = before.length >= 2 ? slopeBetween(before[before.length - 2], before[before.length - 1]) : null;
    const postSlope = preState && after.length ? slopeBetween(preState, after[0])
      : after.length >= 2 ? slopeBetween(after[0], after[1]) : null;

    const outs = after.map((s) => s.output);
    const peak = outs.length ? Math.max(...outs) : null;
    const trough = outs.length ? Math.min(...outs) : null;
    const peakPt = peak != null ? after.find((s) => s.output === peak) : null;
    const troughPt = trough != null ? after.find((s) => s.output === trough) : null;

    // 첫 상승: 델타를 하나로 정하지 않고 전부 계산한다
    const firstObsMin = after.length ? after[0].dt : null;
    const firstRiseByDelta = {};
    for (const d of O.riseDeltaSweep) {
      firstRiseByDelta[d] = preOut == null ? null : (after.find((s) => s.output - preOut >= d)?.dt ?? null);
    }
    const reachByLevel = {};
    for (const lv of O.reachLevels) reachByLevel[lv] = after.find((s) => s.output >= lv)?.dt ?? null;

    let maxGap = null;
    const seq = [...(preState ? [preState] : []), ...after];
    for (let k = 1; k < seq.length; k++) { const g = Math.round((seq[k].ts - seq[k - 1].ts) / MIN); if (maxGap == null || g > maxGap) maxGap = g; }

    // 하강 중 복용: 사용자가 기록한 trend 를 1차 기준으로 삼는다 (내가 만든 기울기 cutoff 아님)
    const fallingRecorded = preState?.trend === 'falling';

    // 하강 → 최저점 → 반등 구조
    let declineStruct = null;
    if (after.length && preOut != null) {
      const keptFalling = trough != null && trough < preOut;
      const reboundByDelta = {};
      if (troughPt) for (const d of O.riseDeltaSweep) {
        const p = after.find((s) => s.ts > troughPt.ts && s.output - trough >= d);
        reboundByDelta[d] = p ? { min: Math.round((p.ts - dose.ts) / MIN), output: p.output } : null;
      }
      const afterTroughPeak = troughPt ? Math.max(...after.filter((s) => s.ts >= troughPt.ts).map((s) => s.output)) : null;
      declineStruct = { keptFalling, troughOut: trough, troughMin: troughPt?.dt ?? null, reboundByDelta, afterTroughPeak };
    }

    // 사용자 참고 라벨 — ground truth 아님
    const userLabels = {
      preTrend: preState?.trend ?? null, preState: preState?.state ?? null,
      riseResults: [...new Set(after.map((s) => s.riseResult).filter(Boolean))],
      relatedFactors: [...new Set(after.flatMap((s) => s.relatedFactorIds ?? []))],
      inputMethods: [...new Set(after.map((s) => s.inputMethod).filter(Boolean))],
      trends: [...new Set(after.map((s) => s.trend).filter(Boolean))],
      states: [...new Set(after.map((s) => s.state).filter(Boolean))],
    };

    return {
      idx: i + 1, day: dose.day, hm: dose.hm, ts: dose.ts,
      drug: dose.drug, dose: dose.dose, doseIsNull: dose.anyDoseNull, nDrugs: dose.nDrugs,
      curveIds: dose.curveIds, form: dose.form,
      assumed: dose.assumed, assumedUnknown: dose.assumedUnknown, retro: dose.retro,
      preOut, preOutAgoMin, preSlope: r1(preSlope), postSlope: r1(postSlope), fallingRecorded,
      nextLevoMin, nextAnyMin: nextAny ? Math.round((nextAny.ts - dose.ts) / MIN) : null,
      nextAnyDrug: nextAny?.drug ?? null, obsEndMin, truncated,
      nAfter: after.length, maxGap, gapFlag: maxGap != null && maxGap > O.gapReportMin,
      peak, peakMin: peakPt?.dt ?? null, trough, troughMin: troughPt?.dt ?? null,
      firstObsMin,
      // 첫 상승이 첫 관찰과 같은 시점이면, 그 값은 "그때 올랐다"가 아니라
      // "그때는 이미 올라 있었다"이다 — 실제 상승 시점은 그보다 이를 수 있다(좌측 절단).
      riseCensored: preOut != null && firstObsMin != null && firstRiseByDelta[10] === firstObsMin,
      firstRiseByDelta, reachByLevel, declineStruct, userLabels, after,
    };
  });
}

/* ---------- 집계 ---------- */
export function summarize(eps, O = OBS) {
  const byForm = {};
  for (const form of ['IR', 'CR']) {
    const list = eps.filter((e) => e.form === form);
    if (!list.length) { byForm[form] = { n: 0 }; continue; }
    const D = O.riseDeltaSweep[1] ?? O.riseDeltaSweep[0];   // 대표 표시용 델타 (분류에는 쓰지 않는다)
    byForm[form] = {
      n: list.length,
      preOut: quantiles(list.map((e) => e.preOut)),
      peak: quantiles(list.map((e) => e.peak)),
      trough: quantiles(list.map((e) => e.trough)),
      peakMin: quantiles(list.map((e) => e.peakMin)),
      preSlope: quantiles(list.map((e) => e.preSlope)),
      postSlope: quantiles(list.map((e) => e.postSlope)),
      nextLevoMin: quantiles(list.map((e) => e.nextLevoMin)),
      firstRise: Object.fromEntries(O.riseDeltaSweep.map((d) => [d, quantiles(list.map((e) => e.firstRiseByDelta[d]))])),
      reach: Object.fromEntries(O.reachLevels.map((lv) => [lv, quantiles(list.map((e) => e.reachByLevel[lv]))])),
      censoredRise: list.filter((e) => e.riseCensored).length,
      withRise: list.filter((e) => e.firstRiseByDelta[10] != null).length,
      firstObs: quantiles(list.map((e) => e.firstObsMin)),
      nAfter: quantiles(list.map((e) => e.nAfter)),
      gaps: {
        firstRise: gapScan(list.map((e) => e.firstRiseByDelta[D])),
        peak: gapScan(list.map((e) => e.peak)),
        reach80: gapScan(list.map((e) => e.reachByLevel[80])),
      },
      repDelta: D,
    };
  }
  // 사용자 참고 라벨 분포
  const labelCounts = {}, factorCounts = {}, inputMethodCounts = {};
  for (const e of eps) {
    for (const r of e.userLabels.riseResults) labelCounts[r] = (labelCounts[r] ?? 0) + 1;
    for (const f of e.userLabels.relatedFactors) factorCounts[f] = (factorCounts[f] ?? 0) + 1;
    for (const m of e.userLabels.inputMethods) inputMethodCounts[m] = (inputMethodCounts[m] ?? 0) + 1;
  }
  const declines = eps.filter((e) => e.fallingRecorded || (e.preSlope != null && e.preSlope < 0));
  const byHour = {};
  for (const e of eps) { const h = +e.hm.slice(0, 2); (byHour[h] = byHour[h] ?? []).push(e); }
  const hourRows = Object.keys(byHour).map(Number).sort((a, b) => a - b).map((h) => {
    const l = byHour[h];
    return { hour: h, n: l.length, forms: [...new Set(l.map((e) => e.form))].join('/'),
      drugs: [...new Set(l.map((e) => e.drug))].join(' / '),
      peaks: l.map((e) => e.peak), peakQ: quantiles(l.map((e) => e.peak)),
      noData: l.filter((e) => e.nAfter === 0).length,
      truncated: l.filter((e) => e.truncated).length };
  });
  return { byForm, byHour: hourRows, labelCounts, factorCounts, inputMethodCounts, mixedForm: eps.filter((e) => e.form === 'IR+CR').length, declineCandidates: declines.length };
}

/* ---------- 실행 ---------- */
function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) { console.error('사용법: node scripts/analyze-phase3.mjs <backup.json> [--out <md>] [--json]'); process.exit(2); }
  if (!fs.existsSync(file)) { console.error(`파일을 찾을 수 없습니다: ${file}`); process.exit(2); }
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : 'docs/PHASE3-REAL-DATA-VALIDATION.md';
  const dictPath = args.includes('--dict') ? args[args.indexOf('--dict') + 1]
    : ['/home/user/luke777-cpu/parkinson/drug-dictionary.json', 'drug-dictionary.json'].find((p) => fs.existsSync(p));
  const { flat, source: dictSource } = loadDrugTable(dictPath);

  const db = JSON.parse(fs.readFileSync(file, 'utf8'));   // 읽기 전용
  const parsed = parseBackup(db, flat);
  const eps = measureEpisodes(parsed, OBS);
  const sum = summarize(eps, OBS);

  const payload = { sourceFile: path.basename(file), drugTableSource: dictSource, obs: OBS, parsed: {
    totalEvents: parsed.totalEvents, medEvents: parsed.meds.length, stateEvents: parsed.states.length,
    statesNoOutput: parsed.statesNoOutput, symptomEvents: parsed.symptoms.length, lifeEvents: parsed.life.length,
    retroStates: parsed.states.filter((s) => s.retro).length, retroMeds: parsed.meds.filter((m) => m.retro).length,
    grid: parsed.grid,
    assumedDoses: parsed.meds.filter((m) => m.assumed).length, nullDose: parsed.meds.filter((m) => m.dose == null).length,
    unknownDrugs: Object.fromEntries(parsed.unknownDrugs), days: [...new Set(parsed.meds.map((m) => m.day))].sort(),
  }, summary: sum, episodes: eps.map((e) => ({ ...e, after: e.after.map((s) => ({ dt: s.dt, output: s.output, state: s.state, trend: s.trend, riseResult: s.riseResult })) })) };

  if (args.includes('--json')) { console.log(JSON.stringify(payload, null, 2)); return; }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, render(payload, eps, sum, parsed));
  console.log(`레보도파 에피소드 ${eps.length}건 (IR ${sum.byForm.IR?.n ?? 0} / CR ${sum.byForm.CR?.n ?? 0}) → ${outPath}`);
}

function qRow(label, q) { return q ? `| ${label} | ${q.n} | ${q.min} | ${q.p25} | ${q.median} | ${q.p75} | ${q.max} |` : `| ${label} | 0 | — | — | — | — | — |`; }

function render(p, eps, sum, parsed) {
  const L = [], P = p.parsed;
  L.push('# 3차 검정 — 실제 백업 데이터에서 패턴이 나뉘는가', '');
  L.push('> **1단계: 기술통계.** 이 문서는 환자를 분류하지 않는다. 데이터의 분포를 먼저 본다.');
  L.push('> 임의 cutoff로 먼저 나누면 그 뒤에 보이는 군집은 데이터가 아니라 cutoff가 만든 것이기 때문이다.');
  L.push('> 자동 진단도 치료 판단도 아니며, 환자용 페이지에 이 수치를 옮기지 않는다.', '');
  L.push(`- 분석 파일: \`${p.sourceFile}\` (읽기 전용. 저장소에 올리지 않는다)`);
  L.push(`- 약 분류표: ${p.drugTableSource}`);
  L.push('- 재현: `node scripts/analyze-phase3.mjs <backup.json>`', '');

  L.push('## 0. 관찰 파라미터 (분류 기준이 아니다)', '');
  L.push('| 이름 | 값 | 뜻 |', '|---|---|---|');
  for (const [k, v] of Object.entries(p.obs)) L.push(`| \`${k}\` | ${Array.isArray(v) ? v.join(', ') : v} | ${OBS_NOTES[k] ?? ''} |`);
  L.push('', '**이 단계에는 `delayedRatio`·`incompleteRatio` 같은 분류 임계값이 없다.** 마지막 장에서 관찰된 분포를 근거로 제안만 한다.', '');

  L.push('## 1. 데이터 개요', '');
  L.push('| 항목 | 값 |', '|---|---|');
  L.push(`| 전체 이벤트 | ${P.totalEvents} |`);
  L.push(`| 복용 기록 | ${P.medEvents} (assumed ${P.assumedDoses} · 용량 null ${P.nullDose} · retrospective ${P.retroMeds}) |`);
  L.push(`| 상태 기록(output 있음) | ${P.stateEvents} (retrospective ${P.retroStates}) |`);
  L.push(`| output 없어 제외한 상태 기록 | ${P.statesNoOutput} |`);
  L.push(`| 증상 이벤트 | ${P.symptomEvents} |`);
  L.push(`| 생활 기록 | ${P.lifeEvents} |`);
  L.push(`| **레보도파계 에피소드** | **${eps.length}** (IR ${sum.byForm.IR?.n ?? 0} / CR ${sum.byForm.CR?.n ?? 0}) |`);
  L.push(`| 기록된 날짜 | ${P.days.length}일 (${P.days[0] ?? '—'} ~ ${P.days[P.days.length - 1] ?? '—'}) |`);
  L.push(`| IR+CR 동시 복용(시간 분포에서 제외) | ${sum.mixedForm} |`);
  L.push(`| output 눈금 | 실제 사용된 값 ${P.grid.distinct.join(', ')} — **${P.grid.mult10}/${P.grid.total}이 10의 배수** |`);
  if (Object.keys(P.unknownDrugs).length) L.push(`| 사전에 없는 약 이름 | ${Object.entries(P.unknownDrugs).map(([k, v]) => `${k}(${v})`).join(', ')} |`);
  L.push('', '용량이 `null`인 기록은 채우지 않고 그대로 두었다.');
  L.push('', '**output 눈금이 사실상 10 단위다.** 그래서 최고 output 축에서 보이는 "틈"은 군집이 아니라 눈금 간격일 수 있다. §4를 읽을 때 이 점을 먼저 감안해야 한다.', '');

  L.push('## 2. 전체 에피소드 원자료표', '');
  L.push('시간 단위는 분, `첫상승`은 델타 10 기준(다른 델타는 §3에 함께 싣는다).');
  L.push('', '**`첫상승`에 붙은 ⚠는 그 값이 첫 관찰 시점과 같다는 뜻이다.** 그 경우 "그때 올랐다"가 아니라 "그때는 이미 올라 있었다"이므로, 실제 상승은 그보다 이를 수 있다(좌측 절단). 절단된 값을 늦은 것으로 읽으면 안 된다.', '');
  L.push('| # | 날짜 | 시각 | 제형 | 약/용량 | 복용전 out | 복용전 기울기/h | 복용후 기울기/h | 최저 | 최고 | 최고까지 | 첫관찰 | 첫상승(δ10) | →50 | →70 | →80 | →90 | 다음복용 | 기록수 | 최대공백 | 사용자 라벨 | 플래그 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const e of eps) {
    const flags = [e.assumed && 'assumed', e.assumedUnknown && 'assumed필드없음', e.retro && 'retro', e.nDrugs > 1 && `${e.nDrugs}제 동시`, e.form === 'IR+CR' && 'IR+CR 혼합', e.truncated && `관찰${e.obsEndMin}분에서 끊김`, e.gapFlag && `공백${e.maxGap}분`, e.doseIsNull && '용량null', e.fallingRecorded && '복용시 하강기록'].filter(Boolean).join(' · ');
    const lab = [e.userLabels.preTrend && `전:${e.userLabels.preTrend}`, ...e.userLabels.riseResults.map((r) => `rise:${r}`), ...e.userLabels.relatedFactors.map((f) => `f:${f}`)].join(' ');
    L.push(`| ${e.idx} | ${e.day} | ${e.hm} | ${e.form} | ${e.drug ?? '—'}${e.dose != null ? ` ${e.dose}` : ''} | ${num(e.preOut)} | ${num(e.preSlope)} | ${num(e.postSlope)} | ${num(e.trough)} | ${num(e.peak)} | ${num(e.peakMin)} | ${num(e.firstObsMin)} | ${num(e.firstRiseByDelta[10])}${e.riseCensored ? '⚠' : ''} | ${num(e.reachByLevel[50])} | ${num(e.reachByLevel[70])} | ${num(e.reachByLevel[80])} | ${num(e.reachByLevel[90])} | ${num(e.nextLevoMin)} | ${e.nAfter} | ${num(e.maxGap)} | ${lab || '—'} | ${flags || '—'} |`);
  }
  L.push('');

  L.push('## 3. 분포 — IR과 CR을 합치지 않는다', '');
  for (const form of ['IR', 'CR']) {
    const s = sum.byForm[form];
    L.push(`### ${form} (${s?.n ?? 0}건)`, '');
    if (!s?.n) { L.push('해당 에피소드 없음.', ''); continue; }
    L.push('| 값 | n | 최소 | p25 | 중앙값 | p75 | 최대 |', '|---|---|---|---|---|---|---|');
    L.push(qRow('복용 직전 output', s.preOut));
    L.push(qRow('최고 output', s.peak));
    L.push(qRow('최저 output', s.trough));
    L.push(qRow('최고점까지 (분)', s.peakMin));
    L.push(qRow('복용 직전 기울기 (/h)', s.preSlope));
    L.push(qRow('복용 직후 기울기 (/h)', s.postSlope));
    L.push(qRow('다음 레보도파까지 (분)', s.nextLevoMin));
    L.push(qRow('첫 관찰까지 (분)', s.firstObs));
    L.push(qRow('복용 후 기록 수', s.nAfter));
    for (const d of p.obs.riseDeltaSweep) L.push(qRow(`첫 상승까지 · δ${d} (분)`, s.firstRise[d]));
    for (const lv of p.obs.reachLevels) L.push(qRow(`output ${lv} 도달 (분)`, s.reach[lv]));
    L.push('');
    L.push(`**첫 상승이 측정된 에피소드 ${s.withRise}건 가운데 ${s.censoredRise}건이 첫 관찰 시점과 같다(좌측 절단).**`, '');
    L.push(`**정렬값** — 첫상승(δ${s.repDelta}): ${s.firstRise[s.repDelta]?.sorted.join(', ') ?? '—'}`);
    L.push(`**정렬값** — 최고 output: ${s.peak?.sorted.join(', ') ?? '—'}`, '');
  }

  L.push('### 복용 시각대별 (시각은 데이터이지 내가 정한 구간이 아니다)', '');
  L.push('| 복용 시각 | 건수 | 제형 | 약 | 최고 output (개별) | 중앙값 | 기록 0건 | 관찰 끊김 |', '|---|---|---|---|---|---|---|---|');
  for (const r of sum.byHour) L.push(`| ${String(r.hour).padStart(2, '0')}시 | ${r.n} | ${r.forms} | ${r.drugs} | ${r.peaks.map((v) => v ?? '—').join(', ')} | ${r.peakQ?.median ?? '—'} | ${r.noData} | ${r.truncated} |`);
  L.push('', '같은 약이라도 시각대에 따라 최고 output이 크게 다르다면, 에피소드를 시각대와 무관하게 한 무리로 묶어 비교하는 것 자체가 성립하지 않는다.', '');

  L.push('## 4. cutoff 없이도 군집이 보이는가', '');
  L.push('정렬한 값들 사이의 **가장 큰 틈**을 본다. 임계값을 정하기 위한 것이 아니라, 임계값 없이도 데이터가 갈라지는지 보기 위한 것이다.');
  L.push('`틈/전체폭`이 클수록 자연스러운 갈라짐에 가깝고, 값이 고르게 퍼져 있으면 그 축에서는 군집이 없다는 뜻이다.', '');
  L.push('**두 가지를 먼저 감안해야 한다.** (1) output 눈금이 10 단위이므로 최고 output 축의 틈은 눈금 폭일 수 있다. (2) 첫 상승 값이 좌측 절단되어 있으면(§2의 ⚠) 그 축의 틈은 상승 시점이 아니라 기록 시점의 분포다.', '');
  for (const form of ['IR', 'CR']) {
    const s = sum.byForm[form];
    if (!s?.n) continue;
    L.push(`### ${form}`, '', '| 축 | n | 전체폭 | 가장 큰 틈 | 위치 | 틈/전체폭 | 아래:위 |', '|---|---|---|---|---|---|---|');
    for (const [axis, label] of [['firstRise', `첫 상승 시간 (δ${s.repDelta})`], ['reach80', 'output 80 도달 시간'], ['peak', '최고 output']]) {
      const g = s.gaps[axis];
      if (!g?.ok) { L.push(`| ${label} | ${g?.n ?? 0} | — | — | — | — | ${g?.reason ?? ''} |`); continue; }
      const t = g.top[0];
      L.push(`| ${label} | ${g.n} | ${g.spread} | ${t.gap} | ${t.lo} → ${t.hi} | ${g.largestGapRatio} | ${t.belowN}:${t.aboveN} |`);
    }
    L.push('');
  }

  L.push('## 5. 하강 중 복용 — 하강 억제 실패 관찰 (decline not arrested)', '');
  L.push('**이것을 처음부터 ON Failure라고 부르지 않는다.** 먼저 `복용 → 계속 하강 → 최저점 → 반등` 구조가 실제로 있는지만 본다.');
  L.push('하강 중 여부는 내가 정한 기울기 cutoff가 아니라 **사용자가 직접 기록한 `trend=falling`**을 기준으로 잡았고, 측정된 기울기는 옆에 함께 싣는다.', '');
  const dec = eps.filter((e) => e.fallingRecorded);
  if (!dec.length) L.push('사용자가 `trend=falling`으로 기록한 직전 상태를 가진 에피소드가 없다.', '');
  else {
    L.push('| # | 날짜 | 시각 | 제형 | 복용전 out | 복용전 기울기/h | 복용후 기울기/h | 하강 지속 | 최저 | 최저까지 | 반등(δ10) | 반등 output | 최저 이후 최고 | 후분류 후보 |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const e of dec) {
      const d = e.declineStruct; const rb = d?.reboundByDelta?.[10] ?? null;
      let sub = '판정 보류';
      if (d) {
        if (!d.keptFalling) sub = '하강이 이어지지 않음 — 억제 실패 아님';
        else if (!rb) sub = '관찰기간 중 반등 없음 → ON failure 후보';
        else sub = `${rb.min}분에 반등 — 늦은지/낮은지는 §3 분포와 대조 필요`;
      }
      L.push(`| ${e.idx} | ${e.day} | ${e.hm} | ${e.form} | ${num(e.preOut)} | ${num(e.preSlope)} | ${num(e.postSlope)} | ${d ? (d.keptFalling ? '예' : '아니오') : '—'} | ${num(d?.troughOut)} | ${num(d?.troughMin)} | ${rb ? rb.min : '없음'} | ${rb ? rb.output : '—'} | ${num(d?.afterTroughPeak)} | ${sub} |`);
    }
    L.push('', '후분류(늦게 충분히 반등 → delayed response 후보 / 낮게 반등 → incomplete response 후보 / 반등 없음 → ON failure 후보)는 §3 분포와 대조한 뒤 §7에서 다룬다.', '');
  }

  L.push('## 6. 사용자가 직접 단 라벨 (참고용 · ground truth 아님)', '');
  L.push('앱의 `riseResult`는 사용자가 그 자리에서 고른 값이다. 정답이 아니라 **그때의 주관적 판단**이므로 분류에 쓰지 않고 따로 보존한다.', '');
  if (!Object.keys(sum.labelCounts).length) L.push('`riseResult`가 기록된 에피소드가 없다.', '');
  else {
    L.push('| 라벨 | 건수 |', '|---|---|');
    const KO = { reached: '정상 ON 도달', delayed: 'Delayed ON', partial: '불완전 ON', failed: 'ON 실패' };
    for (const [k, v] of Object.entries(sum.labelCounts)) L.push(`| \`${k}\` ${KO[k] ?? ''} | ${v} |`);
    L.push('', '이 라벨과 측정값이 어긋나는 사례가 있는지는 §2 원자료표에서 직접 대조할 수 있다.', '');
  }
  if (Object.keys(sum.factorCounts).length) {
    L.push('', '앱이 그 기록에 함께 붙여 둔 `relatedFactorIds` — **동반 조건이지 원인이 아니다.**', '');
    L.push('| 요인 | 에피소드 수 |', '|---|---|');
    for (const [k, v] of Object.entries(sum.factorCounts).sort((a, b) => b[1] - a[1])) L.push(`| \`${k}\` | ${v} |`);
  }
  if (Object.keys(sum.inputMethodCounts).length) {
    L.push('', '관찰창 안 상태기록의 입력 경로 — 실시간(`quick`)과 회고(`backdated_manual`)를 구분해야 한다. `tempnote_review`는 그때 남긴 메모를 나중에 정리한 것이다.', '');
    L.push('| inputMethod | 에피소드 수 |', '|---|---|');
    for (const [k, v] of Object.entries(sum.inputMethodCounts).sort((a, b) => b[1] - a[1])) L.push(`| \`${k}\` | ${v} |`);
  }

  L.push('## 7. 다섯 가지 질문에 대한 관찰', '');
  L.push('아래는 **위 분포를 보고 사람이 판단해야 할 항목**이다. 스크립트가 자동으로 답을 내지 않는다.', '');
  L.push('1. 정상 반응군이 자연스럽게 형성되는가 — §3 최고 output 분포와 §4 틈 분석');
  L.push('2. Delayed ON 후보가 시간축에서 실제로 떨어지는가 — §4 `첫 상승 시간` 틈');
  L.push('3. Incomplete ON 후보가 최고 output 축에서 떨어지는가 — §4 `최고 output` 틈');
  L.push('4. ON Failure 후보가 실제로 존재하는가 — §2에서 `첫상승`이 비어 있는 행');
  L.push('5. 하강 억제 실패가 ON Failure와 다른 곡선인가 — §5 표');
  L.push('', '두 축의 틈이 모두 작으면 **"이 데이터에서는 나뉘지 않는다"**가 결론이며, 그렇게 적어야 한다.', '');

  L.push('## 8. 한계', '');
  for (const x of ['단일 환자 데이터다. 일반화할 수 없다.', '기록 간격이 불규칙하다.', 'retrospective 기록이 섞여 있다.',
    '약물 조합이 복잡하다.', '추가복용이 흔해 한 dose의 효과를 분리하기 어려운 에피소드가 있다.',
    '생활 조건이 통제되지 않았다.', 'output은 환자 자가평가다.', '표본이 작아 복잡한 통계검정을 하지 않았다.']) L.push(`- ${x}`);
  L.push('', '따라서 이 문서의 결과는 **패턴 관찰과 가설 생성** 수준이다.', '');
  return L.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) main();
