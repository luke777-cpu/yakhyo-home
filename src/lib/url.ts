/**
 * 사이트 안의 모든 경로는 이 함수를 통해 만든다.
 *
 * GitHub Pages는 저장소 이름이 경로에 붙고(/yakhyo-home/...), Vercel은 붙지 않는다(/...).
 * 링크를 직접 쓰지 않고 여기를 거치면 배포 대상이 바뀌어도 고칠 곳이 없다.
 */
const BASE = import.meta.env.BASE_URL;

export function url(path = '/'): string {
  const base = BASE.endsWith('/') ? BASE : `${BASE}/`;
  const rest = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${rest}`;
}

/** 현재 보고 있는 경로가 해당 메뉴에 속하는지 */
export function isActive(currentPathname: string, href: string): boolean {
  const target = url(href);
  if (target === url('/')) return currentPathname === target;
  return currentPathname.startsWith(target);
}
