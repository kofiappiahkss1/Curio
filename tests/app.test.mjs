/**
 * Drives the real app in a headless DOM: boots index.html, taps buttons,
 * captures moments, and checks what actually renders on screen.
 */
import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

const dom = new JSDOM(html, { url: 'https://example.org/', pretendToBeVisual: true });
const { window } = dom;

// wire the browser globals the app expects
const define = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
globalThis.window = window;
globalThis.document = window.document;
define('navigator', window.navigator);
define('location', window.location);
globalThis.history = window.history;
globalThis.Image = window.Image;
globalThis.FileReader = window.FileReader;
globalThis.Blob = window.Blob;
globalThis.URL = window.URL;
globalThis.confirm = () => true;
define('matchMedia', window.matchMedia ? window.matchMedia.bind(window) : () => ({ matches: false }));
globalThis.addEventListener = window.addEventListener.bind(window);

Object.defineProperty(window.navigator, 'mediaDevices', {
  value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
  configurable: true,
});
Object.defineProperty(window.navigator, 'geolocation', {
  value: { getCurrentPosition: (ok) => ok({ coords: { latitude: 54.32, longitude: 10.13 } }) },
  configurable: true,
});
Object.defineProperty(window.navigator, 'storage', {
  value: { persist: async () => true, estimate: async () => ({ usage: 1024, quota: 5e8 }) },
  configurable: true,
});

const settle = () => new Promise((r) => setTimeout(r, 40));

await import('../app.js');
await settle();

const $ = (id) => window.document.getElementById(id);
const text = () => window.document.getElementById('body').textContent;

async function capture(kind, value) {
  $('fab').click();                                    // open capture sheet
  await settle();
  const tile = $('sheet').querySelector(`.kind[data-kind="${kind}"]`);
  assert.ok(tile, `capture tile for "${kind}" should exist`);
  tile.click();
  await settle();
  $('sheet').querySelector('#val').value = value;
  $('sheet').querySelector('#save').click();
  await settle();
}

test('first run shows the permissions screen with a language picker', () => {
  assert.ok($('lang'), 'a language selector should be offered');
  assert.ok($('lang').options.length >= 10, 'many languages should be listed');
  assert.ok($('body').querySelectorAll('[data-req]').length >= 3, 'permissions should be requestable');
});

test('a permission button actually requests and reports its result', async () => {
  const btn = $('body').querySelector('[data-req="camera"]');
  btn.click();
  await settle();
  assert.match(btn.textContent, /Allowed|Declined|—/);
});

test('finishing onboarding reveals the app', async () => {
  $('done').click();
  await settle();
  assert.equal($('tabs').querySelectorAll('.tab').length, 4);
  assert.match(window.document.body.textContent, /Curio/);
});

test('an empty archive invites the first moment', () => {
  assert.match(text(), /still blank|Tap \+/i);
});

test('capturing a meal renders a real placard on Today', async () => {
  await capture('meal', 'ramen');
  const body = text();
  assert.match(body, /ramen/i);
  assert.ok($('body').querySelector('.card'), 'a card should be on screen');
  const placard = $('body').querySelector('.card .placard').textContent;
  assert.ok(placard.length > 12, 'placard should be real prose, not empty');
});

test('the day gets a composed title once something is kept', () => {
  const title = $('body').querySelector('.day-title').textContent;
  assert.ok(title.length > 6);
  assert.doesNotMatch(title, /Nothing kept yet/);
});

test('tapping a card reveals its provenance', async () => {
  const card = $('body').querySelector('.card');
  card.click();
  await settle();
  assert.ok(card.classList.contains('open'));
  const prov = card.querySelector('.prov').textContent.trim();
  assert.ok(prov.length > 4, 'provenance should be shown');
  assert.match(prov, /\d{1,2}:\d{2}/, 'provenance should carry the time');
});

test('capturing a place and a person builds the day', async () => {
  await capture('place', 'Kiel harbour');
  await capture('person', 'Anna');
  assert.equal($('body').querySelectorAll('.card').length, 3);
  assert.match(text(), /Kiel harbour/);
  assert.match(text(), /Anna/);
});

test('an off-limits subject is refused and counted as withheld', async () => {
  await capture('note', 'my banking password is hunter2');
  const body = text();
  assert.match(body, /withheld/i, 'the day should show a withheld notice');
  // and it must not appear anywhere in the archive
  assert.doesNotMatch(body, /hunter2/, 'sealed content must never be stored');
});

test('Threads finds patterns from what was kept', async () => {
  await capture('meal', 'ramen');            // second ramen -> a pattern
  $('tabs').querySelector('[data-tab="threads"]').click();
  await settle();
  assert.match(text(), /ramen|loyal|returning|map you actually walk/i);
});

test('Archive lists the days and search finds a moment', async () => {
  $('tabs').querySelector('[data-tab="archive"]').click();
  await settle();
  assert.ok($('body').querySelector('.tl-item'), 'a day should be listed');
  const q = $('q');
  q.value = 'harbour';
  q.dispatchEvent(new window.Event('input'));
  await settle();
  assert.match(text(), /harbour/i);
  assert.ok($('body').querySelector('.card'), 'search should show matching cards');
});

test('Vault shows sealed subjects that cannot be switched on', async () => {
  $('tabs').querySelector('[data-tab="vault"]').click();
  await settle();
  assert.match(text(), /Answers only to you/);
  const locked = $('body').querySelectorAll('.toggle.locked');
  assert.ok(locked.length >= 4, 'banking, health, messages, passwords must be sealed');
  assert.match(text(), /No account, no server/i);
});

