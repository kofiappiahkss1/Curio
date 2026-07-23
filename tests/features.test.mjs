import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as history from '../history.js';
import { pickMimeType, formatDuration, estimateBytes, canRecord, canDictate,
         Recorder, Dictation, MAX_SECONDS } from '../voice.js';
import { seal } from '../crypto.js';
import { compose } from '../core.js';
import * as store from '../store.js';
import * as backup from '../backup.js';

/* ================= TODAY IN HISTORY ================= */
test('every day of the year has at least one event, offline', () => {
  const missing = [];
  for (let m = 1; m <= 12; m++) {
    const daysInMonth = new Date(2024, m, 0).getDate();     // 2024 covers 29 Feb
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (!history.HISTORY[key]?.length) missing.push(key);
    }
  }
  assert.deepEqual(missing, [], 'no day should be blank');
  const c = history.coverage();
  assert.equal(c.days, 366);
  assert.ok(c.events >= 700, `expected a substantial set, got ${c.events}`);
});

test('every event is well formed', () => {
  for (const [key, rows] of Object.entries(history.HISTORY)) {
    assert.match(key, /^\d{2}-\d{2}$/, `bad key ${key}`);
    for (const [year, text, tag] of rows) {
      assert.equal(typeof year, 'number', `${key}: year`);
      assert.ok(year > 0 && year <= new Date().getFullYear(), `${key}: implausible year ${year}`);
      assert.ok(text.length > 15, `${key}: text too short`);
      assert.ok(history.TAGS.includes(tag), `${key}: unknown tag ${tag}`);
    }
  }
});

test('lookup returns the right day, newest first', () => {
  const events = history.forDate(new Date('2026-07-20T12:00:00'));
  assert.ok(events.length >= 2);
  assert.ok(events[0].year >= events[events.length - 1].year, 'sorted newest first');
  assert.ok(events.some((e) => /Moon/i.test(e.text)), 'the Moon landing should be on 20 July');
});

test('the chosen event is stable through the day but varies across days', () => {
  const a = history.pickForDate(new Date('2026-07-20T08:00:00'));
  const b = history.pickForDate(new Date('2026-07-20T22:00:00'));
  assert.equal(a.text, b.text, 'the widget should not shuffle during the day');
  const c = history.pickForDate(new Date('2026-07-21T08:00:00'));
  assert.notEqual(a.text, c.text);
});

test('years ago is computed sensibly', () => {
  assert.equal(history.yearsAgo(1969, new Date('2026-07-20T12:00:00')), 57);
  assert.equal(history.yearsAgo(2030, new Date('2026-07-20T12:00:00')), 0);
});

test('online enrichment is optional and fails silently', async () => {
  const dead = async () => { throw new Error('offline'); };
  assert.deepEqual(await history.enrich(new Date(), { fetchImpl: dead }), []);

  const notOk = async () => ({ ok: false });
  assert.deepEqual(await history.enrich(new Date(), { fetchImpl: notOk }), []);

  const good = async () => ({
    ok: true,
    json: async () => ({ selected: [{ year: 1234, text: 'Something happened.' }] }),
  });
  const got = await history.enrich(new Date(), { fetchImpl: good });
  assert.equal(got.length, 1);
  assert.equal(got[0].source, 'wikipedia');
});

test('enrichment merges without duplicating a year already bundled', () => {
  const bundled = history.forDate(new Date('2026-07-20T12:00:00'));
  const dupYear = bundled[0].year;
  const merged = history.merge(bundled, [
    { year: dupYear, text: 'A duplicate year.', tag: 'culture', source: 'wikipedia' },
    { year: 1500, text: 'A brand new year.', tag: 'culture', source: 'wikipedia' },
  ]);
  assert.equal(merged.filter((e) => e.year === dupYear).length, 1);
  assert.ok(merged.some((e) => e.year === 1500));
});

/* ================= VOICE ================= */
test('voice reports its capabilities honestly where APIs are absent', () => {
  assert.equal(canRecord(), false, 'node has no MediaRecorder, so it must say so');
  assert.equal(canDictate(), false);
  assert.equal(pickMimeType(), '');
});

