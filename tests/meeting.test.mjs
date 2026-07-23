import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { sentences, extractActions, extractDecisions, extractQuestions,
         summarise, digest, writeUp, placardFor, fmtClock,
         MeetingSession, CONSENT_REQUIRED, MAX_MEETING_SECONDS } from '../meeting.js';

const TRANSCRIPT = `Right, thanks everyone for joining. The main thing today is the launch date for the harbour project.
We looked at the numbers again and the build is running about three weeks behind.
So we decided to move the launch to the fifteenth of October rather than push the team.
Ama, can you check whether the printer can still turn the brochures around in time?
I'll draft the note to the partners this afternoon and send it round for review.
We agreed that nobody announces anything externally until the note has gone out.
Kofi will follow up with the venue by Friday to confirm the new date works.
Is the budget still fine if we slip three weeks?
We'll pick this up again next Tuesday at the same time.`;

/* ================= READING A TRANSCRIPT ================= */
test('sentences are split without tripping over punctuation', () => {
  const s = sentences('One thing happened. Then another thing happened! And a third?');
  assert.equal(s.length, 3);
  assert.equal(sentences('').length, 0);
  assert.equal(sentences(null).length, 0);
  assert.equal(sentences('too short').length, 0, 'fragments are dropped');
});

test('decisions are picked out of the noise', () => {
  const d = extractDecisions(TRANSCRIPT);
  assert.ok(d.length >= 2);
  assert.ok(d.some((x) => /fifteenth of October/.test(x.text)));
  assert.ok(d.some((x) => /nobody announces/.test(x.text)));
  assert.ok(d.every((x) => x.kind === 'decision'));
});

test('things people committed to are picked out', () => {
  const a = extractActions(TRANSCRIPT);
  assert.ok(a.length >= 2);
  assert.ok(a.some((x) => /draft the note/.test(x.text)));
  assert.ok(a.some((x) => /Kofi will follow up/.test(x.text)));
});

test('open questions survive', () => {
  const q = extractQuestions(TRANSCRIPT);
  assert.ok(q.length >= 2);
  assert.ok(q.every((x) => x.text.trim().endsWith('?')));
});

test('the summary keeps the load-bearing lines, in the order they were said', () => {
  const s = summarise(TRANSCRIPT, 4);
  assert.equal(s.length, 4);
  const all = sentences(TRANSCRIPT);
  const positions = s.map((x) => all.indexOf(x));
  for (let i = 1; i < positions.length; i++) {
    assert.ok(positions[i] > positions[i - 1], 'the summary should read in order');
  }
  assert.ok(s.some((x) => /decided|agreed/i.test(x)), 'a decision should make the cut');
});

test('a short transcript is returned whole rather than mangled', () => {
  const tiny = 'We met and we talked about the thing. Then we all went home again.';
  assert.deepEqual(summarise(tiny, 5), sentences(tiny));
});

test('digest pulls everything together and de-duplicates', () => {
  const d = digest(TRANSCRIPT);
  assert.ok(d.words > 100);
  assert.ok(d.summary.length && d.decisions.length && d.actions.length && d.questions.length);
  const texts = d.decisions.map((x) => x.text.toLowerCase().slice(0, 60));
  assert.equal(new Set(texts).size, texts.length, 'no duplicates');
});

test('an empty meeting produces an empty digest rather than throwing', () => {
  const d = digest('');
  assert.deepEqual(d.summary, []);
  assert.equal(d.words, 0);
  assert.deepEqual(d.actions, []);
});

/* ================= THE WRITE-UP ================= */
test('the write-up reads like minutes', () => {
  const state = { title: 'Launch review', seconds: 1830, transcript: TRANSCRIPT,
                  notes: 'Ama seemed unsure about the printer.',
                  marks: [{ at: 300, label: 'budget question' }] };
  const { markdown, minutes } = writeUp(state, { ui: {} });
  assert.equal(minutes, 31);
  assert.match(markdown, /## In short/);
  assert.match(markdown, /## Decided/);
  assert.match(markdown, /## To do/);
  assert.match(markdown, /- \[ \]/, 'actions are checkboxes');
  assert.match(markdown, /5:00 — budget question/);
  assert.match(markdown, /Ama seemed unsure/);
});

test('the placard summarises a meeting in one line', () => {
  const state = { seconds: 1830, transcript: TRANSCRIPT, marks: [{ at: 10 }] };
  const line = placardFor(state, { ui: {} });
  assert.match(line, /31 minutes/);
  assert.match(line, /decided/);
  assert.match(line, /to do/);
});

test('the clock reads properly past an hour', () => {
  assert.equal(fmtClock(0), '0:00');
  assert.equal(fmtClock(75), '1:15');
  assert.equal(fmtClock(3725), '1:02:05');
});

/* ================= CONSENT ================= */
test('a meeting cannot be recorded without confirming the room agreed', async () => {
  assert.equal(CONSENT_REQUIRED, true);
  const m = new MeetingSession();
  await assert.rejects(() => m.start(), (e) => e.message === 'NO_CONSENT');
  assert.equal(m.running, false);
});

test('consent is written into the record, with a timestamp', () => {
  const m = new MeetingSession();
  assert.equal(m.consent, null);
  const ok = m.confirmConsent(true, 'Launch review');
  assert.equal(ok, true);
  assert.equal(m.consent.given, true);
  assert.ok(m.consent.at, 'when it was confirmed is kept');
  assert.equal(m.snapshot().consent.given, true, 'it survives into what gets saved');
});

test('declining consent still refuses to start', async () => {
  const m = new MeetingSession();
  m.confirmConsent(false);
  await assert.rejects(() => m.start(), (e) => e.message === 'NO_CONSENT');
});

/* ================= SURVIVING AN INTERRUPTION ================= */
test('a session saves itself so an interrupted meeting is not lost', async () => {
  const saved = [];
  const m = new MeetingSession({ save: async (st) => saved.push(st) });
  m.confirmConsent(true);
  m.setTitle('Launch review');
  m.setAttendees('Ama, Kofi');
  m.setNotes('Printer is the risk.');
  m.marks.push({ at: 120, label: 'budget' });

  await m.autosave();
  assert.equal(saved.length, 1);
  const st = saved[0];
  assert.equal(st.title, 'Launch review');
  assert.equal(st.attendees, 'Ama, Kofi');
  assert.equal(st.notes, 'Printer is the risk.');
  assert.equal(st.marks.length, 1);
  assert.equal(st.consent.given, true);
});

test('a failing save never brings the meeting down', async () => {
  const m = new MeetingSession({ save: async () => { throw new Error('disk full'); } });
  m.confirmConsent(true);
  await m.autosave();          // must not throw
  assert.equal(m.consent.given, true);
});

test('cancelling leaves nothing running', () => {
  const m = new MeetingSession();
  m.confirmConsent(true);
  m.cancel();
  assert.equal(m.running, false);
  assert.equal(m.recorder, null);
});

test('marks are ignored unless the meeting is actually running', () => {
  const m = new MeetingSession();
  assert.equal(m.mark('nothing yet'), null);
});

test('a meeting can run for a genuinely long session', () => {
  assert.equal(MAX_MEETING_SECONDS, 4 * 60 * 60, 'four hours');
});

test('titles and attendees are bounded so a note cannot bloat the archive', () => {
  const m = new MeetingSession();
  m.setTitle('x'.repeat(500));
  m.setAttendees('y'.repeat(900));
  assert.ok(m.title.length <= 140);
  assert.ok(m.attendees.length <= 400);
});
