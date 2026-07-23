# Getting Curio into the app stores

Three routes, cheapest first. You can do route 1 today for free; routes 2 and 3
cost money and need accounts only you can open.

---

## Route 1 — the web (free, today, no gatekeeper)

This is already done in the repo. Publish the folder and Curio is installable
worldwide within minutes.

1. Push the folder to a public GitHub repo.
2. **Settings → Pages → Deploy from a branch → `main` → `/ (root)`**.
3. Replace every `REPLACE-WITH-YOUR-DOMAIN` in `index.html`, `robots.txt` and
   `sitemap.xml` with your real address, then commit again.
4. Submit the sitemap in [Google Search Console](https://search.google.com/search-console)
   and [Bing Webmaster Tools](https://www.bing.com/webmasters).

The landing page already carries `SoftwareApplication` and `FAQPage` structured
data, so search engines can show it as a rich result. `og-image.png` renders the
preview card in every messaging app.

**Realistic expectation:** web search rewards specific phrases, not generic ones.
Curio can rank for "offline diary app no account", "private journal that works
without internet", "journal app Kiswahili". It will not out-rank Day One for
"journal app", and chasing that is wasted effort.

---

## Route 2 — Google Play (~$25 once, about a day of work)

Play accepts a PWA directly as a **Trusted Web Activity**. It is the same app,
signed and listed.

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://YOUR-DOMAIN/manifest.webmanifest
# or reuse the prepared config:
cp store/twa-manifest.json ./twa-manifest.json   # edit the domain first
bubblewrap build
```

That produces `app-release-bundle.aab` for upload.

**The one step people miss:** Digital Asset Links, which prove you own the site.
After `bubblewrap build`, take the SHA-256 fingerprint it prints, put it into
`store/assetlinks.template.json`, and publish the result at:

```
https://YOUR-DOMAIN/.well-known/assetlinks.json
```

Without that file the app opens with a browser address bar visible and looks
broken. With it, it opens clean and full-screen.

Then in Play Console: create the app, upload the bundle, paste from
`LISTING.md`, upload screenshots and `play-feature-graphic.png`, complete the
Data Safety form (every answer is "no data collected"), and submit.

---

## Route 3 — the App Store (~$99/yr, needs a Mac)

Apple does not accept PWAs, so `store/ios/` contains a real SwiftUI shell that
bundles the web assets and loads them from disk. Follow `store/ios/README.md`.

**Two things decide whether it passes review:**

1. **Guideline 4.2 (minimum functionality).** Apple rejects thin website
   wrappers. In the review notes, state what the shell adds: assets bundled for
   full offline use with no network calls, durable local storage not subject to
   Safari's eviction, camera capture, and share-sheet export. It is a local
   application, not a website in a box.
2. **Usage strings.** Missing `NSCameraUsageDescription`,
   `NSPhotoLibraryUsageDescription` or `NSLocationWhenInUseUsageDescription` is
   an automatic rejection. Wording is in the iOS README.

The privacy questionnaire is quick, because every answer is "no".

---

## What actually drives installs

Ranked by what works for a product like this:

1. **The share cards.** Every placard shared is a small, complete advertisement
   with the wordmark on it. This is the only channel that compounds. It is built
   into the app already.
2. **The languages.** Nobody is serving Naija Pidgin, Kiswahili or isiZulu
   journaling. Communities notice when a product speaks to them first.
3. **The privacy story.** "No server to breach, no company to be acquired" lands
   hard with people who lost work when Rewind was shut down after acquisition.
4. **Search, on specific phrases.** See route 1.
5. **Paid acquisition.** Last, and not worth it until 1–4 are working.