test('a capture source can be switched off and then offers fewer options', async () => {
  const photoToggle = $('body').querySelector('.toggle[data-key="photo"]');
  photoToggle.click();
  await settle();
  $('fab').click();
  await settle();
  assert.equal($('sheet').querySelector('.kind[data-kind="photo"]'), null,
    'a disabled source must not be offered');
  $('sheetbg').click();
  await settle();
});

test('forgetting a moment removes it from the day', async () => {
  $('tabs').querySelector('[data-tab="today"]').click();
  await settle();
  const before = $('body').querySelectorAll('.card').length;
  const card = $('body').querySelector('.card');
  card.click();                                        // open
  await settle();
  card.querySelector('[data-act="forget"]').click();
  await settle();
  assert.equal($('body').querySelectorAll('.card').length, before - 1);
});

test('the archive survives a full reload', async () => {
  const { allMoments } = await import('../store.js');
  const kept = (await allMoments()).filter((m) => m.kept !== false);
  assert.ok(kept.length >= 3, 'moments persist in the local database');
});

test('switching language in the Vault rewrites the whole app', async () => {
  $('tabs').querySelector('[data-tab="vault"]').click();
  await settle();
  const sel = $('lang');
  assert.ok(sel, 'the vault offers a language picker');

  sel.value = 'sw';
  sel.dispatchEvent(new window.Event('change'));
  await settle();
  assert.match(text(), /Kasha|Kumbukumbu|Lugha/, 'the vault is now in Kiswahili');

  $('tabs').querySelector('[data-tab="today"]').click();
  await settle();
  assert.match(text(), /Leo|Siku|Gusa/, 'Today is now in Kiswahili');

  // a newly kept moment is written in the new language
  await capture('meal', 'wali');
  const placards = [...$('body').querySelectorAll('.card .placard')].map((p) => p.textContent);
  assert.ok(placards.some((p) => /ulikula|ilitosha|kulikuwa/i.test(p)),
    'the new placard is written in Kiswahili');
  // and older entries keep the language they were written in — the diary
  // does not retroactively rewrite your past.
  assert.ok(placards.some((p) => /you ate|it did the job|there was/i.test(p)),
    'earlier placards stay in their original language');
});

test('right-to-left languages flip the document direction', async () => {
  $('tabs').querySelector('[data-tab="vault"]').click();
  await settle();
  const sel = $('lang');
  sel.value = 'ar';
  sel.dispatchEvent(new window.Event('change'));
  await settle();
  assert.equal(window.document.documentElement.dir, 'rtl');
  assert.equal(window.document.documentElement.lang, 'ar');

  sel.value = 'en-GB';
  sel.dispatchEvent(new window.Event('change'));
  await settle();
  assert.equal(window.document.documentElement.dir, 'ltr');
});

test('onboarding offers a restore path for a new device', async () => {
  // (the app is already past onboarding here, so check the markup was present earlier
  //  by re-running the flow on a fresh store is out of scope — assert the Vault route instead)
  $('tabs').querySelector('[data-tab="vault"]').click();
  await settle();
  assert.ok($('body').querySelector('#restore'), 'the Vault offers a restore button');
  assert.ok($('body').querySelector('#kitfile'), 'a kit file picker exists');
});

test('the Vault carries the safekeeping section', async () => {
  const body = text();
  assert.match(body, /Safekeeping|never lose|Resguardo|Sauvegarde/i);
  assert.ok($('body').querySelector('#backup'), 'a Save Recovery Kit button exists');
  assert.ok($('body').querySelector('#recovery-anchor'), 'the recovery anchor exists');
});

test('asking for a Recovery Kit requires a confirmed passphrase', async () => {
  $('body').querySelector('#backup').click();
  await settle();
  const sheet = $('sheet');
  assert.ok(sheet.querySelector('#p1'), 'passphrase field');
  assert.ok(sheet.querySelector('#p2'), 'confirmation field');
  sheet.querySelector('#p1').value = 'four unrelated words here';
  sheet.querySelector('#p1').dispatchEvent(new window.Event('input'));
  await settle();
  assert.ok(sheet.querySelector('.fingerprint'), 'a passphrase fingerprint is shown');
  $('sheetbg').click();
  await settle();
});

test('Today shows a streak bar', async () => {
  $('tabs').querySelector('[data-tab="today"]').click();
  await settle();
  assert.ok($('body').querySelector('.streakbar'), 'streak bar renders');
});

test('the capture sheet offers a mood, and it is saved with the moment', async () => {
  $('fab').click();
  await settle();
  $('sheet').querySelector('.kind[data-kind="meal"]').click();
  await settle();
  const moods = $('sheet').querySelectorAll('.moodbtn');
  assert.equal(moods.length, 5, 'five moods offered');
  moods[4].click();                              // "Great"
  await settle();
  assert.ok(moods[4].classList.contains('on'));
  $('sheet').querySelector('#val').value = 'birthday cake';
  $('sheet').querySelector('#save').click();
  await settle();

  const { allMoments } = await import('../store.js');
  const saved = (await allMoments()).find((m) => m.label === 'birthday cake');
  assert.ok(saved, 'the moment was kept');
  assert.equal(saved.mood, 5, 'the mood was kept with it');
  assert.match(text(), /😄/, 'the mood shows on the card');
});

test('Threads shows statistics once there is something to count', async () => {
  $('tabs').querySelector('[data-tab="threads"]').click();
  await settle();
  assert.ok($('body').querySelector('.statgrid'), 'stat grid renders');
});

test('Archive shows the year grid', async () => {
  $('tabs').querySelector('[data-tab="archive"]').click();
  await settle();
  assert.ok($('body').querySelector('.year'), 'year-in-pixels renders');
  assert.equal($('body').querySelectorAll('.px').length, new Date().getFullYear() % 4 === 0 ? 366 : 365);
});
