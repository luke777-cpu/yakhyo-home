import { defineConfig } from 'astro/config';

/**
 * 배포 대상은 환경변수로만 결정한다.
 * 저장소 이름이나 호스팅 경로를 소스 어디에도 하드코딩하지 않기 위한 장치다.
 *
 *   GitHub Pages : SITE_URL=https://luke777-cpu.github.io  BASE_PATH=/yakhyo-home
 *   Vercel       : SITE_URL=https://example.com            BASE_PATH=/
 *   로컬          : 기본값(아래) 사용
 *
 * 나중에 Vercel로 옮길 때 고쳐야 할 곳은 이 두 값뿐이다.
 */
const site = process.env.SITE_URL ?? 'https://luke777-cpu.github.io';
const base = process.env.BASE_PATH ?? '/yakhyo-home';

export default defineConfig({
  site,
  base,
  // 두 호스팅 모두에서 동일하게 동작하는 조합.
  trailingSlash: 'always',
  build: { format: 'directory' },
  compressHTML: true,
  markdown: {
    shikiConfig: { theme: 'github-light', wrap: true },
  },
  devToolbar: { enabled: false },
});
