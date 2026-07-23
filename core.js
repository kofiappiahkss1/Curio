/**
 * Curio — the memory engine.
 *
 * Pure, dependency-free, and offline by construction. Runs identically inside the
 * phone and inside the node test harness. There is no network call anywhere in
 * this file, by design: the app must work with the radio off.
 *
 *   GUARD    — the vault. Sealed subjects are refused before anything is stored.
 *   COMPOSE  — turn a captured moment into a museum placard (title + prose).
 *   WEAVE    — find patterns across the archive.
 *
 * The composer is a real generative grammar, not a stub: it varies on time of
 * day, kind of moment, and how often you've done this before, and it is
 * deterministic (the same moment always yields the same placard, so your diary
 * doesn't rewrite itself on reload).
 */

import { getLocale, plural, fill } from './i18n.js';

export const SEALED = ['banking', 'health', 'messages', 'passwords'];

export const SOURCE_KEYS = ['photo', 'voice', 'place', 'read', 'note', 'meal', 'person'];
/** Localised source list for the vault + capture sheet. */
export const sources = (L) =>
  SOURCE_KEYS.map((key) => ({ key, label: L.ui.kinds[key].label, detail: L.ui.kinds[key].detail }));

/* ------------------------------------------------------------------ *
 * deterministic pseudo-randomness — same moment, same words, always
 * ------------------------------------------------------------------ */
export function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
// Math.abs guards against signed-shift overflow producing a negative index.
const pick = (arr, seed) => arr[Math.abs(seed | 0) % arr.length];

/* ------------------------------------------------------------------ *
 * GUARD
 * ------------------------------------------------------------------ */
export function isSealed(subject) {
  return !!subject && SEALED.includes(String(subject).toLowerCase());
}

export function sourceEnabled(vault, kind) {
  if (!vault) return true;
  const row = vault.find((v) => v.key === kind);
  return row ? row.enabled !== false : true;
}

/**
 * The single door. Returns {accepted, reason?, moment?}.
 * Refusal happens BEFORE storage — nothing sensitive is written then redacted.
 */
export function guard(signal, vault) {
  if (isSealed(signal.subject)) {
    return { accepted: false, sealed: true,
             reason: `“${signal.subject}” is off-limits — nothing was kept.` };
  }
  if (!sourceEnabled(vault, signal.kind)) {
    return { accepted: false, reason: `${signal.kind} capture is switched off in your vault.` };
  }
  return { accepted: true };
}

/* ------------------------------------------------------------------ *
 * COMPOSE
 * ------------------------------------------------------------------ */
/** Keys must match the `openers` keys in every locale pack. */
export function partOfDay(h) {
  if (h < 5)  return 'night';
  if (h < 9)  return 'early';
  if (h < 12) return 'morning';
  if (h < 14) return 'midday';
  if (h < 18) return 'afternoon';
  if (h < 22) return 'evening';
  return 'late';
}

const OPENERS = {
  early:            ['Before the day started,', 'First thing,', 'Early on,'],
  'the morning':    ['In the morning,', 'Mid-morning,', 'Before noon,'],
  midday:           ['Around midday,', 'At the turn of the day,', 'Middle of the day,'],
  'the afternoon':  ['In the afternoon,', 'Later on,', 'Through the afternoon,'],
  'the evening':    ['In the evening,', 'After dark,', 'Evening,'],
  late:             ['Late on,', 'At the end of it,', 'Before bed,'],
  'the small hours':['In the small hours,', 'Very late,', 'While it was still dark,'],
};

const TITLES = {
  photo:  ['Something worth framing', 'A picture kept', 'You stopped to look'],
  place:  ['Time at {x}', '{x}, again', 'An hour at {x}'],
  read:   ['Something read about {x}', 'On {x}', '{x}, quietly'],
  note:   ['A note to yourself', 'Written down', 'Worth remembering'],
  meal:   ['{x}', 'The {x}', 'Eating {x}'],
  person: ['Time with {x}', '{x} again', 'An evening with {x}'],
};

