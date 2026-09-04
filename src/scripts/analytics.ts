/**
 * data-gtag-event 속성이 붙은 요소를 클릭하면 GA4 이벤트를 보낸다.
 * 이벤트 이름은 data-gtag-event, 나머지 data-gtag-* 값은 이벤트 파라미터가 된다.
 *
 * 예: <a data-gtag-event="course_card_click" data-gtag-course-name="pharmacology">
 *   → gtag('event', 'course_card_click', { course_name: 'pharmacology' })
 *
 * 새 이벤트를 붙일 때 이 파일을 고칠 필요는 없다 — 마크업에 data-gtag-* 속성만
 * 추가하면 된다. Analytics.astro가 GA4를 켤 때만 이 파일을 불러오므로,
 * window.gtag이 없는 환경(GA 미설정, 로컬 개발, 광고 차단기)에서는 조용히 아무 일도
 * 하지 않는다.
 */
export {};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

// gtagCourseName -> course_name
function toEventParam(datasetKey: string): string {
  return datasetKey
    .slice('gtag'.length)
    .replace(/^./, (c) => c.toLowerCase())
    .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

document.addEventListener('click', (e) => {
  if (typeof window.gtag !== 'function') return;

  const target = e.target as HTMLElement | null;
  const el = target?.closest<HTMLElement>('[data-gtag-event]');
  const eventName = el?.dataset.gtagEvent;
  if (!el || !eventName) return;

  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(el.dataset)) {
    if (key === 'gtagEvent' || !key.startsWith('gtag') || value === undefined) continue;
    params[toEventParam(key)] = value;
  }

  window.gtag('event', eventName, params);
});
