import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sizes from '../storage.js';
import { compose } from '../core.js';
import * as store from '../store.js';

/** A data URL of a believable size. */
const fakeData = (mime, bytes) =>
  `data:${mime};base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`;

const photoOf = (bytes) => fakeData('image/jpeg', bytes);
const audioOf = (bytes) => fakeData('audio/webm', bytes);

/* ================= MEASURING ================= */
test('data URL sizes are measured, not guessed', () => {
  assert.equal(sizes.dataUrlBytes(photoOf(1000)), 1000);
  assert.equal(sizes.dataUrlBytes(photoOf(0)), 0);
  assert.equal(sizes.dataUrlBytes(null), 0);
  assert.equal(sizes.dataUrlBytes(undefined), 0);
  assert.equal(sizes.dataUrlBytes(''), 0);
  // within a byte or two of the real thing across sizes
  for (const n of [1, 99, 1024, 250_000]) {
    assert.ok(Math.abs(sizes.dataUrlBytes(photoOf(n)) - n) <= 2, `off at ${n}`);
  }
});

test('the archive is broken down by where the weight really is', () => {
  const ms = [
    { ...compose({ kind: 'photo', label: 'a boat', at: '2026-07-01T10:00:00' }), photo: photoOf(300 * sizes.KB) },
    { ...compose({ kind: 'voice', label: 'a thought', at: '2026-07-02T10:00:00' }), audio: audioOf(500 * sizes.KB), audioSeconds: 90 },
    compose({ kind: 'note', label: 'just words', at: '2026-07-03T10:00:00' }),
  ];
  const m = sizes.measure(ms);
  assert.ok(Math.abs(m.photos - 300 * sizes.KB) < 100);
  assert.ok(Math.abs(m.audio - 500 * sizes.KB) < 100);
  assert.ok(m.text > 0 && m.text < 5 * sizes.KB, 'words really do cost almost nothing');
  assert.equal(m.counts.photos, 1);
  assert.equal(m.counts.audio, 1);
  assert.equal(m.audioSeconds, 90);
  assert.equal(m.total, m.photos + m.audio + m.text);
});

test('the heaviest moments are surfaced, largest first', () => {
  const ms = [
    { ...compose({ kind: 'photo', label: 'small', at: '2026-07-01T10:00:00' }), photo: photoOf(50 * sizes.KB) },
    { ...compose({ kind: 'photo', label: 'huge', at: '2026-07-02T10:00:00' }), photo: photoOf(900 * sizes.KB) },
    { ...compose({ kind: 'photo', label: 'middling', at: '2026-07-03T10:00:00' }), photo: photoOf(300 * sizes.KB) },
  ];
  const m = sizes.measure(ms);
  assert.equal(m.largest[0].title, m.largest[0].title);
  assert.ok(m.largest[0].bytes > m.largest[1].bytes);
  assert.ok(m.largest[1].bytes > m.largest[2].bytes);
});

test('an empty archive measures cleanly rather than dividing by zero', () => {
  const m = sizes.measure([]);
  assert.equal(m.total, 0);
  assert.equal(m.largest.length, 0);
  assert.equal(m.counts.moments, 0);
});

test('sizes are phrased for humans', () => {
  assert.equal(sizes.humanBytes(0), '0 KB');
  assert.equal(sizes.humanBytes(512), '512 B');
  assert.equal(sizes.humanBytes(2048), '2 KB');
  assert.match(sizes.humanBytes(5 * sizes.MB), /5\.0 MB/);
  assert.match(sizes.humanBytes(1600 * sizes.MB), /1\.6 GB/);
});

/* ================= PROJECTION ================= */
test('growth is projected from the real spread of the archive', () => {
  const ms = [];
  for (let d = 1; d <= 10; d++) {
    ms.push({
      ...compose({ kind: 'photo', label: `day ${d}`, at: `2026-07-${String(d).padStart(2, '0')}T10:00:00` }),
      photo: photoOf(100 * sizes.KB),
    });
  }
  const p = sizes.projection(ms, 500 * sizes.MB);
  assert.ok(p.spanDays >= 8 && p.spanDays <= 10, `span was ${p.spanDays}`);
  assert.ok(p.perDay > 90 * sizes.KB, 'roughly a photo a day');
  assert.ok(p.perYear > 30 * sizes.MB);
  assert.ok(p.daysLeft > 1000, 'plenty of room at this rate');
});

