import type { APIRoute } from 'astro';
import { url } from '../lib/url';

/** 배포 주소가 바뀌어도 sitemap 위치가 따라가도록 빌드 시 만든다. */
export const GET: APIRoute = ({ site }) => {
  const sitemap = site ? new URL(url('/sitemap.xml'), site).toString() : '/sitemap.xml';
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
