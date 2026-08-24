import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const related = z
  .array(z.object({ label: z.string(), href: z.string().nullable(), note: z.string().optional() }))
  .default([]);

/**
 * "약효 이해하기" 개념 글.
 * 모든 글이 같은 구조를 갖도록 스키마로 강제한다. 항목이 빠지면 빌드가 실패하므로
 * 글마다 설명 순서가 달라지는 일이 생기지 않는다.
 */
const understand = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/understand' }),
  schema: z.object({
    title: z.string(),
    term: z.string(),
    description: z.string(),
    /** 1. 한 줄 정의 */
    definition: z.string(),
    /** 2. 그래프로 보면 — 쓸 곡선 데이터 파일의 id */
    curve: z.string().optional(),
    curveTitle: z.string().optional(),
    curveCaption: z.string().optional(),
    /** 3. 환자가 흔히 느끼는 표현 */
    expressions: z.array(z.string()).default([]),
    /** 4. 가능한 원인 — 확정이 아니라 함께 이야기되는 요인 */
    causes: z.array(z.string()).default([]),
    /** 5. 기록할 것 */
    record: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
    /** 6. 치료진에게 보여줄 때 중요한 정보 */
    forVisit: z.array(z.string()).default([]),
    /** 7. 관련 글 */
    related,
    order: z.number().default(99),
  }),
});

/**
 * "그래프 읽기" 글.
 * 구성은 세 단계로 고정한다 — 그래프 → 짧은 설명 → 무엇을 기록해야 하는가.
 */
const graphs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/graphs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** 한 줄 요약 */
    lead: z.string(),
    curve: z.string(),
    curveTitle: z.string(),
    curveCaption: z.string().optional(),
    /** 곡선의 어디를 보는가 */
    look: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
    /** 무엇을 기록해야 하는가 */
    record: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
    related,
    order: z.number().default(99),
  }),
});

/** "약효일지" 사용법 글. */
const diary = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/diary' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    lead: z.string(),
    /** 순서대로 따라 하는 단계 */
    steps: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
    /** 알아두면 좋은 것 */
    notes: z.array(z.string()).default([]),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    related,
    order: z.number().default(99),
  }),
});

/**
 * "배우기" 글.
 * 하나의 조건(식사·수면·장운동 같은)이 곡선을 어떻게 흔드는지 짧게 읽는 글이다.
 * 순서는 개념 글과 같은 이유로 고정한다 —
 *   1 한 줄 요약 → 2 그래프로 보면 → 3 흔히 하는 말 → 4 왜 그럴 수 있는가
 *   → 5 며칠만 기록해 보기 → 6 진료에서 → 7 자주 묻는 것 → 8 관련 글
 */
const learn = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/learn' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** 1. 한 줄 요약 */
    lead: z.string(),
    /** 2. 그래프로 보면 — 쓸 곡선 데이터 파일의 id */
    curve: z.string().optional(),
    curveTitle: z.string().optional(),
    curveCaption: z.string().optional(),
    /** 3. 환자가 흔히 하는 말 */
    expressions: z.array(z.string()).default([]),
    /** 4. 왜 그럴 수 있는가 — 확정이 아니라 함께 이야기되는 이유 */
    reasons: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
    /** 5. 며칠만 기록해 보기 */
    record: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
    /** 6. 치료진에게 보여줄 때 중요한 정보 */
    forVisit: z.array(z.string()).default([]),
    /** 7. 자주 묻는 것 */
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    related,
    order: z.number().default(99),
  }),
});

/**
 * 영문 섹션(/en/terms/)의 용어 글.
 *
 * 한국어 understand 컬렉션과 필드 구성을 일부러 똑같이 맞췄다. 같은 순서로 읽히고,
 * 한쪽에만 있는 항목이 생기지 않게 하기 위해서다. 별도 컬렉션으로 둔 이유는
 * 한국어 글의 스키마를 영어 때문에 고치는 일이 없도록 하기 위해서다.
 */
/**
 * 영문 학습 글(/en/learn/). 한국어 learn 의 「몸으로 쓰는 약리학」·「몸으로 배우는
 * 신경해부학」 시리즈를 영어로 옮긴 것. 필드는 learn 과 같은 뼈대를 쓰되,
 * 영문판은 본문 중심이라 목록형 필드는 생략 가능하게 두었다.
 */
const enLearn = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/en-learn' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    lead: z.string().optional(),
    order: z.number().default(99),
    related,
  }),
});

const enTerms = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/en-terms' }),
  schema: z.object({
    title: z.string(),
    term: z.string(),
    description: z.string(),
    /** 1. 한 줄 설명 — 형식적 정의가 아니라 쉬운 말 설명이다 */
    definition: z.string(),
    /** 2. 그래프로 보면 */
    curve: z.string().optional(),
    curveTitle: z.string().optional(),
    curveCaption: z.string().optional(),
    /** 3. 흔히 쓰는 표현 */
    expressions: z.array(z.string()).default([]),
    /** 4. 함께 이야기되는 요인 — 원인을 확정하는 목록이 아니다 */
    causes: z.array(z.string()).default([]),
    /** 5. 기록할 것 */
    record: z.array(z.object({ title: z.string(), detail: z.string() })).default([]),
    /** 6. 치료진과 상의할 때 보여줄 항목 */
    forVisit: z.array(z.string()).default([]),
    /** 7. 관련 글 */
    related,
    /** 같은 내용을 다루는 한국어 글의 경로 — hreflang 과 언어 전환에 쓴다 */
    koPath: z.string().optional(),
    order: z.number().default(99),
  }),
});

export const collections = { understand, graphs, diary, learn, enTerms, enLearn };
