import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchIndex, tokenize, stem, withinOneEdit, highlight, searchMoments } from '../search.js';
import { withLock, hasWebLocks } from '../locks.js';
import * as book from '../book.js';
import * as sizes from '../storage.js';
import { compose, composeDay, isLocked, visibleMoments, lockedMoments,
         nextCapsule, newlyOpened, capsuleOptions, isCapsule } from '../core.js';

const sample = () => [
  compose({ kind: 'meal', label: 'ramen at the harbour', at: '2026-07-20T19:00:00' }),
  compose({ kind: 'place', label: 'Kiel harbour', at: '2026-07-21T13:00:00' }),
  compose({ kind: 'meal', label: 'jollof rice in Accra', at: '2025-03-10T19:00:00' }),
  compose({ kind: 'note', label: 'we walked the long way home', at: '2026-06-01T09:00:00' }),
];

/* ================= SEARCH ================= */
test('tokenising strips noise and folds accents', () => {
  assert.deepEqual(tokenize('Café, in the RAIN!'), ['cafe', 'rain']);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  assert.ok(!tokenize('the and of').length, 'stop words are dropped');
});

test('stemming is light rather than aggressive', () => {
  assert.equal(stem('walking'), 'walk');
  assert.equal(stem('walked'), 'walk');
  assert.equal(stem('harbours'), 'harbour');
  assert.equal(stem('glass'), 'glass', 'double-s words are left alone');
  assert.equal(stem('bus'), 'bus');
});

test('one-edit distance catches real typos and rejects the rest', () => {
  assert.ok(withinOneEdit('harbour', 'harbor'));
  assert.ok(withinOneEdit('rice', 'rise'));
  assert.ok(withinOneEdit('ramen', 'ramen'));
  assert.ok(!withinOneEdit('harbour', 'kitchen'));
  assert.ok(!withinOneEdit('cat', 'dogs'));
});

test('search finds exact words and ranks the best match first', () => {
  const ms = sample();
  const ix = SearchIndex.build(ms);
  const hits = ix.search('ramen harbour');
  assert.ok(hits.length >= 2);
  const top = ms.find((m) => m.id === hits[0].id);
  assert.match(top.label, /ramen at the harbour/, 'the moment matching both words wins');
  assert.ok(hits[0].score > hits[1].score * 2, 'and wins by a clear margin');
});

test('a partial word finds the whole one, so results appear while typing', () => {
  const ix = SearchIndex.build(sample());
  assert.ok(ix.search('harb').length >= 2);
  assert.ok(ix.search('joll').length >= 1);
});

test('a typo still finds the moment', () => {
  const ms = sample();
  const ix = SearchIndex.build(ms);
  const hits = ix.search('harbor');           // US spelling
  assert.ok(hits.length >= 1);
  const typo = ix.search('jollof rise');      // rice
  assert.ok(typo.length >= 1);
  assert.match(ms.find((m) => m.id === typo[0].id).label, /jollof/);
});

test('stemming means a different tense still matches', () => {
  const ix = SearchIndex.build(sample());
  assert.ok(ix.search('walking').length >= 1, '"walking" should find "walked"');
});

test('search covers meeting transcripts and notes too', () => {
  const m = compose({ kind: 'meeting', label: 'Launch review', at: '2026-07-22T10:00:00' });
  m.meeting = { notes: 'the printer is the risk', transcript: 'we decided to move the launch to October' };
  const ix = SearchIndex.build([m]);
  assert.ok(ix.search('printer').length === 1);
  assert.ok(ix.search('october').length === 1);
});

test('an unknown word returns nothing rather than everything', () => {
  const ix = SearchIndex.build(sample());
  assert.equal(ix.search('zzzzquux').length, 0);
  assert.equal(ix.search('').length, 0);
});

test('removing a moment takes it out of the results', () => {
  const ms = sample();
  const ix = SearchIndex.build(ms);
  assert.ok(ix.search('accra').length === 1);
  ix.remove(ms[2].id);
  assert.equal(ix.search('accra').length, 0);
  assert.equal(ix.size, 3);
});

test('suggestions offer real words from the archive', () => {
  const ix = SearchIndex.build(sample());
  const s = ix.suggest('har');
  assert.ok(s.includes('harbour'));
  assert.equal(ix.suggest('').length, 0);
});

