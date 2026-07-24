/**
 * Curio — knowing what to ask.
 *
 * A diary that says nothing feels like a form. This decides what Curio should
 * say when you open it, using only what it already knows: the hour, what you
 * have kept today, how long the streak has run, where you keep going back to,
 * whose birthday it is, whether a holiday has landed.
 *
 * No model, no network, no guessing at your mood. Just a small amount of
 * attention, which is what makes something feel present rather than foreign.
 *
 * Every prompt is a question you could answer in two taps. Nothing here nags,
 * nothing counts calories at you, and nothing appears twice in a day.
 */

import { seedFrom } from './core.js';

/* Prompts are keyed so translations can override them; the English is the
 * fallback and is written to be warm rather than chirpy. */
export const PROMPTS = {
  // --- first thing, nothing kept yet ---
  wake: [
    'Morning. What is the first thing you want to remember about today?',
    'You are up. Anything worth keeping already?',
    'A new day. What would you like to have written down about it later?',
  ],
  wakeStreak: [
    'Morning — {n} days running. What starts today off?',
    '{n} days in a row. Keep it going?',
  ],
  // --- middle of the day ---
  middayEmpty: [
    'Half the day gone. What has happened so far?',
    'Nothing kept yet today. One thing?',
    'Something must have happened by now.',
  ],
  middaySome: [
    'The day is still going. Anything else?',
    'What else has today held?',
  ],
  // --- evening ---
  eveningEmpty: [
    'The day is nearly done. One thing worth keeping?',
    'Before this one goes: what happened?',
    'Quick — what was today?',
  ],
  eveningSome: [
    'How was the rest of it?',
    'Anything to add before the day closes?',
    'One more, while you remember it.',
  ],
  late: [
    'Still up. Anything from today you should keep?',
    'Late one. Worth writing something down?',
  ],
  // --- streaks ---
  streakRisk: [
    '{n} days so far. Today is still blank.',
    'Your streak is at {n}. One thing keeps it alive.',
  ],
  streakLong: [
    '{n} days. That is a habit now.',
    '{n} days running. Quietly impressive.',
  ],
  // --- built from what the archive already knows ---
  placeReturn: [
    'Back at {x}?',
    '{x} again — worth keeping?',
  ],
  personSoon: [
    'Seeing {x} today?',
    '{x} has come up a lot lately.',
  ],
  mealHabit: [
    '{x} again, or something different today?',
  ],
  // --- occasions ---
  birthdayOwn: [
    'It is your birthday. Worth keeping something.',
    'Happy birthday. Today is one to write down.',
  ],
  birthdayOther: [
    'It is {x}\u2019s birthday. Did you see them?',
  ],
  holiday: [
    'It is {x}. How are you spending it?',
    '{x} today. Anything to keep?',
  ],
  // --- the quiet ones ---
  firstEver: [
    'Nothing kept yet. A photo, a meal, where you are \u2014 anything starts it.',
    'This is day one. Keep one small thing.',
  ],
  returning: [
    'It has been {n} days. Welcome back.',
    'You have been away {n} days. Pick it up wherever.',
  ],
  quiet: [
    'Nothing needs keeping today. That is a fine day too.',
    'Some days are not for writing down.',
  ],
};

/** Weighting: the higher the number, the more it wants to be shown. */
const WEIGHT = {
  firstEver: 100, birthdayOwn: 95, returning: 90, birthdayOther: 80,
  holiday: 70, streakRisk: 65, placeReturn: 55, personSoon: 50,
  mealHabit: 45, wakeStreak: 40, wake: 35, streakLong: 30,
  eveningEmpty: 34, middayEmpty: 32, eveningSome: 20, middaySome: 18,
  late: 25, quiet: 5,
};

const partOfDay = (h) =>
  h < 5 ? 'night' : h < 11 ? 'morning' : h < 16 ? 'midday' : h < 22 ? 'evening' : 'late';

/**
 * Decide what Curio should say right now.
 *
 * @param ctx.now          the time
 * @param ctx.keptToday    how many moments today
 * @param ctx.streak       consecutive days
 * @param ctx.total        moments in the whole archive
 * @param ctx.daysAway     days since the last entry, if any
 * @param ctx.topPlace     the place returned to most
 * @param ctx.topPerson    the person seen most
 * @param ctx.topMeal      the meal eaten most
 * @param ctx.birthdayOwn  is it their birthday
 * @param ctx.birthdayName someone else's birthday today
 * @param ctx.holiday      the name of a holiday today
 * @param ctx.seen         keys already shown today, so nothing repeats
 * @returns {{key, text, kind, action}|null}
 */
