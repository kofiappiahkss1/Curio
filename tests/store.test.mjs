import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../core.js';
import * as store from '../store.js';

test('a moment survives being written and read back', async () => {
  const m = compose({ kind: 'meal', label: 'ramen', at: '2026-07-23T19:30:00' });
  await store.putMoment(m);
  const back = await store.getMoment(m.id);
  assert.equal(back.title, m.title);
  assert.equal(back.placard, m.placard);
  assert.equal(back.day, '2026-07-23');
});

test('moments come back in chronological order', async () => {
  await store.clearAll();
  const later = compose({ kind: 'note', text: 'later', at: '2026-07-23T20:00:00' });
  const early = compose({ kind: 'note', text: 'early', at: '2026-07-23T07:00:00' });
  await store.putMoment(later);
  await store.putMoment(early);
  const all = await store.allMoments();
  assert.equal(all[0].id, early.id);
  assert.equal(all[1].id, later.id);
});

test('forget marks a moment without destroying it', async () => {
  await store.clearAll();
  const m = compose({ kind: 'place', label: 'the harbour', at: '2026-07-23T13:00:00' });
  await store.putMoment(m);
  await store.forgetMoment(m.id);
  const back = await store.getMoment(m.id);
  assert.equal(back.kept, false);
});

test('withheld counts accumulate per day', async () => {
  await store.setMeta('withheld', {});
  await store.bumpWithheld('2026-07-23');
  await store.bumpWithheld('2026-07-23');
  await store.bumpWithheld('2026-07-22');
  assert.equal(await store.getWithheld('2026-07-23'), 2);
  assert.equal(await store.getWithheld('2026-07-22'), 1);
});

test('vault settings persist', async () => {
  await store.setMeta('vault', [{ key: 'photo', enabled: false }]);
  const v = await store.getMeta('vault');
  assert.equal(v[0].enabled, false);
});

test('export then import round-trips the whole archive', async () => {
  await store.clearAll();
  const a = compose({ kind: 'meal', label: 'ramen', at: '2026-07-23T19:00:00' });
  const b = compose({ kind: 'person', label: 'Anna', at: '2026-07-23T19:30:00' });
  await store.putMoment(a); await store.putMoment(b);

  const { exportArchive } = await import('../core.js');
  const json = exportArchive(await store.allMoments(), await store.getMeta('vault'));

  await store.clearAll();
  assert.equal((await store.allMoments()).length, 0);

  const n = await store.importArchive(json);
  assert.equal(n, 2);
  const restored = await store.allMoments();
  assert.equal(restored.length, 2);
  assert.equal(restored.find((m) => m.id === a.id).placard, a.placard);
});

test('rubbish import is rejected, archive untouched', async () => {
  await store.clearAll();
  await store.putMoment(compose({ kind: 'note', text: 'keep me', at: '2026-07-23T10:00:00' }));
  await assert.rejects(() => store.importArchive('{"nope":1}'));
  assert.equal((await store.allMoments()).length, 1);
});

test('erase clears everything', async () => {
  await store.putMoment(compose({ kind: 'note', text: 'x', at: '2026-07-23T10:00:00' }));
  await store.clearAll();
  assert.equal((await store.allMoments()).length, 0);
});