test('highlighting marks matches and never lets markup through', () => {
  const out = highlight('ramen at the harbour', 'harb', (s) => s.replace(/</g, '&lt;'));
  assert.match(out, /<mark>harbour<\/mark>/);
  const nasty = highlight('<script>alert(1)</script> harbour', 'harbour', (s) => s.replace(/</g, '&lt;'));
  assert.ok(!nasty.includes('<script>'), 'escaping happens before marking');
});

test('the convenience wrapper returns whole moments', () => {
  const ms = sample();
  const found = searchMoments(ms, 'accra');
  assert.equal(found.length, 1);
  assert.equal(found[0].label, 'jollof rice in Accra');
});

/* ================= LOCKS ================= */
test('writes are serialised even without the Web Locks API', async () => {
  const order = [];
  await Promise.all([
    withLock('t1', async () => { order.push('a1'); await new Promise((r) => setTimeout(r, 30)); order.push('a2'); }),
    withLock('t1', async () => { order.push('b1'); order.push('b2'); }),
  ]);
  assert.deepEqual(order, ['a1', 'a2', 'b1', 'b2'], 'the second waited for the first');
});

test('different locks do not block each other', async () => {
  const order = [];
  await Promise.all([
    withLock('x', async () => { await new Promise((r) => setTimeout(r, 25)); order.push('slow'); }),
    withLock('y', async () => { order.push('fast'); }),
  ]);
  assert.deepEqual(order, ['fast', 'slow']);
});

test('a thrown error releases the lock rather than wedging it', async () => {
  await assert.rejects(() => withLock('z', async () => { throw new Error('boom'); }));
  const after = await withLock('z', async () => 'ok');
  assert.equal(after, 'ok', 'the lock was released');
});

test('lock support is reported honestly', () => {
  assert.equal(typeof hasWebLocks(), 'boolean');
});

/* ================= WEBP ================= */
test('WebP support is detected rather than assumed', () => {
  sizes._resetWebPCache();
  assert.equal(sizes.canEncodeWebP(), false, 'node has no canvas, so it must say no');
  const fmt = sizes.bestImageFormat('balanced');
  assert.equal(fmt.mime, 'image/jpeg', 'and fall back to JPEG');
  assert.equal(fmt.maxDim, sizes.PHOTO_QUALITY.balanced.maxDim);
});

test('the WebP opportunity is nil when the browser cannot encode it', () => {
  sizes._resetWebPCache();
  const o = sizes.webpOpportunity([{ photo: 'data:image/jpeg;base64,AAAA' }]);
  assert.equal(o.possible, false);
  assert.equal(o.saves, 0);
});

/* ================= TIME CAPSULES ================= */
test('a sealed moment is genuinely absent until its date', () => {
  const now = new Date('2026-07-23T12:00:00');
  const open = compose({ kind: 'note', label: 'ordinary', at: '2026-07-20T09:00:00' });
  const sealed = { ...compose({ kind: 'note', label: 'for later', at: '2026-07-20T09:00:00' }),
                   unlockAt: '2027-01-01T09:00:00' };
  const all = [open, sealed];

  assert.equal(isLocked(sealed, now), true);
  assert.equal(isLocked(open, now), false);
  assert.equal(isCapsule(sealed), true);
  assert.deepEqual(visibleMoments(all, now).map((m) => m.label), ['ordinary']);
  assert.equal(lockedMoments(all, now).length, 1);

  // and it is not searchable while sealed, because it is not in the index at all
  const ix = SearchIndex.build(visibleMoments(all, now));
  assert.equal(ix.search('later').length, 0);
});

test('a capsule reappears on its own once the date passes', () => {
  const sealed = { ...compose({ kind: 'note', label: 'for later', at: '2026-07-20T09:00:00' }),
                   unlockAt: '2026-12-25T09:00:00' };
  assert.equal(isLocked(sealed, new Date('2026-12-24T23:00:00')), true);
  assert.equal(isLocked(sealed, new Date('2026-12-25T10:00:00')), false);
  assert.equal(visibleMoments([sealed], new Date('2027-01-01')).length, 1);
});

test('the next capsule and its countdown are reported', () => {
  const now = new Date('2026-07-23T12:00:00');
  const a = { ...compose({ kind: 'note', label: 'a', at: '2026-07-01T09:00:00' }), unlockAt: '2027-01-01T09:00:00' };
  const b = { ...compose({ kind: 'note', label: 'b', at: '2026-07-01T09:00:00' }), unlockAt: '2026-09-01T09:00:00' };
  const n = nextCapsule([a, b], now);
  assert.equal(n.moment.label, 'b', 'the soonest one');
  assert.ok(n.daysAway > 35 && n.daysAway < 45);
  assert.equal(nextCapsule([], now), null);
});

