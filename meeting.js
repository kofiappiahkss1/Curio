/**
 * Curio — meetings.
 *
 * A conference or a meeting is the one place where a diary genuinely needs to
 * work harder: long, dense, and impossible to reconstruct afterwards from
 * memory. So Curio will record it, keep a running transcript where the browser
 * can produce one, let you mark moments as they happen, and afterwards pull out
 * what was decided and what someone agreed to do.
 *
 * TWO THINGS THIS MODULE TAKES SERIOUSLY
 *
 *   1. Consent. Recording a meeting records other people. In much of the world
 *      that requires everyone's agreement, not just yours. Curio asks you to
 *      confirm the room knows, every time, and writes that confirmation into
 *      the record. It is not a checkbox we remember for you.
 *
 *   2. Losing an hour. A ninety-minute recording that vanishes because a phone
 *      slept is worse than no recording. The session saves itself continuously,
 *      and an interrupted meeting can be recovered on the next launch.
 */

import { Recorder, canDictate, Dictation } from './voice.js';

export const MAX_MEETING_SECONDS = 4 * 60 * 60;      // four hours is a long conference session
export const AUTOSAVE_EVERY_MS = 20000;

/* ------------------------------------------------------------------ *
 * reading a transcript
 * ------------------------------------------------------------------ */

