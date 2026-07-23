import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as themes from '../themes.js';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../app.html', import.meta.url), 'utf8')
  .match(/<style>([\s\S]*?)<\/style>/)[1];

test('every theme is declared in the stylesheet', () => {
  for (const t of themes.THEMES) {
    if (t.id === 'dusk') {
      assert.match(css, /:root,\s*html\[data-theme="dusk"\]/, 'dusk is the default');
    } else {
      assert.ok(css.includes(`html[data-theme="${t.id}"]`), `${t.id} has no CSS block`);
    }
  }
});

test('every theme defines the full set of variables', () => {
  const required = ['--surface', '--surface-2', '--surface-3', '--ivory',
    '--card-bg', '--card-fg', '--card-fg-body', '--card-fg-soft', '--card-line',
    '--brass', '--brass-deep', '--rose', '--sage', '--slate', '--seal',
    '--line', '--glow-a', '--glow-b', '--page-top', '--page-mid', '--page-bot'];

  for (const t of themes.THEMES) {
    const marker = t.id === 'dusk' ? ':root, html[data-theme="dusk"]' : `html[data-theme="${t.id}"]`;
    const start = css.indexOf(marker);
    assert.ok(start > -1, `${t.id} block missing`);
    const block = css.slice(start, css.indexOf('}', start));
    for (const v of required) {
      assert.ok(block.includes(v + ':'), `${t.id} is missing ${v}`);
    }
  }
});

test('no theme colour is left hardcoded outside the theme blocks', () => {
  const afterThemes = css
    .slice(css.indexOf('/* aliases kept'))
    // the "follow my device" swatch previews both palettes, so it must be literal
    .replace(/\.chips i\.sys(dark|light)\{[^}]*\}/g, '');
  const stray = afterThemes.match(/#(1d1a2b|252135|2f2a42|f2ebdb|c9a24b|2b2540|16131f)/gi) || [];
  assert.deepEqual(stray, [], `hardcoded palette colours found: ${stray.join(', ')}`);
});

test('a light theme really is light, and dark ones really are dark', () => {
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
  };
  for (const t of themes.THEMES) {
    const l = lum(t.swatch[0]);
    if (t.dark) assert.ok(l < 0.3, `${t.id} claims dark but its surface is bright (${l.toFixed(2)})`);
    else assert.ok(l > 0.7, `${t.id} claims light but its surface is dark (${l.toFixed(2)})`);
  }
});

test('text keeps enough contrast against its card in every theme', () => {
  // pull the declared card colours straight out of the stylesheet
  const rel = (hex) => {
    const c = [0, 1, 2].map((i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [rel(a), rel(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  for (const t of themes.THEMES) {
    const marker = t.id === 'dusk' ? ':root, html[data-theme="dusk"]' : `html[data-theme="${t.id}"]`;
    const block = css.slice(css.indexOf(marker), css.indexOf('}', css.indexOf(marker)));
    const grab = (name) => (block.match(new RegExp(name + ':\\s*(#[0-9a-f]{6})', 'i')) || [])[1];

    const cardBg = grab('--card-bg'), cardFg = grab('--card-fg');
    assert.ok(cardBg && cardFg, `${t.id}: card colours not readable from CSS`);
    const r = ratio(cardBg, cardFg);
    assert.ok(r >= 7, `${t.id}: card text contrast is only ${r.toFixed(1)}:1`);
  }
});

test('system follows the device rather than being its own palette', () => {
  assert.ok(!themes.THEME_IDS.includes('system'));
  assert.equal(themes.resolve(themes.SYSTEM_DARK), 'dusk');
  const r = themes.resolve('system');
  assert.ok([themes.SYSTEM_DARK, themes.SYSTEM_LIGHT].includes(r));
});

test('an unknown or missing choice falls back rather than breaking', () => {
  assert.equal(themes.resolve('nonsense'), themes.DEFAULT_THEME);
  assert.equal(themes.resolve(undefined), themes.DEFAULT_THEME);
  assert.equal(themes.resolve(null), themes.DEFAULT_THEME);
  assert.equal(themes.apply('ink', null), 'ink', 'no document is not a crash');
});

test('applying a theme sets the attribute, the scheme and the browser bar', () => {
  const dom = new JSDOM('<meta name="theme-color" content="#000"><html><body></body></html>');
  const doc = dom.window.document;

  themes.apply('harbour', doc);
  assert.equal(doc.documentElement.dataset.theme, 'harbour');
  assert.equal(doc.documentElement.style.colorScheme, 'dark');
  assert.equal(doc.querySelector('meta[name="theme-color"]').getAttribute('content'), '#0f2027');

  themes.apply('daylight', doc);
  assert.equal(doc.documentElement.dataset.theme, 'daylight');
  assert.equal(doc.documentElement.style.colorScheme, 'light');
  assert.equal(doc.querySelector('meta[name="theme-color"]').getAttribute('content'), '#f3efe4');
});

test('watching the system is a no-op unless system is chosen', () => {
  assert.equal(typeof themes.watchSystem('dusk', () => {}), 'function');
  assert.equal(typeof themes.watchSystem('system', () => {}), 'function');
});

test('every theme has a name in the interface', async () => {
  const { getLocale } = await import('../i18n.js');
  const U = getLocale('en-GB').ui;
  for (const t of themes.THEMES) {
    assert.ok(U.themeNames[t.id], `${t.id} has no display name`);
  }
  assert.ok(U.themeNames.system);
});
