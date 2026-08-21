import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

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
    related: z.array(z.object({ label: z.string(), href: z.string().nullable(), note: z.string().optional() })).default([]),
    order: z.number().default(99),
  }),
});

export const collections = { understand };