test('capsules that came due since the last visit are announced once', () => {
  const now = new Date('2026-07-23T12:00:00');
  const justOpened = { ...compose({ kind: 'note', label: 'hello again', at: '2025-07-01T09:00:00' }),
                       unlockAt: '2026-07-22T09:00:00' };
  const older = { ...compose({ kind: 'note', label: 'long ago', at: '2024-01-01T09:00:00' }),
                  unlockAt: '2025-01-01T09:00:00' };
  const opened = newlyOpened([justOpened, older], '2026-07-20T00:00:00', now);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].label, 'hello again');
  assert.equal(newlyOpened([justOpened], null, now).length, 0, 'no history, no announcement');
});

test('the sealing presets are sensible and in the future', () => {
  const from = new Date('2026-07-23T12:00:00');
  const opts = capsuleOptions(from);
  assert.deepEqual(opts.map((o) => o.key), ['month6', 'year1', 'year5', 'year10']);
  for (const o of opts) assert.ok(o.date > from, `${o.key} must be ahead`);
  assert.equal(opts[1].date.getFullYear(), 2027);
  assert.equal(opts[3].date.getFullYear(), 2036);
});

/* ================= THE ANNUAL BOOK ================= */
test('a year is organised into months and days', () => {
  const ms = [
    compose({ kind: 'meal', label: 'ramen', at: '2026-03-15T19:00:00' }),
    compose({ kind: 'place', label: 'the harbour', at: '2026-03-16T13:00:00' }),
    compose({ kind: 'note', label: 'a good day', at: '2026-07-20T09:00:00' }),
    compose({ kind: 'note', label: 'last year', at: '2025-07-20T09:00:00' }),
  ];
  const vol = book.organise(ms, 2026, { composeDay, locale: 'en-GB' });
  assert.equal(vol.moments, 3, 'other years are left out');
  assert.equal(vol.days, 3);
  assert.equal(vol.months.length, 12);
  assert.equal(vol.months[2].length, 2, 'March has two days');
  assert.equal(vol.months[6].length, 1, 'July has one');
  assert.equal(vol.months[0].length, 0, 'January is empty');
});

test('the book renders a printable document with real structure', () => {
  const ms = [compose({ kind: 'meal', label: 'ramen', at: '2026-03-15T19:00:00' })];
  const vol = book.organise(ms, 2026, { composeDay, locale: 'en-GB' });
  const html = book.render(vol, { locale: 'en-GB', name: 'Kofi' });

  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /@page\s*\{\s*size: A5/, 'a real page size for printing');
  assert.ok(html.includes('class="cover"'));
  assert.ok(html.includes('class="contents"'));
  assert.ok(html.includes('class="colophon"'));
  assert.match(html, /2026/);
  assert.match(html, /Kofi/);
  assert.match(html, /page-break-before/, 'months start on a fresh page');
  assert.match(html, /window\.print\(\)/, 'it offers itself to the printer');
});

test('the book escapes whatever a person wrote', () => {
  const m = compose({ kind: 'note', label: '<script>alert(1)</script>', at: '2026-03-15T19:00:00' });
  const vol = book.organise([m], 2026, { composeDay, locale: 'en-GB' });
  const html = book.render(vol, { locale: 'en-GB', name: '<img onerror=x>' });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img onerror=x>'));
  assert.match(html, /&lt;script&gt;/);
});

test('an empty year still produces a book rather than an error', () => {
  const vol = book.organise([], 2026, { composeDay, locale: 'en-GB' });
  const html = book.render(vol, { locale: 'en-GB' });
  assert.equal(vol.moments, 0);
  assert.match(html, /Nothing was kept this year/);
});

test('only years with something in them are offered', () => {
  const ms = [
    compose({ kind: 'note', label: 'a', at: '2026-03-15T19:00:00' }),
    compose({ kind: 'note', label: 'b', at: '2024-03-15T19:00:00' }),
    { ...compose({ kind: 'note', label: 'c', at: '2023-03-15T19:00:00' }), kept: false },
  ];
  assert.deepEqual(book.yearsWithContent(ms), [2026, 2024], 'newest first, forgotten ones excluded');
  assert.deepEqual(book.yearsWithContent([]), []);
});
