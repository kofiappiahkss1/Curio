/**
 * The tests that matter most: can a person lose their phone and get their
 * whole diary back on a different device?
 */
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, unseal, peek, strength, fingerprint, MAGIC } from '../crypto.js';
import { compose, onThisDay, echoes, streaks, yearGrid, stats,
         moodAverage, moodCorrelations } from '../core.js';

/* ---------------- encryption ---------------- */
test('a Recovery Kit round-trips exactly', async () => {
  const archive = { product: 'Curio', moments: [{ id: 'a', title: 'Ramen', placard: 'After dark.' }] };
  const kit = await seal(archive, 'four unrelated words here');
  const back = await unseal(kit, 'four unrelated words here');
  assert.deepEqual(back, archive);
});

test('the kit reveals nothing without the passphrase', async () => {
  const archive = { product: 'Curio', moments: [{ id: 'a', title: 'my secret place', placard: 'a private line' }] };
  const kit = await seal(archive, 'four unrelated words here');
  const blob = JSON.stringify(kit);
  assert.doesNotMatch(blob, /secret place/);
  assert.doesNotMatch(blob, /private line/);
  assert.equal(kit.magic, MAGIC);
});

test('a wrong passphrase fails cleanly, not silently', async () => {
  const kit = await seal({ moments: [] }, 'the right passphrase');
  await assert.rejects(() => unseal(kit, 'the wrong passphrase'),
    (e) => e.message === 'WRONG_PASSPHRASE');
});

test('a kit can be identified before it is unlocked', async () => {
  const kit = await seal({ moments: [1, 2, 3], device: 'an iPhone' }, 'passphrase here');
  const hint = peek(kit);
  assert.equal(hint.moments, 3);
  assert.equal(hint.from, 'an iPhone');
  assert.ok(hint.created);
});

test('a foreign file is rejected', async () => {
  await assert.rejects(() => unseal({ nope: true }, 'x'));
  assert.equal(peek({ nope: true }), null);
});

test('short passphrases are refused outright', async () => {
  await assert.rejects(() => seal({ moments: [] }, 'abc'));
});

test('the fingerprint is stable and does not leak the passphrase', async () => {
  const a = await fingerprint('correct horse battery staple');
  const b = await fingerprint('correct horse battery staple');
  const c = await fingerprint('something else entirely');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.doesNotMatch(a, /horse|staple/i);
});

test('passphrase strength steers people sensibly', () => {
  assert.equal(strength('abc').label, 'weak');
  assert.equal(strength('password').label, 'weak');
  assert.ok(['good', 'strong'].includes(strength('correct horse battery staple').label));
});

/* ---------------- the whole point: a new device ---------------- */
test('LOST PHONE → NEW DEVICE: the archive comes back intact', async () => {
  // ----- the old phone -----
  const store = await import('../store.js');
  const backup = await import('../backup.js');
  await store.clearAll();

  const originals = [
    { ...compose({ kind: 'meal', label: 'ramen', at: '2026-07-20T19:00:00' }), mood: 4 },
    { ...compose({ kind: 'place', label: 'Kiel harbour', at: '2026-07-21T13:00:00' }), mood: 5 },
    { ...compose({ kind: 'note', label: 'first light', at: '2026-07-22T07:00:00' }), photo: 'data:image/jpeg;base64,AAAA' },
  ];
  for (const m of originals) await store.putMoment(m);
  await store.setMeta('locale', 'sw');
  await store.setMeta('vault', [{ key: 'photo', enabled: false }]);

  const archive = await backup.buildArchive();
  const kit = await seal(archive, 'my four word passphrase');
  const kitFile = JSON.stringify(kit);

  assert.equal(archive.moments.length, 3);
  assert.equal(archive.locale, 'sw');

  // ----- the phone is lost. everything is gone. -----
  await store.clearAll();
  await store.setMeta('locale', 'en-GB');
  await store.setMeta('vault', null);
  assert.equal((await store.allMoments()).length, 0);

  // ----- a different device, weeks later -----
  const file = { text: async () => kitFile };
  const info = await backup.inspectKitFile(file);
  assert.equal(info.encrypted, true);
  assert.equal(info.hint.moments, 3);

  const res = await backup.restore(info.parsed, 'my four word passphrase');
  assert.equal(res.added, 3);

  const restored = await store.allMoments();
  assert.equal(restored.length, 3);
  // every placard, photo and mood survived
  for (const o of originals) {
    const back = restored.find((m) => m.id === o.id);
    assert.ok(back, `moment ${o.id} should be back`);
    assert.equal(back.title, o.title);
    assert.equal(back.placard, o.placard);
    assert.equal(back.mood ?? null, o.mood ?? null);
    assert.equal(back.photo ?? null, o.photo ?? null);
  }
  // and their settings came with them
  assert.equal(await store.getMeta('locale'), 'sw');
  assert.equal((await store.getMeta('vault'))[0].enabled, false);
  assert.equal(await store.getMeta('onboarded'), true);
});

test('restoring twice does not duplicate anything', async () => {
  const store = await import('../store.js');
  const backup = await import('../backup.js');
  await store.clearAll();
  await store.putMoment(compose({ kind: 'meal', label: 'ramen', at: '2026-07-20T19:00:00' }));

  const kit = await seal(await backup.buildArchive(), 'my four word passphrase');
  await backup.restore(kit, 'my four word passphrase');
  await backup.restore(kit, 'my four word passphrase');
  assert.equal((await store.allMoments()).length, 1);
});