export function choose(ctx = {}) {
  const now = ctx.now || new Date();
  const hour = now.getHours();
  const pod = partOfDay(hour);
  const kept = ctx.keptToday || 0;
  const seen = new Set(ctx.seen || []);
  const candidates = [];

  const offer = (key, vars = {}, action = 'capture') => {
    if (seen.has(key) || !PROMPTS[key]) return;
    candidates.push({ key, vars, action, weight: WEIGHT[key] ?? 10 });
  };

  // the very beginning, and coming back after a while
  if ((ctx.total || 0) === 0) offer('firstEver');
  else if ((ctx.daysAway || 0) >= 3) offer('returning', { n: ctx.daysAway });

  // occasions outrank routine
  if (ctx.birthdayOwn) offer('birthdayOwn');
  if (ctx.birthdayName) offer('birthdayOther', { x: ctx.birthdayName });
  if (ctx.holiday) offer('holiday', { x: ctx.holiday });

  // the streak, but only while it is actually at risk
  if (!kept && (ctx.streak || 0) >= 2) offer('streakRisk', { n: ctx.streak });
  if (kept && (ctx.streak || 0) >= 7) offer('streakLong', { n: ctx.streak });

  // things the archive has noticed
  if (!kept) {
    if (ctx.topPlace) offer('placeReturn', { x: ctx.topPlace });
    if (ctx.topPerson) offer('personSoon', { x: ctx.topPerson });
    if (ctx.topMeal && pod !== 'morning') offer('mealHabit', { x: ctx.topMeal });
  }

  // Once someone has written a few things, stop asking. Being nagged after you
  // have already done the thing is how an app starts to feel like a chore.
  const enough = kept >= 3;

  // otherwise, something suited to the hour
  if (!enough && pod === 'morning') {
    if (!kept && (ctx.streak || 0) >= 2) offer('wakeStreak', { n: ctx.streak });
    if (!kept) offer('wake');
  } else if (!enough && pod === 'midday') {
    offer(kept ? 'middaySome' : 'middayEmpty');
  } else if (!enough && pod === 'evening') {
    offer(kept ? 'eveningSome' : 'eveningEmpty');
  } else if (!enough && (pod === 'late' || pod === 'night')) {
    if (!kept) offer('late');
  }

  if (!candidates.length) {
    if (enough) return null;                 // they have written plenty; leave them be
    offer('quiet');
  }
  if (!candidates.length) return null;

  candidates.sort((a, b) => b.weight - a.weight);
  const best = candidates[0];

  // pick a phrasing that stays put all day rather than flickering
  const pool = PROMPTS[best.key];
  const seed = seedFrom(`${best.key}|${now.toDateString()}`);
  const text = pool[Math.abs(seed | 0) % pool.length];

  return { key: best.key, text, vars: best.vars, action: best.action, weight: best.weight };
}

/**
 * Substitute {x} and {n}, then make sure the sentence starts like a sentence —
 * place names are stored as people say them, so "the harbour" can land first.
 */
export function fillPrompt(text, vars = {}) {
  const out = String(text || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/* ------------------------------------------------------------------ *
 * noticing the day turning over
 * ------------------------------------------------------------------ *
 * A web app cannot set an alarm or wake with the phone. What it can do is
 * notice that this is the first time it has been opened today, which is a
 * decent proxy for "you are up and about" — and it costs nothing.
 */

/** Is this the first opening of a new day? */
export function isFirstOpenToday(lastOpenedISO, now = new Date()) {
  if (!lastOpenedISO) return true;
  const last = new Date(lastOpenedISO);
  if (Number.isNaN(last.getTime())) return true;
  return last.getFullYear() !== now.getFullYear()
    || last.getMonth() !== now.getMonth()
    || last.getDate() !== now.getDate();
}

/** Whole days since the app was last opened. */
export function daysSince(lastOpenedISO, now = new Date()) {
  if (!lastOpenedISO) return 0;
  const last = new Date(lastOpenedISO);
  if (Number.isNaN(last.getTime())) return 0;
  const a = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * When someone tends to open the app — used to time the daily reminder for a
 * moment they are likely to be free, rather than a number we picked.
 */
export function usualHour(openings = []) {
  if (openings.length < 4) return null;
  const counts = new Map();
  for (const iso of openings) {
    const h = new Date(iso).getHours();
    if (Number.isNaN(h)) continue;
    counts.set(h, (counts.get(h) || 0) + 1);
  }
  if (!counts.size) return null;
  const [hour] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return hour;
}
