# Curio

**A diary that writes itself — and answers only to you.**

A private museum of your ordinary days. Installs on any phone or laptop straight
from the web. No account, no API key, no server. Works fully offline, survives a
lost phone, and speaks fourteen languages.

**120 tests · 0 failures**

---

## What makes it different

Every other journal hands you a blank page. Curio writes the entry.

> *At the turn of the day, the harbour held you longer than you planned.*
> *After dark, ramen, and it did the job. You have had this 3 times.*
> *Your day has a hinge — more of your kept moments happen around 19:00
> than any other hour. You never decided that.*

And it is the only one with **no server to breach, no account to close, and no
company that can be acquired out from under your memories.**

## Everything it does

**Keeping** — a real in-app camera, or a photo you already have. Places, meals,
people, notes, and anything you share or paste in. One-tap mood.

**Writing** — each moment becomes a museum placard with a title and a line of
prose, composed on the device, in your language, offline, with no API key.

**Noticing** — patterns you'd never see: which places travel with your better
days, what you keep going back to, the hour your day hinges on.

**Remembering** — *on this day* a year later, echoes from a week or month ago,
streaks, statistics, and your whole year as a single grid.

**Protecting** — four sealed subjects (banking, health, messages, passwords) are
refused before they are ever written, in any supported language. Optional PIN
lock. Nothing is ever uploaded, because there is no code that could.

**Surviving** — a **Recovery Kit** is your entire archive sealed with a
passphrase only you know: PBKDF2-SHA256 (310,000 iterations) into AES-256-GCM.
Keep it in your own cloud. New phone or laptop: restore in seconds. Restoring
merges rather than overwrites, so two devices fold into one archive.

**Sharing** — any placard renders into a card worth showing, drawn on your
device and handed to the share sheet. Never uploaded.

**Speaking** — record up to three minutes per moment, stored on the device like
everything else. Dictation to text is offered separately and asked for
explicitly, because on most browsers it sends your voice to the browser maker —
Curio will not break its own promise quietly to save you some typing.

**Syncing** — no Curio server means no Curio sync service. Instead, point two
devices at the same folder your own cloud already keeps in step. Curio reads it
on open and writes back when you keep something; the newer edit wins. Chrome and
Edge on Android and desktop; iPhone uses Recovery Kits by hand.

**Today in history** — a bundled almanac of 733 events across all 366 days,
working with the radio off. Optionally enriched from Wikipedia when you happen
to be online, sending only the date.

**Weighing itself** — words cost almost nothing; photos and voice are the only
things that grow. The Vault shows exactly where the weight sits, how fast the
archive is growing, and how many years the device can carry it. Two reclaim
actions shrink photos (**−85%** measured) or drop recordings older than six
months — and **every written word, mood and date survives both**. Quality tiers
apply to new moments so the problem never builds up in the first place.

## Languages

English (UK) · English (US) · **Naija Pidgin** · Español (España) ·
**Español (Latinoamérica)** · Português (Brasil) · Français · Deutsch ·
**العربية** (right-to-left) · Kiswahili · isiZulu · हिन्दी · 简体中文 · 日本語

Placards are composed natively in each language, not machine-translated.
Dialects inherit from their parent language. Changing language never rewrites
your past — each entry keeps the language it was written in.

## Getting it in front of people

`store/` contains everything for all three routes:

| Route | Cost | What's ready |
|---|---|---|
| **Web** | free | SEO, JSON-LD rich results, FAQ schema, sitemap, robots, social preview card |
| **Google Play** | $25 once | `twa-manifest.json`, Digital Asset Links template, feature graphic |
| **App Store** | $99/yr + a Mac | SwiftUI shell in `store/ios/`, review notes, permission strings |

**Widgets and a watch app** need native code — no web app can draw them. The
data layer and bridge are built and tested here; `store/ios/CurioWidget.swift`,
`store/ios/CurioWatch.swift` and `store/android/CurioWidget.kt` are the native
halves, documented in `store/WIDGETS.md`.

**Eighteen store screenshots are already rendered** — six screens at App Store
6.7", 6.1" and Play phone sizes, drawn from the app's own palette so the listing
and the product look like one thing. Regenerate with `python3 make_screenshots.py`.

`store/LISTING.md` has the finished listing copy, ASO keywords, privacy answers
and a screenshot plan. `store/SUBMISSION.md` is the step-by-step.

Before publishing, replace every `REPLACE-WITH-YOUR-DOMAIN` in `index.html`,
`robots.txt` and `sitemap.xml`.

## Run it

```powershell
python -m http.server 8099     # open http://localhost:8099
npm install && npm test        # 83 tests
```

To put it on a phone: upload to a public GitHub repo, enable
**Settings → Pages → main → / (root)**, open the link on your phone, then
*Add to Home Screen* (iPhone) or *Install app* (Android).

## Inside

```
index.html   landing page + structured data
app.html     app shell — mobile and desktop layouts
app.js       UI, capture, camera, recovery, sharing, reminders, shortcuts
core.js      GUARD (vault) · COMPOSE (placards) · WEAVE (patterns)
             + mood, on-this-day, streaks, year grid, statistics
crypto.js    PBKDF2 + AES-GCM — the Recovery Kit cipher
voice.js     recording (private) and dictation (opt-in, honest about it)
storage.js   measuring, projecting and reclaiming space
history.js   the bundled almanac + widget snapshot
backup.js    kits, auto-backup to a folder, restore & merge, exports
share.js     renders placards to shareable images, on-device
i18n.js      14 languages — interface and prose
store.js     IndexedDB
sw.js        service worker
store/       app store packaging and listing copy
tests/       83 tests
```

## Honest limits

- **No app can silently watch your screen on a phone.** iOS forbids it; Android
  demands a visible notification and fresh consent each session. Curio keeps
  only what you deliberately give it.
- **The daily reminder only fires while Curio is open.** Scheduled push needs a
  server. The backup warnings, which matter more, work on every launch.
- **Automatic folder backup and sync need Chrome or Edge.** On iPhone, saving a
  kit is one tap and Curio nudges you when you're overdue.
- **Dictation is not private on most browsers.** Recording audio always is.
  Curio asks before doing the one that isn't, and your keyboard's own microphone
  key is usually the on-device alternative.
- **Widgets and watch apps require the native builds.** The scaffolds are here;
  Xcode and Android Studio are not.
- **The prose is a generative grammar, not a neural model** — deterministic, so
  your diary never rewrites itself, and free of any API key.
- **Your passphrase cannot be reset by anyone, including me.** That is what
  makes the kit safe. Curio shows a fingerprint code to write down beside it.
