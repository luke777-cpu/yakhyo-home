/**
 * 시리즈(연재) 목차 계산.
 *
 * 제목·순서는 src/data/series.json (또는 그 영문 버전) 한 곳에서만 관리한다.
 * "글이 실제로 존재하는가"는 여기서 판정하지 않고 호출하는 쪽이 넘겨주는
 * writtenSlugs(콘텐츠 컬렉션에서 뽑은 실제 파일 목록)로 판단한다 — 그래야 글이
 * 하나 추가될 때 이 파일이나 데이터 파일을 다시 고치지 않아도 링크가 자동으로 열린다.
 */

export interface SeriesItem {
  slug: string;
  order: number;
  title: string;
}

export interface Series {
  slug: string;
  title: string;
  summary: string;
  /** learn-categories.json 의 어느 분류에 속하는지 (배우기 목록에서의 위치) */
  learnCategory?: string;
  items: SeriesItem[];
}

export interface SeriesItemView extends SeriesItem {
  href: string | null;
  status: 'published' | 'preparing';
  current: boolean;
}

/** basePath 예: '/learn/' 또는 '/en/learn/' */
export function seriesItemViews(
  series: Series,
  writtenSlugs: ReadonlySet<string>,
  basePath: string,
  currentSlug?: string,
): SeriesItemView[] {
  return series.items
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) => {
      const status: 'published' | 'preparing' = writtenSlugs.has(item.slug) ? 'published' : 'preparing';
      return {
        ...item,
        status,
        href: status === 'published' ? `${basePath}${item.slug}/` : null,
        current: item.slug === currentSlug,
      };
    });
}

export function seriesProgress(series: Series, writtenSlugs: ReadonlySet<string>): { done: number; total: number } {
  return { done: series.items.filter((i) => writtenSlugs.has(i.slug)).length, total: series.items.length };
}

export function seriesPrevNext(
  series: Series,
  writtenSlugs: ReadonlySet<string>,
  basePath: string,
  currentSlug: string,
): { prev: SeriesItemView | null; next: SeriesItemView | null } {
  const items = seriesItemViews(series, writtenSlugs, basePath, currentSlug);
  const i = items.findIndex((x) => x.slug === currentSlug);
  if (i === -1) return { prev: null, next: null };
  return { prev: i > 0 ? items[i - 1] : null, next: i < items.length - 1 ? items[i + 1] : null };
}
