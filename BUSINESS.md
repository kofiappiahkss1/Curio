# The Curio for Business

The personal diary is free for ever. This is the part organisations pay for.

## Why the same code is worth more to a business

The architecture that makes a private diary good makes a **field record**
better:

- **It works with no signal** — a basement, a site, a village, a mine.
- **There is no server**, so there is no data-residency question, no processor
  agreement, and no breach surface.
- **Nothing to procure.** No accounts, no seat management, no IT approval.

Day One charges $50–75 *per year* and holds your data. The Curio charges once
and never sees it.

## What the upgrade unlocks

| | Free | Business |
|---|---|---|
| The whole personal diary | ✅ | ✅ |
| Themes, search, recovery, languages | ✅ | ✅ |
| **Workspaces** — work kept apart from life | | ✅ |
| **Templates** — inspections, visits, incidents, deliveries, fieldwork | | ✅ |
| **Integrity seal** — proof nothing was altered afterwards | | ✅ |
| **Reports** — a deliverable, not a folder of notes | | ✅ |
| **Bulk export** — CSV into their own systems | | ✅ |

The integrity seal is the one that sells. Each record is hashed together with
the one before it: alter an entry, delete an entry, or reorder them, and the
chain stops adding up — and the app names the record that failed. That is what
turns a note into evidence.

## Selling it without a server

There is no licence server, because there is no server. Instead the licence
carries its own proof.

```
You hold a private key.          It never leaves your machine.
The app holds the public key.    It can verify, never sign.
Someone pays.                    You sign them a licence.
Their copy checks it offline.    Once, for ever, on a plane.
```

### Setting up, once

```bash
node tools/make-keys.mjs
```

Writes `curio-signing-key.json` and prints the public half. Paste that into
`licence.js`, replacing `PUBLIC_KEY_JWK`.

**Back the private key up.** Lose it and you cannot issue more licences that
match the ones already sold. Leak it and someone else can issue their own.

### After each sale

```bash
node tools/issue-licence.mjs "Adom Construction Ltd" ops@adom.example
node tools/issue-licence.mjs "Big Co" it@bigco.example --seats 25
node tools/issue-licence.mjs "Trial Ltd" t@trial.example --days 30
```

Email them the key. They paste it into **Settings → Business**. Done.

### On honesty

Someone determined can edit the JavaScript and skip the check. That is true of
every client-side licence ever written, including the ones with servers. This is
built for the people who will pay, not against the people who will not — and it
costs the honest ones nothing: no account, no activation, no phoning home.

## What to charge

| | Price | Why |
|---|---|---|
| Personal | Free, for ever | It is the marketing, and it costs nothing to run |
| Business, one person | **$19.99 once** | Under the threshold where anyone needs approval |
| Business, team | **$14.99 a seat**, five or more | Volume, still one payment |
| Trial | 30 days, free | `--days 30`, no card, no account |

**One-time, not monthly.** You have no servers to pay for, so a subscription
would be rent you cannot justify — and "pay once, keep for ever" is exactly the
argument against Day One. Whisper Notes proved the model works: *"we have no
server costs, so there is nothing to charge you monthly for."*

$19.99 is deliberately below the point where an employee has to ask permission.
A site manager expenses it. That is worth more than a higher price with a
purchasing process attached.

## Who to sell to first

Ranked by how badly they need the offline part:

1. **Construction and surveying** — site inspections, no signal, photographic evidence
2. **Agriculture and extension work** — rural, offline, repeat visits
3. **NGOs and field research** — data protection, low connectivity, donor reporting
4. **Home health and social work** — privacy-critical, visits, contemporaneous notes
5. **Journalism** — source protection, and no server to subpoena

Start with one. A construction firm in Accra with twenty site staff is a better
first customer than a hundred strangers on the internet, because they will tell
you what is missing.
