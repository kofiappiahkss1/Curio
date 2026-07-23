/**
 * Curio — what you are holding.
 *
 * Screen width alone is a poor guide: a tablet in portrait is as narrow as a
 * large phone, and a laptop window dragged small is neither. So Curio reads
 * width, pointer type and touch together, and adjusts how much it shows and
 * how it expects to be touched.
 */

export const PHONE = 'phone';
export const TABLET = 'tablet';
export const DESKTOP = 'desktop';

const mq = (q) => {
  try { return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null; }
  catch { return null; }
};
const matches = (q) => !!mq(q)?.matches;

/** Does this thing have a mouse, or fingers? */
export function pointerKind() {
  if (matches('(pointer: fine)')) return 'mouse';
  if (matches('(pointer: coarse)')) return 'touch';
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 ? 'touch' : 'mouse';
}

export function screenWidth() {
  if (typeof window === 'undefined') return 1024;
  return window.innerWidth || window.screen?.width || 1024;
}

/**
 * phone   — narrow, touch. One column, thumb-reachable controls.
 * tablet  — wide, touch. Two columns, bigger targets kept.
 * desktop — wide, mouse. Two columns, sidebar, keyboard shortcuts, hover.
 */
export function detect() {
  const w = screenWidth();
  const pointer = pointerKind();
  const touch = pointer === 'touch';

  let kind;
  if (w < 700) kind = PHONE;
  else if (w < 1100) kind = touch ? TABLET : DESKTOP;
  else kind = touch ? TABLET : DESKTOP;

  // a big tablet in landscape with a keyboard behaves like a desktop
  if (kind === TABLET && w >= 1280 && pointer === 'mouse') kind = DESKTOP;

  return {
    kind,
    width: w,
    pointer,
    touch,
    landscape: typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : true,
    standalone: isStandalone(),
    twoColumn: kind !== PHONE,
    shortcuts: pointer === 'mouse',
    hover: matches('(hover: hover)'),
    reducedMotion: matches('(prefers-reduced-motion: reduce)'),
  };
}

export function isStandalone() {
  try {
    if (matches('(display-mode: standalone)')) return true;
  } catch { /* some webviews have no matchMedia */ }
  return typeof navigator !== 'undefined' && navigator.standalone === true;
}

/** Put the answer on <html> so the stylesheet can respond to it. */
export function apply(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc?.documentElement) return null;
  const d = detect();
  const root = doc.documentElement;
  root.dataset.device = d.kind;
  root.dataset.pointer = d.pointer;
  root.dataset.standalone = String(d.standalone);
  root.classList.toggle('is-touch', d.touch);
  root.classList.toggle('is-hover', d.hover);
  return d;
}

/** Re-read on rotation or window resize, and tell the caller only when it changes. */
export function watch(onChange) {
  if (typeof window === 'undefined') return () => {};
  let last = detect().kind;
  const check = () => {
    const d = apply();
    if (d && d.kind !== last) { last = d.kind; onChange?.(d); }
  };
  window.addEventListener('resize', check, { passive: true });
  window.addEventListener('orientationchange', check, { passive: true });
  return () => {
    window.removeEventListener('resize', check);
    window.removeEventListener('orientationchange', check);
  };
}
