import test from 'node:test';
import assert from 'node:assert/strict';
import {
  guard, compose, composeDay, weave, search, isSealed,
  exportArchive, dayKey, seedFrom, SEALED,
} from '../core.js';

const vault = [
  { key: 'photo', enabled: true }, { key: 'place', enabled: true },
  { key: 'read', enabled: true }, { key: 'note', enabled: true },
  { key: 'meal', enabled: true }, { key: 'person', enabled: false },
];

test('sealed subjects are refused before storage', () => {
  for (const s of SEALED) {
    const r = guard({ kind: 'read', subject: s }, vault);
    assert.equal(r.accepted, false);
    assert.equal(r.sealed, true);
    assert.equal(r.moment, undefined, 'refusal must not produce a stored moment');
  }
});

test('disabled sources are refused', () => {
  const r = guard({ kind: 'person', label: 'Anna' }, vault);
  assert.equal(r.accepted, false);
  assert.match(r.reason, /switched off/);
});

test('normal capture is accepted', () => {
  assert.equal(guard({ kind: 'note', text: 'hello' }, vault).accepted, true);
});

test('compose produces a real placard', () => {
  const m = compose({ kind: 'meal', label: 'ramen', at: '2026-07-23T19:30:00' });
  assert.ok(m.title.length > 0);
  assert.ok(m.placard.length > 10);
  assert.match(m.placard, /ramen/);
  assert.match(m.provenance, /\d{1,2}:\d{2}/);
  assert.equal(m.day, '2026-07-23');
});

test('composition is deterministic — the diary does not rewrite itself', () => {
  const sig = { kind: 'place', label: 'Kiel harbour', at: '2026-07-23T13:15:00' };
  assert.equal(compose(sig).placard, compose(sig).placard);
  assert.equal(compose(sig).title, compose(sig).title);
});

test('different moments get different prose', () => {
  const a = compose({ kind: 'place', label: 'Kiel harbour', at: '2026-07-23T08:00:00' });
  const b = compose({ kind: 'place', label: 'the coast', at: '2026-07-23T17:00:00' });
  assert.notEqual(a.placard, b.placard);
});

test('time of day changes the opening', () => {
  const morning = compose({ kind: 'note', text: 'x', at: '2026-07-23T07:00:00' });
  const night   = compose({ kind: 'note', text: 'x', at: '2026-07-23T23:00:00' });
  assert.notEqual(morning.placard, night.placard);
});

test('the archive notices when you return to something', () => {
  const history = [
    { kind: 'meal', label: 'ramen' }, { kind: 'meal', label: 'ramen' },
  ];
  const m = compose({ kind: 'meal', label: 'ramen', at: '2026-07-23T19:00:00' }, history);
  assert.match(m.placard, /3 times|loyal/i);
});

test('composeDay summarises kept and withheld', () => {
  const moments = [
    compose({ kind: 'place', label: 'Kiel harbour', at: '2026-07-23T13:00:00' }),
    compose({ kind: 'meal', label: 'ramen', at: '2026-07-23T19:00:00' }),
  ];
  const d = composeDay('2026-07-23', moments, 2);
  assert.match(d.subtitle, /2 moments kept/);
  assert.match(d.subtitle, /2 withheld/);
  assert.match(d.title, /Kiel harbour/);
});

test('weave finds patterns', () => {
  const moments = [
    compose({ kind: 'place', label: 'Kiel harbour', at: '2026-07-20T13:00:00' }),
    compose({ kind: 'place', label: 'the coast',    at: '2026-07-21T13:00:00' }),
    compose({ kind: 'meal',  label: 'ramen',        at: '2026-07-21T19:00:00' }),
    compose({ kind: 'meal',  label: 'ramen',        at: '2026-07-22T19:00:00' }),
    compose({ kind: 'person',label: 'Anna',         at: '2026-07-22T19:30:00' }),
  ];
  const threads = weave(moments);
  const kinds = threads.map((t) => t.kind);
  assert.ok(kinds.includes('place'));
  assert.ok(kinds.includes('meal'));
  assert.ok(kinds.includes('person'));
  const meal = threads.find((t) => t.kind === 'meal');
  assert.match(meal.title, /ramen/);
});

test('forgotten moments vanish from patterns', () => {
  const moments = [
    { ...compose({ kind: 'meal', label: 'ramen', at: '2026-07-21T19:00:00' }), kept: false },
    { ...compose({ kind: 'meal', label: 'ramen', at: '2026-07-22T19:00:00' }), kept: false },
  ];
  assert.equal(weave(moments).length, 0);
});

test('search works offline over the local archive', () => {
  const moments = [
    compose({ kind: 'meal', label: 'ramen', at: '2026-07-22T19:00:00' }),
    compose({ kind: 'place', label: 'Kiel harbour', at: '2026-07-22T13:00:00' }),
  ];
  assert.equal(search(moments, 'ramen').length, 1);
  assert.equal(search(moments, 'harbour').length, 1);
  assert.equal(search(moments, 'zzz').length, 0);
});

test('export produces valid, complete JSON', () => {
  const moments = [compose({ kind: 'note', text: 'hello', at: '2026-07-22T10:00:00' })];
  const parsed = JSON.parse(exportArchive(moments, vault));
  assert.equal(parsed.product, 'Curio');
  assert.equal(parsed.moments.length, 1);
  assert.ok(parsed.vault);
});

test('no network calls exist in the engine', async () => {
  const src = await import('node:fs/promises').then((fs) =>
    fs.readFile(new URL('../core.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(src, /fetch\s*\(|XMLHttpRequest|api\./,
    'engine must not contain any network call');
});

test('day keys are stable and local', () => {
  assert.equal(dayKey('2026-07-23T23:59:00'), '2026-07-23');
  assert.equal(seedFrom('a'), seedFrom('a'));
  assert.notEqual(seedFrom('a'), seedFrom('b'));
});
