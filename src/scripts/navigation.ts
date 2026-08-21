/** 모바일 메뉴 열고 닫기. 열려 있는 동안 본문 스크롤을 막고 포커스를 메뉴 안에 둔다. */
const toggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]');
const close = document.querySelector<HTMLButtonElement>('[data-nav-close]');
const panel = document.querySelector<HTMLElement>('[data-nav-panel]');

if (toggle && close && panel) {
  const focusables = () =>
    Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')).filter(
      (el) => el.offsetParent !== null,
    );

  const open = () => {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    document.documentElement.style.overflow = 'hidden';
    focusables()[0]?.focus();
  };

  const shut = () => {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    document.documentElement.style.overflow = '';
    toggle.focus();
  };

  toggle.addEventListener('click', open);
  close.addEventListener('click', shut);

  panel.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      shut();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  // 데스크톱 폭으로 넓어지면 열린 상태를 정리한다
  const mq = window.matchMedia('(min-width: 1024px)');
  mq.addEventListener('change', (e) => {
    if (e.matches && !panel.hidden) shut();
  });
}
