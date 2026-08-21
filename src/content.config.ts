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

export const collections = { understand, graphs, diary };
