/**
 * Curio — themes.
 *
 * Six rooms to keep the same diary in. Each is a small block of CSS variables
 * (see app.html); this module only decides which one is on, remembers the
 * choice, and keeps the browser's own chrome the right colour.
 *
 * "System" is not a seventh palette — it follows the device between a light
 * and a dark one, which is what people actually mean by it.
 */

export const THEMES = [
  { id: 'dusk',     dark: true,  swatch: ['#1d1a2b', '#c9a24b', '#f2ebdb'] },
  { id: 'daylight', dark: false, swatch: ['#f3efe4', '#9a7420', '#ffffff'] },
  { id: 'ink',      dark: true,  swatch: ['#000000', '#d8d4cc', '#141416'] },
  { id: 'harbour',  dark: true,  swatch: ['#0f2027', '#d98b4a', '#e8f0ef'] },
  { id: 'rosewood', dark: true,  swatch: ['#241823', '#d9a06a', '#f4e9e6'] },
  { id: 'sage',     dark: true,  swatch: ['#1a2320', '#c2a95f', '#f0f2ea'] },
];

export const DEFAULT_THEME = 'dusk';
export const SYSTEM = 'system';

/** The pair "system" chooses between. */
export const SYSTEM_DARK = 'dusk';
export const SYSTEM_LIGHT = 'daylight';

export const THEME_IDS = THEMES.map((t) => t.id);
export const isTheme = (id) => THEME_IDS.includes(id);
export const themeMeta = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

/** What the device is currently asking for. */
export function systemPrefersDark() {
  try {
    return !!(typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch { return true; }
}

/** Turn a stored choice — which may be "system" — into a real theme id. */
export function resolve(choice) {
  if (choice === SYSTEM) return systemPrefersDark() ? SYSTEM_DARK : SYSTEM_LIGHT;
  return isTheme(choice) ? choice : DEFAULT_THEME;
}

/**
 * Put the theme on <html> and colour the browser's own bars to match, so an
 * installed app doesn't show a strip of the wrong colour at the top.
 */
export function apply(choice, doc = typeof document !== 'undefined' ? document : null) {
  const id = resolve(choice);
  if (!doc?.documentElement) return id;

  doc.documentElement.dataset.theme = id;
  const meta = themeMeta(id);
  doc.documentElement.style.colorScheme = meta.dark ? 'dark' : 'light';

  const tag = doc.querySelector('meta[name="theme-color"]');
  if (tag) tag.setAttribute('content', meta.swatch[0]);

  return id;
}

/** Follow the device while the choice is "system". Returns an unsubscribe. */
export function watchSystem(choice, onChange) {
  if (choice !== SYSTEM) return () => {};
  let mql;
  try { mql = window.matchMedia('(prefers-color-scheme: dark)'); } catch { return () => {}; }
  const handler = () => onChange?.(resolve(SYSTEM));
  if (mql.addEventListener) mql.addEventListener('change', handler);
  else if (mql.addListener) mql.addListener(handler);
  return () => {
    if (mql.removeEventListener) mql.removeEventListener('change', handler);
    else if (mql.removeListener) mql.removeListener(handler);
  };
}
