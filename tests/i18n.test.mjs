import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, getLocale, detectLocale, fill, plural } from '../i18n.js';
import { compose, composeDay, weave, sources } from '../core.js';

const CODES = Object.keys(LOCALES);
const KINDS = ['photo', 'voice', 'meeting', 'place', 'read', 'note', 'meal', 'person'];
const PODS = ['night', 'early', 'morning', 'midday', 'afternoon', 'evening', 'late'];

test('every locale exposes a complete UI surface', () => {
  for (const code of CODES) {
    const L = getLocale(code);
    assert.ok(L.ui.tagline, `${code}: tagline`);
    assert.ok(L.dir === 'ltr' || L.dir === 'rtl', `${code}: direction`);
    for (const t of ['today', 'archive', 'threads', 'vault'])
      assert.ok(L.ui.tabs[t], `${code}: tab ${t}`);
    for (const k of KINDS) {
      const K = L.ui.kinds[k];
      assert.ok(K?.label && K.title && K.hint && K.ph, `${code}: kind ${k}`);
    }
    for (const f of ['allow', 'later', 'done', 'title', 'body'])
      assert.ok(L.ui.perm[f], `${code}: perm.${f}`);
    for (const f of ['open', 'take', 'choose', 'retake', 'switch'])
      assert.ok(L.ui.camera[f], `${code}: camera.${f}`);
  }
});

test('every locale has a complete prose grammar', () => {
  for (const code of CODES) {
    const P = getLocale(code).prose;
    for (const pod of PODS) {
      assert.ok(Array.isArray(P.openers[pod]) && P.openers[pod].length,
        `${code}: openers.${pod}`);
    }
    for (const k of KINDS) {
      assert.ok(P.titles[k]?.length, `${code}: titles.${k}`);
      assert.ok(P.bodies[k]?.length, `${code}: bodies.${k}`);
      assert.ok(P.bodies[k].every((b) => b.includes('{o}')),
        `${code}: bodies.${k} must place the opener`);
    }
    assert.ok(P.dayTitles.length, `${code}: dayTitles`);
    for (const t of ['placeTitle', 'personTitle', 'readTitle', 'mealTitle', 'habitTitle'])
      assert.ok(P.threads[t], `${code}: threads.${t}`);
  }
});

test('every locale writes a real placard for every kind', () => {
  for (const code of CODES) {
    for (const kind of KINDS) {
      const m = compose({ kind, label: 'ramen', at: '2026-07-23T19:30:00' }, [], code);
      assert.ok(m.title.length > 0, `${code}/${kind}: title`);
      assert.ok(m.placard.length > 6, `${code}/${kind}: placard`);
      assert.doesNotMatch(m.placard, /\{[a-z]\}/, `${code}/${kind}: unfilled placeholder`);
      assert.doesNotMatch(m.title, /\{[a-z]\}/, `${code}/${kind}: unfilled title placeholder`);
      assert.ok(m.provenance.length > 3, `${code}/${kind}: provenance`);
    }
  }
});

test('day summaries and threads localise without leaking placeholders', () => {
  const ms = [
    compose({ kind: 'place', label: 'Kiel harbour', at: '2026-07-20T13:00:00' }),
    compose({ kind: 'place', label: 'the coast', at: '2026-07-21T13:00:00' }),
    compose({ kind: 'meal', label: 'ramen', at: '2026-07-21T19:00:00' }),
    compose({ kind: 'meal', label: 'ramen', at: '2026-07-22T19:00:00' }),
    compose({ kind: 'person', label: 'Anna', at: '2026-07-22T19:30:00' }),
    compose({ kind: 'read', label: 'the deep sea', at: '2026-07-22T09:00:00' }),
  ];
  for (const code of CODES) {
    const d = composeDay('2026-07-22', ms, 2, code);
    assert.ok(d.title && d.subtitle, `${code}: day summary`);
    assert.doesNotMatch(d.subtitle, /\{[a-z]\}/, `${code}: day subtitle placeholder`);

    const threads = weave(ms, code);
    assert.ok(threads.length >= 3, `${code}: threads found`);
    for (const t of threads) {
      assert.doesNotMatch(t.title, /\{[a-z]\}/, `${code}: thread title placeholder`);
      assert.doesNotMatch(t.body, /\{[a-z]\}/, `${code}: thread body placeholder`);
    }
  }
});

test('dialects inherit from their parent language, not English', () => {
  const es = getLocale('es-419');
  assert.match(es.ui.tagline, /diario/, 'LatAm Spanish inherits Spanish prose');
  assert.equal(es.ui.tabs.today, 'Hoy');
  assert.match(es.ui.onPhone, /celular/, 'but keeps its own dialect words');

  const pidgin = getLocale('en-NG');
  assert.match(pidgin.ui.tagline, /dey write/, 'Pidgin has its own voice');
  assert.notEqual(pidgin.ui.keepIt, getLocale('en-GB').ui.keepIt);
});

test('Arabic is marked right-to-left, others left-to-right', () => {
  assert.equal(getLocale('ar').dir, 'rtl');
  for (const code of CODES.filter((c) => c !== 'ar'))
    assert.equal(getLocale(code).dir, 'ltr', `${code} should be ltr`);
});

test('the phone’s own language is detected sensibly', () => {
  assert.equal(detectLocale(['ja-JP', 'en-US']), 'ja');
  assert.equal(detectLocale(['de-DE']), 'de-DE');
  assert.equal(detectLocale(['sw-KE']), 'sw');
  assert.equal(detectLocale(['xx-YY']), 'en-GB', 'unknown falls back to English');
  assert.ok(CODES.includes(detectLocale(['pt-PT'])));
});

test('an unknown locale code falls back rather than crashing', () => {
  const L = getLocale('kl-INGON');
  assert.equal(L.code, 'en-GB');
  assert.ok(L.ui.tagline);
});

test('source labels are localised for the vault and capture sheet', () => {
  const ja = sources(getLocale('ja'));
  assert.equal(ja.length, 8);
  assert.equal(ja.find((s) => s.key === 'meal').label, '食事');
  const sw = sources(getLocale('sw'));
  assert.equal(sw.find((s) => s.key === 'photo').label, 'Picha');
});

test('plural and fill helpers behave', () => {
  const forms = { one: '{n} thing', other: '{n} things' };
  assert.equal(plural(1, forms), '1 thing');
  assert.equal(plural(4, forms), '4 things');
  assert.equal(fill('a {x} b {y}', { x: 1, y: 2 }), 'a 1 b 2');
  assert.equal(fill('keep {z}', {}), 'keep {z}');
});
