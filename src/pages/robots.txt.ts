import type { APIRoute } from 'astro';
import { url } from '../lib/url';

/** 배포 주소가 바뀌어도 sitemap 위치가 따라가도록 빌드 시 만든다. */
export const GET: APIRoute = ({ site }) => {
  const sitemap = site ? new URL(url('/sitemap.xml'), site).toString() : '/sitemap.xml';
  // 로그인·닉네임 설정·글 상세는 색인할 이유가 없다.
  // 특히 /auth/callback/ 은 토큰이 실린 주소가 크롤러에 남지 않도록 막는다.
  const disallow = [
    'Disallow: ' + url('/login/'),
    'Disallow: ' + url('/auth/'),
    'Disallow: ' + url('/profile/'),
    'Disallow: ' + url('/questions/new/'),
    'Disallow: ' + url('/questions/edit/'),
    'Disallow: ' + url('/questions/view/'),
    'Disallow: ' + url('/questions/mine/'),
  ].join('\n');

  return new Response(`User-agent: *\nAllow: /\n${disallow}\n\nSitemap: ${sitemap}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
