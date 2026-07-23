/**
 * Guards against the failure that actually bites in production: a change is
 * published and the app carries on serving the old one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
const sw = read('sw.js');

const listFrom = (name) => {
  const block = sw.slice(sw.indexOf(`const ${name} = [`));
  return [...block.slice(0, block.indexOf('];')).matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
};
const CODE = listFrom('CODE');
const ASSETS = listFrom('ASSETS');

test('every file the service worker caches actually exists', () => {
  for (const p of [...CODE, ...ASSETS]) {
    if (p === './') continue;
    assert.ok(existsSync(join(root, p)), `${p} is cached but not on disk`);
  }
});

test('every module the app imports is in the cache list', () => {
  const entry = ['app.js', 'core.js', 'store.js', 'i18n.js', 'crypto.js', 'backup.js',
    'share.js', 'voice.js', 'history.js', 'storage.js', 'profile.js', 'holidays.js',
    'device.js', 'meeting.js', 'themes.js', 'search.js', 'book.js', 'locks.js'];

  const seen = new Set();
  for (const f of entry) {
    const src = read(f);
    for (const m of src.matchAll(/from\s+'(\.\/[^']+\.js)'/g)) seen.add(m[1]);
  }
  for (const dep of seen) {
    assert.ok(CODE.includes(dep), `${dep} is imported but never cached — it would fail offline`);
  }
});

test('no JavaScript module on disk has been forgotten', () => {
  const onDisk = readdirSync(root)
    .filter((f) => f.endsWith('.js') && !f.startsWith('make_'))
    .map((f) => './' + f);
  for (const f of onDisk) {
    if (f === './sw.js') continue;                 // the worker is not cached by itself
    assert.ok(CODE.includes(f), `${f} exists but is missing from the service worker`);
  }
});

test('app code is served network-first so a published change actually arrives', () => {
  assert.match(sw, /networkFirst/, 'there must be a network-first path');
  assert.match(sw, /isCode\(url\)\s*\)\s*\{\s*event\.respondWith\(networkFirst/,
    'code must route to network-first, not cache-first');
  assert.match(sw, /html\|js/, 'html and js must count as code');
});

test('the install bypasses the browser HTTP cache', () => {
  assert.match(sw, /cache:\s*'reload'/,
    "install must fetch with cache:'reload' or it can install stale files");
});

test('a new worker takes over instead of waiting behind an old tab', () => {
  assert.match(sw, /skipWaiting\(\)/);
  assert.match(sw, /clients\.claim\(\)/);
  assert.match(sw, /addEventListener\('message'/, 'the app must be able to ask it to take over');
});

test('old caches are cleared on activation', () => {
  assert.match(sw, /caches\.delete/);
  assert.match(sw, /const VERSION = '[^']+'/, 'the cache name must be versioned');
});

test('the connectivity probe is still allowed past the cache', () => {
  assert.match(sw, /curio-ping/);
});

test('the app watches for updates and can be asked to check', () => {
  const app = read('app.js');
  assert.match(app, /updatefound/, 'it must notice a new worker');
  assert.match(app, /controllerchange/, 'and reload when one takes over');
  assert.match(app, /updateViaCache:\s*'none'/, 'and not let the browser cache sw.js');
  assert.match(app, /function checkForUpdates/, 'and offer a manual check');
  assert.match(app, /export const BUILD = '[\d.\-]+'/, 'a visible build stamp');
});

test('the build stamp is shown where a person can find it', () => {
  const app = read('app.js');
  assert.match(app, /buildstamp/, 'the version must be rendered, not just declared');
  assert.match(read('app.html'), /\.buildstamp\{/, 'and styled so it reads clearly');
});

test('the service worker and the app agree on the version', () => {
  const swVersion = sw.match(/const VERSION = '([^']+)'/)[1];
  const build = read('app.js').match(/export const BUILD = '([^']+)'/)[1];
  assert.ok(build.endsWith(swVersion.replace(/^v/, '')),
    `build ${build} should end with service worker version ${swVersion}`);
});
