# Curio — store listing

Everything needed for App Store Connect and Google Play Console. Written to be
pasted, not rewritten.

---

## Names & identity

| Field | Value |
|---|---|
| App name (Apple, 30 max) | `Curio: Diary That Writes Itself` |
| App name (Play, 30 max) | `Curio — Private Offline Diary` |
| Subtitle (Apple, 30 max) | `Private, offline, no account` |
| Bundle / package id | `app.curio.diary` |
| Primary category | Lifestyle |
| Secondary category | Health & Fitness (Apple) / Lifestyle (Play) |
| Content rating | 4+ / Everyone |
| Price | Free, no in-app purchases |

## Keywords (Apple, 100 characters, comma-separated, no spaces)

```
diary,journal,private,offline,memory,mood,photo,gratitude,notes,nocloud,encrypted,daily,log
```

*Chosen deliberately:* "offline", "private", "nocloud" and "encrypted" are the
terms where Curio actually wins. Competing on "journal" alone is a losing fight
against Day One and Apple Journal.

---

## Short description (Play, 80 characters)

```
A diary that writes itself. Works offline. No account, no server, no ads.
```

## Promotional text (Apple, 170 characters — editable without review)

```
New: Recovery Kits. Your whole diary, sealed with a passphrase only you know, so a lost phone never means a lost year. Restore on any phone or laptop in seconds.
```

---

## Full description

```
Photos catch the highlights. Everything else evaporates — the meal you keep
reordering, the walk you didn't think to remember, the article that changed
your mind. Gone by the weekend.

Curio keeps the texture, not just the peaks.

You keep small things: a photo, where you were, what you ate, who you were with,
something you read. Curio turns each one into a museum placard — a title and a
line of prose, written for you — and then finds the patterns you'd never notice
about your own life.

  "At the turn of the day, the harbour held you longer than you planned."
  "After dark, ramen, and it did the job. You have had this 3 times."
  "Your day has a hinge — more of your kept moments happen around 19:00
   than any other hour. You never decided that."


NOTHING LEAVES YOUR PHONE

Curio has no account, no server and no advertising. It cannot send your diary
anywhere, because it contains no code that could. That is a stronger promise
than a privacy policy.

Four subjects are sealed permanently — banking, health, messages and passwords.
If something you write looks like one of them, in any supported language, it is
refused before it is ever written down, and shown to you as withheld. Not
hidden. Never recorded.


IT SURVIVES A LOST PHONE

No server also means no safety net — so Curio gives you something better. A
Recovery Kit is your entire archive, sealed with a passphrase only you know.
Keep it in your own cloud, or email it to yourself. New phone, borrowed laptop,
years later: enter the passphrase and everything is back, exactly as it was.

Restoring merges rather than overwrites, so two devices fold into one archive.


WHAT IT DOES

• Writes your entries for you — no blank page to face
• A real camera inside the app, or pick a photo you already have
• One-tap mood, and it learns which places and people travel with your better days
• On this day — a year later, the day comes back to you unasked
• Streaks, statistics, and your whole year as a single grid
• Search everything, instantly, offline
• Share any placard as a beautiful card
• Export as a plain file or as readable text you could print
• Works with no internet at all, forever


FOURTEEN LANGUAGES, WRITTEN NOT TRANSLATED

The placards themselves are composed natively in each language — including
dialects with their own voice.

English (UK) · English (US) · Naija Pidgin · Español (España) ·
Español (Latinoamérica) · Português (Brasil) · Français · Deutsch · العربية ·
Kiswahili · isiZulu · हिन्दी · 简体中文 · 日本語

Changing language never rewrites your past. Each entry keeps the language it
was written in.


HONEST ABOUT LIMITS

Curio will not silently watch your screen. No app can, on any phone — and given
what a diary holds, that constraint is the right one. Curio keeps only what you
deliberately give it.

Free. No subscription. No advertising. Nothing collected.
```

---

## What's New (first release)

```
The first release.

• A diary that writes its own entries
• Recovery Kits — a lost phone no longer means a lost year
• One-tap mood, and the patterns it reveals
• On this day, streaks, and your year at a glance
• 14 languages, including Naija Pidgin, Kiswahili and isiZulu
• Works completely offline
```

---

## Privacy answers

Both stores ask the same thing in different words. The answers are unusually short.

| Question | Answer |
|---|---|
| Data collected and linked to the user | **None** |
| Data collected and not linked | **None** |
| Tracking | **No** |
| Third-party analytics / advertising SDKs | **None** |
| Data shared with third parties | **None** |
| Account required | **No** |
| Data deletion method | Erase everything, in-app, one tap |
| Encryption in transit | Not applicable — no data is transmitted |
| Encryption at rest (Recovery Kits) | AES-256-GCM, key derived by PBKDF2-SHA256 (310,000 iterations) |

**Play Data Safety:** tick *No data collected*, *No data shared*, and
*Data is encrypted* for the Recovery Kit path.

**Permissions and why:**
- Camera — only when the person taps to take a picture
- Photos — only to pick an existing image
- Location (optional) — only to hint where a moment happened
- Notifications (optional) — only for a daily reminder they enable themselves

---

## Screenshots

Six, in this order. The first two decide the install.

1. **Today with a placard** — the whole product in one image. Overlay:
   *"It writes the entry for you."*
2. **On this day** — overlay: *"A year later, the day comes back."*
3. **The Recovery Kit screen** — overlay: *"Lose the phone. Keep the diary."*
4. **The Vault, sealed subjects visible** — overlay: *"Four things it will never record."*
5. **Threads / mood correlation** — overlay: *"Patterns you'd never notice."*
6. **The language list** — overlay: *"Written in your language, not translated."*

**All eighteen are already rendered** in `store/screenshots/` at the three
required sizes — regenerate with `python3 make_screenshots.py`. The 1024×500
Play feature graphic is in this folder.

---

## The positioning, in one line

> Day One is a beautiful archive you have to fill. Apple Journal suggests
> moments and hands you a blank page. Curio writes the entry — and is the only
> one of the three with no server to breach, no account to close, and no company
> that can be acquired out from under your memories.