/** Split into sentences without tripping over abbreviations and decimals. */
export function sentences(text) {
  if (!text) return [];
  return String(text)
    .replace(/([.!?])\s+(?=[A-Z"'\u201c])/g, '$1\u0000')
    .split(/\u0000|\n+/)
    .map((s) => s.trim())
    // three words is a sentence; anything less is a fragment or a stray label
    .filter((s) => s.length > 8 && (s.match(/\S+/g) || []).length >= 3);
}

const ACTION_CUES = [
  /\bi(?:'| a)?ll\b/i, /\bwe(?:'| wi)?ll\b/i, /\bwe need to\b/i, /\bwe should\b/i,
  /\baction item\b/i, /\btodo\b/i, /\bto-do\b/i, /\bfollow up\b/i, /\bfollow-up\b/i,
  /\btake (?:this |that )?on\b/i, /\bwill (?:send|share|draft|prepare|check|confirm|email|call)\b/i,
  /\bby (?:monday|tuesday|wednesday|thursday|friday|next week|end of (?:day|week|month))\b/i,
  /\bassigned? to\b/i, /\bowner\b/i, /\bdeadline\b/i,
];

const DECISION_CUES = [
  /\bwe (?:have )?decided\b/i, /\bwe agreed\b/i, /\bagreement\b/i, /\bthe decision\b/i,
  /\bwe(?:'| a)?re going (?:to|with)\b/i, /\bapproved\b/i, /\bsigned off\b/i,
  /\bconsensus\b/i, /\bwe(?:'| wi)?ll go with\b/i, /\bconcluded\b/i,
];

const QUESTION_CUES = [/\?\s*$/];

/** Sentences that sound like somebody committing to something. */
export function extractActions(text) {
  return sentences(text)
    .filter((s) => ACTION_CUES.some((r) => r.test(s)))
    .map((s) => ({ text: s, kind: 'action' }));
}

/** Sentences that sound like the room settling something. */
export function extractDecisions(text) {
  return sentences(text)
    .filter((s) => DECISION_CUES.some((r) => r.test(s)))
    .map((s) => ({ text: s, kind: 'decision' }));
}

/** Open questions left hanging. */
export function extractQuestions(text) {
  return sentences(text)
    .filter((s) => QUESTION_CUES.some((r) => r.test(s)))
    .map((s) => ({ text: s, kind: 'question' }));
}

const STOP = new Set(('a about after all also an and any are as at be been but by can could did do does for from get had has have he her him his how i if in into is it its just like make may me more most my no not of on one only or other our out over said same see she should so some such take than that the their them then there these they this those to too up us use was way we were what when where which who will with would you your'.split(' ')));

/**
 * A short extractive summary: the sentences that carry the most of the
 * meeting's own vocabulary, kept in the order they were said. No model, no
 * network — it reads what is there and picks the load-bearing lines.
 */
export function summarise(text, max = 5) {
  const sents = sentences(text);
  if (sents.length <= max) return sents;

  const freq = new Map();
  for (const s of sents) {
    for (const w of s.toLowerCase().match(/[a-z']{3,}/g) || []) {
      if (STOP.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }

  const scored = sents.map((s, i) => {
    const words = s.toLowerCase().match(/[a-z']{3,}/g) || [];
    const meaningful = words.filter((w) => !STOP.has(w));
    if (!meaningful.length) return { i, s, score: 0 };
    let score = meaningful.reduce((a, w) => a + (freq.get(w) || 0), 0) / meaningful.length;
    if (i < sents.length * 0.15) score *= 1.25;              // openings set the agenda
    if (i > sents.length * 0.85) score *= 1.2;               // closings carry conclusions
    if (DECISION_CUES.some((r) => r.test(s))) score *= 1.6;  // decisions matter most
    if (ACTION_CUES.some((r) => r.test(s))) score *= 1.4;
    if (words.length < 6 || words.length > 60) score *= 0.6; // fragments and rambles
    return { i, s, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
}

/** Everything a meeting write-up needs, from the transcript alone. */
export function digest(text, { maxSummary = 5 } = {}) {
  const dedupe = (list) => {
    const seen = new Set();
    return list.filter((x) => {
      const k = x.text.toLowerCase().slice(0, 60);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  return {
    summary: summarise(text, maxSummary),
    decisions: dedupe(extractDecisions(text)).slice(0, 8),
    actions: dedupe(extractActions(text)).slice(0, 12),
    questions: dedupe(extractQuestions(text)).slice(0, 6),
    words: (String(text || '').match(/\S+/g) || []).length,
  };
}

/* ------------------------------------------------------------------ *
 * the session
 * ------------------------------------------------------------------ */

export const CONSENT_REQUIRED = true;

/**
 * One meeting, from "start" to "stop".
 *
 * @param opts.bitrate         audio bitrate
 * @param opts.locale          language for the live transcript
 * @param opts.dictate         whether to run live speech-to-text
 * @param opts.onTick          (seconds, transcript) roughly every 200ms
 * @param opts.onAutosave      (state) whenever the session persists itself
 * @param opts.save            async (state) => void, the persistence hook
 */
export class MeetingSession {
  constructor(opts = {}) {
    this.opts = opts;
    this.id = `meeting-${Date.now()}`;
    this.title = opts.title || '';
    this.attendees = opts.attendees || '';
    this.consent = null;                // must be set before start()
    this.notes = '';
    this.marks = [];                    // [{ at: seconds, label }]
    this.transcript = '';
    this.startedAt = null;
    this.endedAt = null;
    this.recorder = null;
    this.dictation = null;
    this.autosaveTimer = null;
    this.tickTimer = null;
    this.running = false;
  }

  get seconds() {
    if (!this.startedAt) return 0;
    return (this.endedAt || Date.now() - 0) && ((this.endedAt || Date.now()) - this.startedAt) / 1000;
  }

  /**
   * Confirm the room has been told. Curio will not start without this, and the
   * answer is written into the record so it is never in doubt later.
   */
  confirmConsent(given, note = '') {
    this.consent = {
      given: !!given,
      at: new Date().toISOString(),
      note: String(note || '').slice(0, 200),
    };
    return this.consent.given;
  }

  async start() {
    if (CONSENT_REQUIRED && !this.consent?.given) throw new Error('NO_CONSENT');
    if (this.running) return false;

    this.recorder = new Recorder({
      maxSeconds: MAX_MEETING_SECONDS,
      bitrate: this.opts.bitrate || 24000,
    });
    await this.recorder.start();
    this.startedAt = Date.now();
    this.running = true;

    if (this.opts.dictate && canDictate()) {
      this.dictation = new Dictation({ locale: this.opts.locale || 'en-GB' });
      this.dictation.start(
        (finalText, interim) => {
          this.transcript = finalText;
          this.opts.onTick?.(this.seconds, (finalText + ' ' + interim).trim());
        },
        () => { this.dictation = null; }
      );
    }

    this.tickTimer = setInterval(() => {
      this.opts.onTick?.(this.seconds, this.transcript);
      if (this.seconds >= MAX_MEETING_SECONDS) this.stop();
    }, 500);

    this.autosaveTimer = setInterval(() => this.autosave(), AUTOSAVE_EVERY_MS);
    await this.autosave();
    return true;
  }

  /** Flag this instant — the thing you will want to find again afterwards. */
  mark(label = '') {
    if (!this.running) return null;
    const m = { at: Math.round(this.seconds), label: String(label || '').slice(0, 120) };
    this.marks.push(m);
    return m;
  }

  setNotes(text) { this.notes = String(text || ''); }
  setTitle(text) { this.title = String(text || '').slice(0, 140); }
  setAttendees(text) { this.attendees = String(text || '').slice(0, 400); }

  /** What gets written to disk — deliberately small enough to save often. */
  snapshot(extra = {}) {
    return {
      id: this.id,
      title: this.title,
      attendees: this.attendees,
      consent: this.consent,
      notes: this.notes,
      marks: this.marks,
      transcript: this.transcript,
      startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
      endedAt: this.endedAt ? new Date(this.endedAt).toISOString() : null,
      seconds: Math.round(this.seconds),
      running: this.running,
      ...extra,
    };
  }

  async autosave() {
    if (!this.opts.save) return null;
    const state = this.snapshot();
    try { await this.opts.save(state); this.opts.onAutosave?.(state); } catch { /* keep going */ }
    return state;
  }

  /** Stop, release the microphone, and hand back the finished meeting. */
  async stop() {
    if (!this.running) return null;
    this.running = false;
    clearInterval(this.tickTimer); this.tickTimer = null;
    clearInterval(this.autosaveTimer); this.autosaveTimer = null;

    if (this.dictation) { this.transcript = this.dictation.stop() || this.transcript; this.dictation = null; }
    const audio = this.recorder ? await this.recorder.stop() : null;
    this.recorder = null;
    this.endedAt = Date.now();

    const state = this.snapshot({
      audio: audio?.dataUrl || null,
      audioSeconds: audio?.seconds || Math.round(this.seconds),
      digest: digest(this.transcript),
      complete: true,
    });
    if (this.opts.save) { try { await this.opts.save(state); } catch { /* the caller still has it */ } }
    return state;
  }

  /** Abandon without keeping anything. */
  cancel() {
    this.running = false;
    clearInterval(this.tickTimer); clearInterval(this.autosaveTimer);
    this.dictation?.stop();
    this.recorder?.cancel();
    this.recorder = null; this.dictation = null;
  }
}

/* ------------------------------------------------------------------ *
 * turning a finished meeting into a diary moment
 * ------------------------------------------------------------------ */

/** A readable write-up, for the placard and for export. */
export function writeUp(state, L) {
  const t = L?.ui?.meeting || {};
  const d = state.digest || digest(state.transcript || '');
  const mins = Math.max(1, Math.round((state.seconds || 0) / 60));
  const lines = [];

  if (d.summary.length) {
    lines.push(`## ${t.summary || 'In short'}`);
    d.summary.forEach((s) => lines.push(`- ${s}`));
  }
  if (d.decisions.length) {
    lines.push('', `## ${t.decisions || 'Decided'}`);
    d.decisions.forEach((x) => lines.push(`- ${x.text}`));
  }
  if (d.actions.length) {
    lines.push('', `## ${t.actions || 'To do'}`);
    d.actions.forEach((x) => lines.push(`- [ ] ${x.text}`));
  }
  if (d.questions.length) {
    lines.push('', `## ${t.questions || 'Left open'}`);
    d.questions.forEach((x) => lines.push(`- ${x.text}`));
  }
  if (state.marks?.length) {
    lines.push('', `## ${t.marks || 'Marked moments'}`);
    state.marks.forEach((m) => lines.push(`- ${fmtClock(m.at)}${m.label ? ` \u2014 ${m.label}` : ''}`));
  }
  if (state.notes?.trim()) {
    lines.push('', `## ${t.notes || 'Your notes'}`, state.notes.trim());
  }

  return { markdown: lines.join('\n'), minutes: mins, digest: d };
}

export function fmtClock(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
           : `${m}:${String(r).padStart(2, '0')}`;
}

/** One line for the placard, in plain language. */
export function placardFor(state, L) {
  const t = L?.ui?.meeting || {};
  const mins = Math.max(1, Math.round((state.seconds || 0) / 60));
  const d = state.digest || digest(state.transcript || '');
  const bits = [];
  bits.push((t.lasted || '{n} minutes').replace('{n}', mins));
  if (d.decisions.length) bits.push((t.nDecisions || '{n} decided').replace('{n}', d.decisions.length));
  if (d.actions.length) bits.push((t.nActions || '{n} to do').replace('{n}', d.actions.length));
  if (state.marks?.length) bits.push((t.nMarks || '{n} marked').replace('{n}', state.marks.length));
  return bits.join(' \u00b7 ');
}