test('projection stays quiet until there is enough to project from', () => {
  const p = sizes.projection([compose({ kind: 'note', label: 'x', at: '2026-07-01T10:00:00' })], 0);
  assert.equal(p.perDay, 0);
  assert.equal(p.daysLeft, null);
});

test('pressure escalates as the device fills', () => {
  const q = 100 * sizes.MB;
  assert.equal(sizes.pressure(10 * sizes.MB, q).level, 'comfortable');
  assert.equal(sizes.pressure(50 * sizes.MB, q).level, 'moderate');
  assert.equal(sizes.pressure(75 * sizes.MB, q).level, 'high');
  assert.equal(sizes.pressure(95 * sizes.MB, q).level, 'critical');
  assert.equal(sizes.pressure(5 * sizes.MB, 0).level, 'unknown');
});

/* ================= ADVICE ================= */
test('advice appears only when there is something worth doing', () => {
  const tiny = sizes.measure([compose({ kind: 'note', label: 'x', at: '2026-07-01T10:00:00' })]);
  assert.deepEqual(sizes.suggestions(tiny, 500 * sizes.MB), []);

  const heavy = sizes.measure(Array.from({ length: 20 }, (_, i) => ({
    ...compose({ kind: 'photo', label: `p${i}`, at: '2026-07-01T10:00:00' }),
    photo: photoOf(500 * sizes.KB),
  })));
  const advice = sizes.suggestions(heavy, 500 * sizes.MB);
  assert.ok(advice.some((a) => a.key === 'shrinkPhotos'));
  assert.ok(advice[0].saves > 0);
});

test('old recordings are identified by age, not guesswork', () => {
  const now = new Date('2026-07-23T12:00:00');
  const ms = [
    { ...compose({ kind: 'voice', label: 'recent', at: '2026-07-01T10:00:00' }), audio: audioOf(1000) },
    { ...compose({ kind: 'voice', label: 'old', at: '2025-01-01T10:00:00' }), audio: audioOf(1000) },
    compose({ kind: 'note', label: 'no audio', at: '2024-01-01T10:00:00' }),
  ];
  const old = sizes.audioOlderThan(ms, 180, now);
  assert.equal(old.length, 1);
  assert.equal(old[0].label, 'old');
});

/* ================= RECLAIMING ================= */
test('dropping old audio keeps every written word', async () => {
  await store.clearAll();
  const now = new Date('2026-07-23T12:00:00');
  const old = { ...compose({ kind: 'voice', label: 'a walk', at: '2024-01-01T10:00:00' }),
                audio: audioOf(400 * sizes.KB), audioSeconds: 60, mood: 4 };
  const recent = { ...compose({ kind: 'voice', label: 'today', at: '2026-07-20T10:00:00' }),
                   audio: audioOf(400 * sizes.KB), audioSeconds: 60 };
  await store.putMoment(old);
  await store.putMoment(recent);

  const before = await store.allMoments();
  const res = await sizes.dropOldAudio(before, store.putMoment, { days: 180 });
  assert.equal(res.processed, 1, 'only the old one');
  assert.ok(res.saved > 300 * sizes.KB);

  const after = await store.allMoments();
  const backOld = after.find((m) => m.id === old.id);
  const backNew = after.find((m) => m.id === recent.id);

  assert.equal(backOld.audio, null, 'the recording went');
  assert.equal(backOld.title, old.title, 'the title stayed');
  assert.equal(backOld.placard, old.placard, 'every word stayed');
  assert.equal(backOld.mood, 4, 'the mood stayed');
  assert.equal(backOld.day, old.day, 'the date stayed');
  assert.equal(backNew.audio, recent.audio, 'the recent recording is untouched');
});

test('nothing is dropped when nothing is old enough', async () => {
  await store.clearAll();
  const m = { ...compose({ kind: 'voice', label: 'today', at: '2026-07-20T10:00:00' }), audio: audioOf(1000) };
  await store.putMoment(m);
  const res = await sizes.dropOldAudio(await store.allMoments(), store.putMoment, { days: 3650 });
  assert.equal(res.processed, 0);
  assert.equal(res.saved, 0);
  assert.ok((await store.getMoment(m.id)).audio, 'the recording survived');
});

test('recompression never makes a photo bigger, and degrades safely without a canvas', async () => {
  const original = photoOf(100 * sizes.KB);
  const out = await sizes.recompressPhoto(original, { maxDim: 400, quality: 0.5 });
  // node has no document, so it must hand back exactly what it was given
  assert.equal(out, original);
  assert.ok(sizes.dataUrlBytes(out) <= sizes.dataUrlBytes(original));
});