test('recording refuses cleanly rather than throwing something opaque', async () => {
  const r = new Recorder();
  await assert.rejects(() => r.start(), (e) => e.message === 'NO_RECORDER');
  assert.equal(r.recording, false);
});

test('cancel is safe even when nothing was ever started', () => {
  const r = new Recorder();
  r.cancel();
  assert.equal(r.recording, false);
  assert.equal(r.seconds, 0);
});

test('durations format the way a stopwatch should', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(9.6), '0:09');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(600), '10:00');
});

test('the recording cap is a sane three minutes', () => {
  assert.equal(MAX_SECONDS, 180);
  assert.ok(estimateBytes(180) < 1_000_000, 'three minutes should stay under a megabyte');
});

test('dictation reports unavailability instead of pretending', () => {
  assert.equal(Dictation.available(), false);
  const d = new Dictation();
  let err = null;
  const ok = d.start(null, (e) => { err = e; });
  assert.equal(ok, false);
  assert.equal(err.message, 'NO_DICTATION');
});

test('a moment can carry audio through storage', async () => {
  await store.clearAll();
  const m = compose({ kind: 'voice', label: 'about the walk', at: '2026-07-23T19:00:00' });
  m.audio = 'data:audio/webm;base64,AAAA';
  m.audioSeconds = 12.4;
  await store.putMoment(m);
  const back = await store.getMoment(m.id);
  assert.equal(back.audio, m.audio);
  assert.equal(back.audioSeconds, 12.4);
  assert.match(back.placard, /out loud|recorded|spoke/i);
});

/* ================= SYNC ================= */
test('sync declines gracefully with nothing configured', async () => {
  assert.equal((await backup.syncNow('a passphrase')).status, 'no-folder');
  assert.equal(await backup.syncEnabled(), false);
});

test('sync capability is reported honestly for the platform', () => {
  // node has no File System Access API, so it must fall back to manual kits
  assert.equal(backup.syncCapability(), 'manual');
});

test('a second device’s moments merge in without losing the first device’s', async () => {
  // This is the same merge path sync uses, exercised through restore.
  await store.clearAll();
  await store.putMoment(compose({ kind: 'meal', label: 'ramen', at: '2026-07-20T19:00:00' }));
  const laptopKit = await seal(await backup.buildArchive(), 'shared passphrase');

  await store.clearAll();
  await store.putMoment(compose({ kind: 'place', label: 'the coast', at: '2026-07-21T13:00:00' }));

  await backup.restore(laptopKit, 'shared passphrase', { merge: true });
  const all = await store.allMoments();
  assert.equal(all.length, 2);
  assert.ok(all.some((m) => m.label === 'ramen'));
  assert.ok(all.some((m) => m.label === 'the coast'));
});

test('the newer edit wins when both devices touched the same moment', async () => {
  await store.clearAll();
  const base = compose({ kind: 'note', label: 'first draft', at: '2026-07-20T09:00:00' });
  base.editedAt = '2026-07-20T09:00:00.000Z';
  await store.putMoment(base);

  const newer = { ...base, label: 'second draft', placard: 'A later version.',
                  editedAt: '2026-07-21T09:00:00.000Z' };
  const kit = await seal({ product: 'Curio', moments: [newer] }, 'shared passphrase');
  await backup.restore(kit, 'shared passphrase', { merge: true });

  const all = await store.allMoments();
  assert.equal(all.length, 1, 'still one moment, not two');
  assert.equal(all[0].label, 'second draft', 'the later edit wins');
});

test('an older edit does not overwrite a newer one', async () => {
  await store.clearAll();
  const current = compose({ kind: 'note', label: 'current', at: '2026-07-20T09:00:00' });
  current.editedAt = '2026-07-22T09:00:00.000Z';
  await store.putMoment(current);

  const stale = { ...current, label: 'stale', editedAt: '2026-07-20T09:00:00.000Z' };
  const kit = await seal({ product: 'Curio', moments: [stale] }, 'shared passphrase');
  await backup.restore(kit, 'shared passphrase', { merge: true });

  const all = await store.allMoments();
  assert.equal(all[0].label, 'current', 'the newer copy survived');
});