const BODIES = {
  photo:  ['{o} you framed something and kept it.',
           '{o} something was worth stopping for.',
           '{o} you pointed the camera at it rather than let it pass.'],
  place:  ['{o} you spent part of the day at {x}.',
           '{o} you were at {x} for a while.',
           '{o} {x} held you longer than you planned.'],
  read:   ['{o} you read about {x} and this is the part that stayed.',
           '{o} {x} caught you, and Curio kept the gist rather than the screen.',
           '{o} you went down a small path about {x}.'],
  note:   ['{o} you wrote: “{x}”.',
           '{o} you left yourself this: “{x}”.',
           '{o} worth writing down — “{x}”.'],
  meal:   ['{o} you ate {x}.',
           '{o} {x}, and it did the job.',
           '{o} there was {x}.'],
  person: ['{o} you were with {x}.',
           '{o} time passed easily with {x}.',
           '{o} {x} was there for it.'],
};

/** Warmer lines when the archive shows you've done this before. */
const RETURNING = {
  place:  'The {n}th time here — it has become one of yours.',
  person: '{n} moments together now. A tradition nobody declared.',
  meal:   'You have had this {n} times. You are loyal to it.',
  read:   '{n} things about {x} now. It keeps pulling you back.',
};

/**
 * Compose one moment into a placard.
 * @param signal {kind, at (ISO), label, text, subject}
 * @param history [] previously kept moments — used for "returning" prose
 */
export function compose(signal, history = [], locale = 'en-GB') {
  const L = typeof locale === 'string' ? getLocale(locale) : locale;
  const P = L.prose;
  const at = signal.at ? new Date(signal.at) : new Date();
  const kind = signal.kind;
  const subject = (signal.label || signal.text || '').trim();
  const short = subject.length > 60 ? subject.slice(0, 57).trimEnd() + '…' : subject;

  const seed = seedFrom(`${kind}|${subject}|${at.toISOString().slice(0, 16)}`);
  const pod = partOfDay(at.getHours());
  const opener = pick(P.openers[pod] || P.openers.morning, seed);

  const fallback = short || '…';
  let title = fill(pick(P.titles[kind] || P.titles.note, seed >>> 3), { x: fallback });
  let body = fill(pick(P.bodies[kind] || P.bodies.note, seed >>> 5), { o: opener, x: fallback });

  // does the archive know this already?
  const seenBefore = history.filter(
    (m) => m.kind === kind && (m.label || '').toLowerCase() === subject.toLowerCase() && subject
  ).length;
  if (seenBefore >= 2 && P.returning[kind]) {
    body += ' ' + fill(P.returning[kind], { n: seenBefore + 1, x: short });
  }

  const provenance = (L.ui.perm && L.ui.kinds[kind]?.detail) || 'Captured on this phone';

  return {
    id: signal.id || `${at.getTime()}-${seed % 9973}`,
    accession: accessionFor(at, history.length),
    kind,
    at: at.toISOString(),
    day: dayKey(at),
    label: subject || null,
    title,
    placard: body,
    provenance: `${provenance} · ${at.toLocaleTimeString(L.code || [], { hour: '2-digit', minute: '2-digit' })}`,
    photo: signal.photo || null,   // data URL, stored locally only
    kept: true,
  };
}

export const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export function accessionFor(at, count) {
  return `${new Date(at).getFullYear()}.${200 + count + 1}`;
}

/** Renumber the archive so accession codes are unique and in order. */
export function renumber(moments) {
  return [...moments]
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .map((m, i) => ({ ...m, accession: accessionFor(m.at, i) }));
}

/* ------------------------------------------------------------------ *
 * DAY EXHIBIT
 * ------------------------------------------------------------------ */
export function composeDay(dayISO, moments, withheld = 0, locale = 'en-GB') {
  const L = typeof locale === 'string' ? getLocale(locale) : locale;
  const P = L.prose;
  const kept = moments.filter((m) => m.kept !== false);
  const seed = seedFrom(dayISO);
  let title = pick(P.dayTitles, seed);

  const places = kept.filter((m) => m.kind === 'place' && m.label);
  const people = kept.filter((m) => m.kind === 'person' && m.label);
  if (places.length) title = fill(P.dayAround, { x: places[0].label });
  else if (people.length) title = fill(P.dayWith, { x: people[0].label });
  else if (kept.length === 0) title = P.nothingKept;

  const bits = [];
  if (kept.length) bits.push(plural(kept.length, P.momentsKept));
  if (withheld) bits.push(fill(P.withheldShort, { n: withheld }));

  return {
    day: dayISO,
    title,
    subtitle: bits.join(' · ') || P.dayOpen,
    place: places[0]?.label || null,
    withheld,
    featuredId: kept[0]?.id || null,
  };
}