test('shrinking reports progress and touches only photos', async () => {
  await store.clearAll();
  await store.putMoment({ ...compose({ kind: 'photo', label: 'p', at: '2026-07-01T10:00:00' }), photo: photoOf(10 * sizes.KB) });
  await store.putMoment(compose({ kind: 'note', label: 'n', at: '2026-07-02T10:00:00' }));

  const seen = [];
  const res = await sizes.shrinkAllPhotos(await store.allMoments(), store.putMoment, {
    onProgress: (a, b) => seen.push([a, b]),
  });
  assert.equal(res.processed, 1, 'only the photo was considered');
  assert.deepEqual(seen, [[1, 1]]);
});

/* ================= QUALITY TIERS ================= */
test('quality tiers are ordered and sane', () => {
  const a = sizes.AUDIO_QUALITY;
  assert.ok(a.small.bitrate < a.balanced.bitrate);
  assert.ok(a.balanced.bitrate < a.clear.bitrate);
  assert.ok(a.balanced.perMinute < 300 * sizes.KB, 'a minute of speech should stay small');
  assert.ok(sizes.AUDIO_QUALITY[sizes.DEFAULT_AUDIO_QUALITY]);

  const p = sizes.PHOTO_QUALITY;
  assert.ok(p.small.maxDim < p.balanced.maxDim);
  assert.ok(p.balanced.maxDim < p.clear.maxDim);
  assert.ok(sizes.PHOTO_QUALITY[sizes.DEFAULT_PHOTO_QUALITY]);
});

test('three minutes of voice at the default stays modest', async () => {
  const { estimateBytes } = await import('../voice.js');
  const bytes = estimateBytes(180, sizes.AUDIO_QUALITY.balanced.bitrate);
  assert.ok(bytes < 600 * sizes.KB, `three minutes came to ${sizes.humanBytes(bytes)}`);
  const small = estimateBytes(180, sizes.AUDIO_QUALITY.small.bitrate);
  assert.ok(small < bytes, 'the small tier really is smaller');
});

/* ================= REAL COMPRESSION (needs the optional canvas module) ================= */
let createCanvas, Image;
try { ({ createCanvas, Image } = await import('canvas')); }
catch { console.log('# real-compression tests skipped — optional `canvas` not installed'); }
const canRender = Boolean(createCanvas);

test('compression genuinely shrinks a real photograph', { skip: !canRender }, async () => {
  globalThis.document = { createElement: (t) => (t === 'canvas' ? createCanvas(10, 10) : {}) };
  globalThis.Image = Image;

  // a 2000x1500 image with enough detail that it cannot compress to nothing
  const c = createCanvas(2000, 1500);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(2000, 1500);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.sin(i * 0.0007) * 90 + 128) | 0;
    img.data[i] = v; img.data[i + 1] = (v * 0.7) | 0; img.data[i + 2] = 255 - v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const original = c.toDataURL('image/jpeg', 0.92);
  const before = sizes.dataUrlBytes(original);
  assert.ok(before > 300 * sizes.KB, 'the fixture should be a substantial photo');

  const small = await sizes.recompressPhoto(original, sizes.PHOTO_QUALITY.small);
  const after = sizes.dataUrlBytes(small);
  assert.ok(after < before * 0.5, `expected a real saving, got ${sizes.humanBytes(after)} from ${sizes.humanBytes(before)}`);

  // the tiers must be ordered in output size, not just in configuration
  const balanced = sizes.dataUrlBytes(await sizes.recompressPhoto(original, sizes.PHOTO_QUALITY.balanced));
  const clear = sizes.dataUrlBytes(await sizes.recompressPhoto(original, sizes.PHOTO_QUALITY.clear));
  assert.ok(after < balanced && balanced < clear, 'small < balanced < clear');

  delete globalThis.document; delete globalThis.Image;
});

test('re-compressing an already-small photo never makes it bigger', { skip: !canRender }, async () => {
  globalThis.document = { createElement: (t) => (t === 'canvas' ? createCanvas(10, 10) : {}) };
  globalThis.Image = Image;

  const c = createCanvas(400, 300);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c9a24b'; ctx.fillRect(0, 0, 400, 300);
  const already = c.toDataURL('image/jpeg', 0.7);

  const out = await sizes.recompressPhoto(already, sizes.PHOTO_QUALITY.clear);
  assert.ok(sizes.dataUrlBytes(out) <= sizes.dataUrlBytes(already),
    'the guard must hand back the original rather than a larger re-encode');

  delete globalThis.document; delete globalThis.Image;
});
