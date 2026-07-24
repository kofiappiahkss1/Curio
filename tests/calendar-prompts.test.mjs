import test from 'node:test';
import assert from 'node:assert/strict';
import * as ical from '../calendar.js';
import * as prompts from '../prompts.js';
import { readFileSync } from 'node:fs';

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:1@test
DTSTART;VALUE=DATE:20260315
SUMMARY:Dinner with Ama
LOCATION:Tontoku
END:VEVENT
BEGIN:VEVENT
UID:2@test
DTSTART:20260316T140000Z
SUMMARY:Weekly standup
RRULE:FREQ=WEEKLY
END:VEVENT
BEGIN:VEVENT
UID:3@test
DTSTART:20260317T093000
SUMMARY:Launch review
DESCRIPTION:Bring the numbers\\, and the printer quote
END:VEVENT
END:VCALENDAR`;

/* ================= READING A CALENDAR ================= */
test('an ics file is read into events', () => {
  const e = ical.parseIcs(ICS);
  assert.equal(e.length, 3);
  assert.equal(e[0].summary, 'Dinner with Ama');
  assert.equal(e[0].location, 'Tontoku');
  assert.equal(e[0].allDay, true);
  assert.equal(e[1].recurring, true);
  assert.match(e[2].description, /Bring the numbers, and the printer quote/,
    'escaped commas must come back as commas');
});

test('dates parse in all three shapes the format allows', () => {
  assert.equal(ical.parseIcsDate('20260315').allDay, true);
  assert.equal(ical.parseIcsDate('20260315').date.getFullYear(), 2026);
  const utc = ical.parseIcsDate('20260316T140000Z');
  assert.equal(utc.allDay, false);
  assert.equal(utc.date.getUTCHours(), 14);
  const local = ical.parseIcsDate('20260317T093000');
  assert.equal(local.date.getHours(), 9);
  assert.equal(ical.parseIcsDate('nonsense'), null);
});

test('folded lines are put back together', () => {
  const folded = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260315\r\nSUMMARY:A very long \r\n title that was folded\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const e = ical.parseIcs(folded);
  assert.equal(e[0].summary, 'A very long title that was folded');
});

test('recurring meetings and blocked time are not offered as memories', () => {
  const worth = ical.worthKeeping(ical.parseIcs(ICS));
  assert.equal(worth.length, 2, 'the weekly standup is skipped');
  assert.ok(!worth.some((e) => /standup/i.test(e.summary)));

  const noisy = ical.parseIcs(ICS.replace('Launch review', 'Focus time'));
  assert.ok(!ical.worthKeeping(noisy).some((e) => /focus/i.test(e.summary)));
});

test('a date range can be applied', () => {
  const all = ical.parseIcs(ICS);
  const narrow = ical.worthKeeping(all, { from: new Date(2026, 2, 16), to: new Date(2026, 2, 20) });
  assert.equal(narrow.length, 1);
  assert.equal(narrow[0].summary, 'Launch review');
});

test('an event becomes a moment that says where it came from', () => {
  const e = ical.worthKeeping(ical.parseIcs(ICS))[0];
  const m = ical.toMoment(e, 0);
  assert.equal(m.kind, 'place', 'an event with a location is a place');
  assert.equal(m.label, 'Dinner with Ama');
  assert.match(m.provenance, /From your calendar/);
  assert.equal(m.imported, 'Calendar');
  assert.equal(m.day, '2026-03-15');
});

test('rubbish input yields nothing rather than throwing', () => {
  assert.deepEqual(ical.parseIcs(''), []);
  assert.deepEqual(ical.parseIcs('not a calendar at all'), []);
  assert.deepEqual(ical.parseIcs(null), []);
});

/* ================= WRITING A CALENDAR ================= */
test('a calendar is written with birthdays, capsules and a nudge', () => {
  const out = ical.buildIcs({
    name: 'Kofi',
    ownBirthday: '1990-03-15',
    people: [{ name: 'Ama', dob: '1995-07-23' }],
    capsules: [{ title: 'A letter', unlockAt: '2027-01-01T09:00:00' }],
    reminder: { hour: 21, minute: 0, text: 'Keep a moment' },
  });
  assert.match(out, /^BEGIN:VCALENDAR/);
  assert.match(out, /END:VCALENDAR$/);
  assert.equal((out.match(/BEGIN:VEVENT/g) || []).length, 4);
  assert.equal((out.match(/END:VEVENT/g) || []).length, 4);
  assert.match(out, /RRULE:FREQ=YEARLY/, 'birthdays recur every year');
  assert.match(out, /RRULE:FREQ=DAILY/, 'the nudge recurs daily');
  assert.match(out, /BEGIN:VALARM/, 'the alarm is what makes this useful');
  assert.match(out, /Ama's birthday/);
  assert.match(out, /X-WR-CALNAME:The Curio/);
});

test('what it writes can be read back', () => {
  const out = ical.buildIcs({ people: [{ name: 'Ama', dob: '1995-07-23' }] });
  const back = ical.parseIcs(out);
  assert.equal(back.length, 1);
  assert.match(back[0].summary, /Ama/);
});

test('bad dates are skipped rather than written as nonsense', () => {
  const out = ical.buildIcs({ people: [{ name: 'Broken', dob: 'not a date' }, { name: '', dob: '1990-01-01' }] });
  assert.equal((out.match(/BEGIN:VEVENT/g) || []).length, 0);
  assert.equal(ical.countIcs({ people: [{ name: 'Broken', dob: 'nope' }] }), 0);
});

test('long lines are folded so strict calendars accept the file', () => {
  const out = ical.buildIcs({ capsules: [{ title: 'x'.repeat(200), unlockAt: '2027-01-01' }] });
  for (const line of out.split('\r\n')) {
    assert.ok(line.length <= 75, `a line ran to ${line.length} characters`);
  }
});

/* ================= WHAT IT SAYS WHEN YOU OPEN IT ================= */
const at = (h, d = 23) => new Date(2026, 6, d, h);

test('a brand new archive is invited to start', () => {
  const p = prompts.choose({ now: at(9), total: 0 });
  assert.equal(p.key, 'firstEver');
});

test('occasions outrank routine', () => {
  assert.equal(prompts.choose({ now: at(9), total: 40, birthdayOwn: true }).key, 'birthdayOwn');
  assert.equal(prompts.choose({ now: at(9), total: 40, holiday: 'Founders’ Day' }).key, 'holiday');
  assert.equal(prompts.choose({ now: at(10), total: 40, daysAway: 6 }).key, 'returning');
});

test('someone who has already written plenty is left alone', () => {
  assert.equal(prompts.choose({ now: at(21), keptToday: 4, streak: 2, total: 40 }), null);
  assert.equal(prompts.choose({ now: at(13), keptToday: 3, total: 40 }), null);
  assert.ok(prompts.choose({ now: at(20), keptToday: 1, total: 40 }), 'but one entry still gets a nudge');
});

test('a streak is only mentioned while it is at risk', () => {
  assert.equal(prompts.choose({ now: at(18), keptToday: 0, streak: 11, total: 40 }).key, 'streakRisk');
  const kept = prompts.choose({ now: at(18), keptToday: 1, streak: 11, total: 40 });
  assert.notEqual(kept.key, 'streakRisk');
});

test('the same prompt holds all day, and shifts between days', () => {
  const morning = prompts.choose({ now: at(9), keptToday: 0, total: 20 });
  const later = prompts.choose({ now: at(10), keptToday: 0, total: 20 });
  assert.equal(morning.text, later.text);

  const week = [...Array(8)].map((_, i) =>
    prompts.choose({ now: at(9, 18 + i), keptToday: 0, total: 20 })?.text);
  assert.ok(new Set(week).size > 1, 'it should not be the same line every day');
});

test('a prompt already dismissed today does not come back', () => {
  const first = prompts.choose({ now: at(9), keptToday: 0, total: 20 });
  const again = prompts.choose({ now: at(9), keptToday: 0, total: 20, seen: [first.key] });
  assert.notEqual(again?.key, first.key);
});

test('place names are capitalised when they start the sentence', () => {
  const p = prompts.choose({ now: at(14), keptToday: 0, total: 40, topPlace: 'the harbour' });
  const text = prompts.fillPrompt(p.text, p.vars);
  assert.equal(text[0], text[0].toUpperCase());
  assert.match(text, /harbour/);
});

test('opening the app tells a new day from a second look', () => {
  assert.equal(prompts.isFirstOpenToday(null), true);
  assert.equal(prompts.isFirstOpenToday('2026-07-22T21:00:00', at(7)), true);
  assert.equal(prompts.isFirstOpenToday('2026-07-23T07:00:00', at(9)), false);
  assert.equal(prompts.daysSince('2026-07-18T10:00:00', at(9)), 5);
  assert.equal(prompts.daysSince(null), 0);
});

test('the usual hour is learnt, not assumed', () => {
  assert.equal(prompts.usualHour([
    '2026-07-20T21:10:00', '2026-07-21T21:40:00',
    '2026-07-22T20:55:00', '2026-07-23T21:20:00']), 21);
  assert.equal(prompts.usualHour(['2026-07-20T21:10:00']), null, 'too little to go on');
});

/* ================= THE NAME ================= */
test('the display name is The Curio everywhere a person can see it', () => {
  const root = new URL('..', import.meta.url).pathname;
  const read = (f) => readFileSync(root + f, 'utf8');
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.short_name, 'The Curio');
  assert.match(manifest.name, /^The Curio/);
  assert.match(read('app.html'), /<span class="n">The Curio<\/span>/);
  assert.match(read('index.html'), /<title>The Curio/);
  assert.match(read('share.js'), /fillText\('The Curio'/);
});

test('technical identifiers were left alone so nobody loses their archive', () => {
  const root = new URL('..', import.meta.url).pathname;
  const read = (f) => readFileSync(root + f, 'utf8');
  assert.match(read('store.js'), /DB_NAME = 'curio'/, 'renaming the database would orphan existing data');
  assert.match(read('sw.js'), /curio-code-/);
  assert.match(read('sw.js'), /curio-ping/);
});