/* ------------------------------------------------------------------ *
 * WEAVE — patterns across the archive
 * ------------------------------------------------------------------ */
function tally(moments, kind) {
  const c = new Map();
  moments.filter((m) => m.kind === kind && m.label)
    .forEach((m) => c.set(m.label, (c.get(m.label) || 0) + 1));
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
}

export function weave(moments, locale = 'en-GB') {
  const L = typeof locale === 'string' ? getLocale(locale) : locale;
  const T = L.prose.threads;
  const kept = moments.filter((m) => m.kept !== false);
  const out = [];

  const places = tally(kept, 'place');
  if (places.length >= 2) {
    out.push({ kind: 'place', label: T.placeLabel, count: String(places.length),
      title: T.placeTitle,
      body: fill(T.placeBody, { n: places.length, x: places[0][0] }) });
  }
  const people = tally(kept, 'person');
  if (people.length) {
    const [who, n] = people[0];
    out.push({ kind: 'person', label: T.personLabel, count: String(n),
      title: fill(T.personTitle, { x: who }),
      body: fill(T.personBody, { n, x: who }) });
  }
  const reads = tally(kept, 'read');
  if (reads.length) {
    const [topic, n] = reads[0];
    const total = kept.filter((m) => m.kind === 'read').length;
    out.push({ kind: 'read', label: T.readLabel, count: String(total),
      title: T.readTitle,
      body: fill(T.readBody, { n: total, x: topic, m: plural(n, T.time) }) });
  }
  const meals = tally(kept, 'meal');
  if (meals.length) {
    const [dish, n] = meals[0];
    out.push({ kind: 'meal', label: T.mealLabel, count: String(n),
      title: fill(T.mealTitle, { x: dish }),
      body: fill(T.mealBody, { n: plural(n, T.time), x: dish }) });
  }

  const hours = kept.map((m) => new Date(m.at).getHours());
  if (hours.length >= 4) {
    const c = new Map();
    hours.forEach((h) => c.set(h, (c.get(h) || 0) + 1));
    const [hr, n] = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
    if (n >= 2) {
      out.push({ kind: 'habit', label: T.habitLabel, count: `${hr}h`,
        title: T.habitTitle, body: fill(T.habitBody, { x: hr }) });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * SEARCH — plain, local, no index server
 * ------------------------------------------------------------------ */
export function search(moments, q) {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  return moments.filter((m) => m.kept !== false && (
    (m.title || '').toLowerCase().includes(t) ||
    (m.placard || '').toLowerCase().includes(t) ||
    (m.label || '').toLowerCase().includes(t) ||
    (m.kind || '').toLowerCase().includes(t)
  ));
}

/* ------------------------------------------------------------------ *
 * EXPORT — the archive is yours, in plain JSON
 * ------------------------------------------------------------------ */
export function exportArchive(moments, vault) {
  return JSON.stringify(
    { product: 'Curio', exported: new Date().toISOString(), moments, vault }, null, 2);
}

/* ================================================================== *
 * MOOD — one tap, the single most-used journalling feature there is
 * ================================================================== */
export const MOODS = [1, 2, 3, 4, 5];

/** Average mood for a set of moments, or null if nobody logged one. */
export function moodAverage(moments) {
  const vals = moments.filter((m) => m.kept !== false && m.mood).map((m) => m.mood);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Which kinds of moment travel with your better days?
 * This is the pattern people actually come back for.
 */
export function moodCorrelations(moments) {
  const kept = moments.filter((m) => m.kept !== false);
  const days = new Map();
  for (const m of kept) {
    if (!days.has(m.day)) days.set(m.day, { moods: [], labels: new Set(), kinds: new Set() });
    const d = days.get(m.day);
    if (m.mood) d.moods.push(m.mood);
    if (m.label) d.labels.add(m.label.toLowerCase());
    d.kinds.add(m.kind);
  }
  const scored = [...days.values()].filter((d) => d.moods.length);
  if (scored.length < 4) return [];

  const overall = scored.reduce((a, d) => a + d.moods.reduce((x, y) => x + y, 0) / d.moods.length, 0) / scored.length;

  const tally = new Map();
  for (const d of scored) {
    const avg = d.moods.reduce((x, y) => x + y, 0) / d.moods.length;
    for (const label of d.labels) {
      if (!tally.has(label)) tally.set(label, { sum: 0, n: 0 });
      const t = tally.get(label);
      t.sum += avg; t.n++;
    }
  }
  return [...tally.entries()]
    .filter(([, t]) => t.n >= 2)
    .map(([label, t]) => ({ label, avg: t.sum / t.n, n: t.n, delta: t.sum / t.n - overall }))
    .sort((a, b) => b.delta - a.delta);
}

/* ================================================================== *
 * ON THIS DAY — resurfacing, the strongest retention feature there is
 * ================================================================== */
export function onThisDay(moments, today = new Date()) {
  const d = new Date(today);
  const mm = d.getMonth(), dd = d.getDate(), yy = d.getFullYear();
  return moments
    .filter((m) => m.kept !== false)
    .filter((m) => {
      const t = new Date(m.at);
      return t.getMonth() === mm && t.getDate() === dd && t.getFullYear() < yy;
    })
    .map((m) => ({ ...m, yearsAgo: yy - new Date(m.at).getFullYear() }))
    .sort((a, b) => a.yearsAgo - b.yearsAgo);
}

/** Anything from a week / month / season back, for days with no anniversary. */
export function echoes(moments, today = new Date()) {
  const out = [];
  const targets = [
    { days: 7, label: 'lastWeek' },
    { days: 30, label: 'lastMonth' },
    { days: 90, label: 'lastSeason' },
  ];
  for (const t of targets) {
    const want = dayKey(new Date(new Date(today).getTime() - t.days * 86400000));
    const hit = moments.find((m) => m.kept !== false && m.day === want);
    if (hit) out.push({ ...hit, echo: t.label, daysAgo: t.days });
  }
  return out;
}

/* ================================================================== *
 * STREAKS — the habit loop
 * ================================================================== */
export function streaks(moments, today = new Date()) {
  const days = [...new Set(moments.filter((m) => m.kept !== false).map((m) => m.day))].sort();
  if (!days.length) return { current: 0, longest: 0, total: 0, keptToday: false };

  const set = new Set(days);
  const key = (d) => dayKey(d);
  const keptToday = set.has(key(today));

  let current = 0;
  const cursor = new Date(today);
  if (!keptToday) cursor.setDate(cursor.getDate() - 1);   // yesterday still counts as alive
  while (set.has(key(cursor))) { current++; cursor.setDate(cursor.getDate() - 1); }

  let longest = 0, run = 0, prev = null;
  for (const d of days) {
    if (prev && (new Date(d) - new Date(prev)) === 86400000) run++;
    else run = 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest, total: days.length, keptToday };
}

/* ================================================================== *
 * YEAR IN PIXELS — the whole year at a glance
 * ================================================================== */
export function yearGrid(moments, year = new Date().getFullYear()) {
  const byDay = new Map();
  for (const m of moments.filter((x) => x.kept !== false)) {
    if (!m.day.startsWith(String(year))) continue;
    if (!byDay.has(m.day)) byDay.set(m.day, { count: 0, moods: [] });
    const d = byDay.get(m.day);
    d.count++;
    if (m.mood) d.moods.push(m.mood);
  }
  const out = [];
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d);
    const hit = byDay.get(k);
    out.push({
      day: k,
      month: d.getMonth(),
      count: hit?.count || 0,
      mood: hit?.moods.length ? hit.moods.reduce((a, b) => a + b, 0) / hit.moods.length : null,
    });
  }
  return out;
}

/* ================================================================== *
 * STATS — the honest numbers about a life
 * ================================================================== */
export function stats(moments) {
  const kept = moments.filter((m) => m.kept !== false);
  const days = new Set(kept.map((m) => m.day));
  const kinds = {};
  for (const m of kept) kinds[m.kind] = (kinds[m.kind] || 0) + 1;
  const withPhoto = kept.filter((m) => m.photo).length;
  const first = kept.length ? [...kept].sort((a, b) => new Date(a.at) - new Date(b.at))[0] : null;
  return {
    moments: kept.length,
    days: days.size,
    kinds,
    withPhoto,
    since: first ? first.day : null,
    mood: moodAverage(kept),
  };
}
