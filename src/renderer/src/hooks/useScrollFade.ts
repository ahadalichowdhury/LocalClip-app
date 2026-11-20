import { RefObject, useEffect } from 'react';

/**
 * Marks a horizontally scrolling row with `fade-left` / `fade-right` while
 * there is hidden content on that side, so the edge fades (see app.css).
 * Rows that fit get no fade.
 */
export function useScrollFade(ref: RefObject<HTMLElement>, deps: unknown[] = []) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.classList.toggle('fade-left', el.scrollLeft > 1);
      el.classList.toggle('fade-right', el.scrollLeft < max - 1);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