test('two devices merge instead of overwriting each other', async () => {
  const store = await import('../store.js');
  const backup = await import('../backup.js');

  // phone A
  await store.clearAll();
  await store.putMoment(compose({ kind: 'meal', label: 'ramen', at: '2026-07-20T19:00:00' }));
  const kitA = await seal(await backup.buildArchive(), 'shared passphrase');

  // laptop B, different moments
  await store.clearAll();
  await store.putMoment(compose({ kind: 'place', label: 'the coast', at: '2026-07-21T13:00:00' }));

  await backup.restore(kitA, 'shared passphrase', { merge: true });
  const all = await store.allMoments();
  assert.equal(all.length, 2, 'both devices’ moments should survive');
  assert.ok(all.some((m) => m.label === 'ramen'));
  assert.ok(all.some((m) => m.label === 'the coast'));
});

test('a plain unencrypted export can also be restored — nobody gets locked out', async () => {
  const store = await import('../store.js');
  const backup = await import('../backup.js');
  await store.clearAll();
  await store.putMoment(compose({ kind: 'note', label: 'hello', at: '2026-07-20T09:00:00' }));
  const plain = JSON.stringify(await backup.buildArchive());

  await store.clearAll();
  const info = await backup.inspectKitFile({ text: async () => plain });
  assert.equal(info.encrypted, false);
  await backup.restore(info.parsed, null);
  assert.equal((await store.allMoments()).length, 1);
});

test('backup status escalates as the archive drifts out of date', async () => {
  const store = await import('../store.js');
  const backup = await import('../backup.js');
  await store.setMeta('backupMeta', null);

  let st = await backup.backupStatus(10);
  assert.equal(st.level, 'urgent', 'never backed up with real content is urgent');

  await store.setMeta('backupMeta', { lastBackupAt: new Date().toISOString(), lastBackupCount: 10 });
  st = await backup.backupStatus(11);
  assert.equal(st.level, 'ok');

  st = await backup.backupStatus(40);
  assert.equal(st.level, 'urgent', 'many unbacked moments should escalate');
});

/* ---------------- retention features ---------------- */
test('On This Day surfaces the same date in earlier years', () => {
  const ms = [
    compose({ kind: 'meal', label: 'ramen', at: '2024-07-23T19:00:00' }),
    compose({ kind: 'meal', label: 'toast', at: '2025-07-23T09:00:00' }),
    compose({ kind: 'meal', label: 'soup', at: '2026-07-22T19:00:00' }),
  ];
  const hits = onThisDay(ms, new Date('2026-07-23T12:00:00'));
  assert.equal(hits.length, 2);
  assert.equal(hits[0].yearsAgo, 1);
  assert.equal(hits[1].yearsAgo, 2);
});

test('echoes cover the days with no anniversary', () => {
  const ms = [compose({ kind: 'place', label: 'the harbour', at: '2026-07-16T13:00:00' })];
  const e = echoes(ms, new Date('2026-07-23T12:00:00'));
  assert.equal(e.length, 1);
  assert.equal(e[0].echo, 'lastWeek');
});

test('streaks count consecutive days and survive a gap', () => {
  const mk = (d) => compose({ kind: 'note', label: 'x', at: `${d}T10:00:00` });
  const ms = [mk('2026-07-21'), mk('2026-07-22'), mk('2026-07-23'), mk('2026-07-10')];
  const s = streaks(ms, new Date('2026-07-23T12:00:00'));
  assert.equal(s.current, 3);
  assert.equal(s.keptToday, true);
  assert.equal(s.total, 4);
});

test('a streak stays alive until a full day is missed', () => {
  const mk = (d) => compose({ kind: 'note', label: 'x', at: `${d}T10:00:00` });
  const ms = [mk('2026-07-21'), mk('2026-07-22')];
  const s = streaks(ms, new Date('2026-07-23T09:00:00'));
  assert.equal(s.keptToday, false);
  assert.equal(s.current, 2, 'yesterday still counts');
});

test('mood averages and correlations behave', () => {
  const mk = (label, d, mood) => ({ ...compose({ kind: 'place', label, at: `${d}T13:00:00` }), mood });
  const ms = [
    mk('the harbour', '2026-07-01', 5), mk('the harbour', '2026-07-02', 5),
    mk('the office', '2026-07-03', 2), mk('the office', '2026-07-04', 2),
  ];
  assert.equal(moodAverage(ms), 3.5);
  const corr = moodCorrelations(ms);
  assert.equal(corr[0].label, 'the harbour');
  assert.ok(corr[0].delta > 0);
  assert.ok(corr[corr.length - 1].delta < 0);
});

test('the year grid covers a full year and marks the right days', () => {
  const ms = [compose({ kind: 'note', label: 'x', at: '2026-03-15T10:00:00' })];
  const g = yearGrid(ms, 2026);
  assert.equal(g.length, 365);
  assert.equal(g.filter((d) => d.count > 0).length, 1);
  assert.equal(g.find((d) => d.count > 0).day, '2026-03-15');
});

test('stats describe the archive honestly', () => {
  const ms = [
    { ...compose({ kind: 'meal', label: 'ramen', at: '2026-07-20T19:00:00' }), photo: 'x', mood: 4 },
    compose({ kind: 'note', label: 'hi', at: '2026-07-21T09:00:00' }),
  ];
  const s = stats(ms);
  assert.equal(s.moments, 2);
  assert.equal(s.days, 2);
  assert.equal(s.withPhoto, 1);
  assert.equal(s.since, '2026-07-20');
  assert.equal(s.mood, 4);
});
