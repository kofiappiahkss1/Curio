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

/* ================= THE PUBLIC PAGES ================= */
test('the legal and information pages exist and are cached', () => {
  for (const page of ['about.html', 'privacy.html', 'terms.html', 'pages.css']) {
    assert.ok(existsSync(join(root, page)), `${page} is missing`);
    assert.ok(CODE.includes('./' + page), `${page} is not in the service worker cache list`);
  }
});

test('every page is reachable from every other page', () => {
  const pages = ['index.html', 'about.html', 'privacy.html', 'terms.html'];
  for (const p of pages) {
    const html = read(p);
    for (const target of ['about.html', 'privacy.html', 'terms.html']) {
      if (p === target) continue;
      assert.ok(html.includes(target), `${p} does not link to ${target}`);
    }
    assert.ok(html.includes('app.html'), `${p} does not link to the app`);
  }
});

test('the app itself links out to the legal pages', () => {
  const app = read('app.js');
  for (const target of ['about.html', 'privacy.html', 'terms.html']) {
    assert.ok(app.includes(target), `the Vault does not link to ${target}`);
  }
  assert.match(app, /rel="noopener"/, 'external links must not leak the opener');
});

test('the privacy policy discloses the two network exceptions', () => {
  const html = read('privacy.html');
  assert.match(html, /dictation/i, 'live dictation must be disclosed');
  assert.match(html, /Wikipedia/i, 'the history enrichment must be disclosed');
  assert.match(html, /no cookies|sets <strong>no cookies|no cookies<\/strong>/i);
  assert.match(html, /GDPR/);
  assert.match(html, /CCPA|CPRA/);
  assert.match(html, /children/i);
  assert.match(html, /AES-256-GCM/, 'the encryption used should be stated');
  assert.match(html, /PBKDF2/);
});

test('the privacy policy states the rights and how to exercise them', () => {
  const html = read('privacy.html');
  for (const right of ['Access', 'Portability', 'Erasure', 'Rectification']) {
    assert.ok(html.includes(right), `the ${right} right is not covered`);
  }
  assert.match(html, /Erase everything/, 'the in-app deletion route must be named');
});

test('the terms cover the risks that are genuinely the user’s', () => {
  const html = read('terms.html');
  assert.match(html, /Recording other people/i, 'consent for recording must be addressed');
  assert.match(html, /passphrase/i, 'the unrecoverable passphrase must be stated');
  assert.match(html, /as is/i, 'the warranty position must be stated');
  assert.match(html, /cannot be recovered/i);
});

test('about carries a mission, a vision and a way to make contact', () => {
  const html = read('about.html');
  assert.match(html, /Our mission/i);
  assert.match(html, /Our vision/i);
  assert.match(html, /Contact/i);
  assert.match(html, /mailto:/, 'there must be a contact address');
  assert.match(html, /Security disclosure/i, 'a security contact is expected by both app stores');
});

test('no placeholder survived into the published files', () => {
  const files = ['about.html', 'privacy.html', 'terms.html', 'index.html',
                 'robots.txt', 'sitemap.xml'];
  for (const f of files) {
    assert.ok(!read(f).includes('REPLACE-WITH-YOUR-'),
      `${f} still contains an unfilled placeholder`);
  }
});

test('the contact address is real and used consistently', () => {
  const email = 'kofiappiahkss@gmail.com';
  for (const f of ['about.html', 'privacy.html', 'terms.html']) {
    assert.ok(read(f).includes(`mailto:${email}`), `${f} has no working contact link`);
  }
});

test('every absolute link points at the published site, with the right case', () => {
  const SITE = 'https://kofiappiahkss1.github.io/Curio';
  for (const f of ['index.html', 'sitemap.xml', 'robots.txt']) {
    const urls = [...read(f).matchAll(/https:\/\/kofiappiahkss1\.github\.io[^"<\s)]*/g)].map((m) => m[0]);
    assert.ok(urls.length, `${f} has no absolute site link`);
    for (const u of urls) {
      assert.ok(u.startsWith(SITE),
        `${f} points at ${u} — the path is case-sensitive and must match the repository exactly`);
    }
  }
});

test('the social preview and sitemap resolve to real files', () => {
  assert.ok(read('index.html').includes('/Curio/og-image.png'));
  assert.ok(existsSync(join(root, 'og-image.png')), 'og-image.png must exist to be served');
  assert.ok(existsSync(join(root, 'sitemap.xml')));
});

test('the Android package targets the host and the sub-path correctly', () => {
  const twa = JSON.parse(read('store/twa-manifest.json'));
  assert.equal(twa.host, 'kofiappiahkss1.github.io', 'the host must be bare, with no path');
  assert.equal(twa.startUrl, '/Curio/app.html', 'the start URL carries the repository path');
  assert.match(twa.fullScopeUrl, /\/Curio\/$/);
  // the signing fingerprint only exists after a build, so it is expected to remain
  assert.match(read('store/assetlinks.template.json'), /REPLACE-WITH-YOUR-SIGNING-CERT/);
});

test('the pages load no resource from another origin', () => {
  // A *link* to GitHub is fine — a person chose to click it. A *resource*
  // loaded from elsewhere is not: it would tell a third party that someone
  // read the privacy page. Only the second is a leak, so only it is checked.
  for (const p of ['about.html', 'privacy.html', 'terms.html', 'index.html', 'app.html']) {
    const html = read(p);
    const resources = [
      ...html.matchAll(/<(?:script|img|iframe|source|video|audio)[^>]+src="([^"]+)"/gi),
      ...html.matchAll(/<link[^>]+href="([^"]+)"/gi),
    ].map((m) => m[1]);

    const offsite = resources.filter((u) => /^https?:\/\//i.test(u)
      && !u.startsWith('https://kofiappiahkss1.github.io/'));
    assert.deepEqual(offsite, [], `${p} loads from another origin: ${offsite.join(', ')}`);
  }
});

test('outbound links open safely', () => {
  for (const p of ['about.html', 'privacy.html', 'terms.html']) {
    const html = read(p);
    for (const m of html.matchAll(/<a[^>]+href="https?:\/\/[^"]+"[^>]*>/gi)) {
      const tag = m[0];
      if (tag.includes('target="_blank"')) {
        assert.match(tag, /rel="[^"]*noopener/, `${p} opens a new tab without noopener`);
      }
    }
  }
});
