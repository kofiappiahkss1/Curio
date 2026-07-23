# Publishing Curio

## The complete file list

Every one of these must be in your repository, at the **top level** (not inside
a folder). If even one is missing the app will fail in a way that looks like
nothing changed.

```
app.html
app.js
backup.js
book.js
core.js
crypto.js
device.js
history.js
holidays.js
i18n.js
icons/favicon-32.png
icons/icon-1024.png
icons/icon-180.png
icons/icon-192.png
icons/icon-512.png
icons/icon-maskable-512.png
index.html
locks.js
manifest.webmanifest
meeting.js
og-image.png
profile.js
robots.txt
search.js
share.js
sitemap.xml
storage.js
store.js
sw.js
themes.js
voice.js
```

That is **32 files** — 19 JavaScript modules, 7 icons, and the rest.

## Why your changes were not appearing

The old service worker served the app **cache-first**, including its own code.
That is the right strategy for icons and the wrong one for JavaScript: the
phone kept serving the copy it already had while the new one sat on the server.
Its install step also read from the browser's ordinary HTTP cache, so even a
fresh worker could install files that were already stale.

That is fixed. App code is now **network-first** — today's version when you are
online, the last good one when you are not — and the install goes past the HTTP
cache to the server.

## Breaking out of the old one, once

The new worker cannot install itself while the old one is in charge, so this
first update needs a nudge. Any of these work:

**On a computer** — open the site, press F12, go to **Application → Service
Workers**, click **Unregister**, then reload. Or **Application → Storage →
Clear site data**.

**On a phone** — remove the app from your home screen, close every tab showing
it, then open the link fresh and add it again.

**Simplest of all** — visit `https://your-site/app.html?fresh=1`. The query
string dodges the cached entry.

After this once, updates arrive on their own. Curio will show a **“A new
version is ready”** bar whenever you publish, and there is a **Check for
updates** button at the foot of the Vault.

## How to know it worked

Open **Vault** and scroll to the bottom. There is a version stamp. If it does
not change after you publish, the old copy is still cached — use *Check for
updates*, or clear site data as above.

## Publishing an update, from now on

1. Upload the changed files to the repository.
2. Wait a minute for the host to pick them up.
3. Open the app. Within a few seconds it offers you the new version.
