import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import series from '../data/series.json';
import enSeries from '../data/en/series.json';
import { url } from '../lib/url';

/**
 * sitemap을 직접 만든다. 이 정도 규모에서는 통합 패키지를 넣는 것보다
 * 여기 목록을 보는 편이 어떤 페이지가 있는지 알기 쉽다.
 */
export const GET: APIRoute = async ({ site }) => {
  const [concepts, graphs, diary, learn, enTerms, enLearn] = await Promise.all([
    getCollection('understand'),
    getCollection('graphs'),
    getCollection('diary'),
    getCollection('learn'),
    getCollection('enTerms'),
    getCollection('enLearn'),
  ]);
  const paths = [
    '/',
    '/diary/',
    '/understand/',
    '/graphs/',
    '/learn/',
    '/story/',
    '/start/',
    // 게시판은 목록만 넣는다. 로그인·닉네임 설정·글 상세(?id=)는
    // 검색에 걸릴 이유가 없고 내용도 매번 다르다.
    '/questions/',
    ...diary.map((d) => `/diary/${d.id}/`),
    ...concepts.map((c) => `/understand/${c.id}/`),
    ...graphs.map((g) => `/graphs/${g.id}/`),
    ...learn.map((l) => `/learn/${l.id}/`),
    '/learn/map/',
    ...Object.keys(series).map((key) => `/learn/series/${key}/`),
    // 영문 섹션
    '/en/',
    '/en/terms/',
    '/en/learn/',
    '/en/learn/map/',
    '/en/start/',
    ...enTerms.map((t) => `/en/terms/${t.id}/`),
    ...enLearn.map((t) => `/en/learn/${t.id}/`),
    ...Object.keys(enSeries).map((key) => `/en/learn/series/${key}/`),
  ];

  const base = site ?? new URL('http://localhost');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${new URL(url(p), base).toString()}</loc></url>`).join('\n')}
</urlset>
`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
