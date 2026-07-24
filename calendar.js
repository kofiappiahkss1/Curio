/**
 * Curio — the calendar bridge.
 *
 * WHY THIS IS NOT "SIGN IN WITH GOOGLE"
 *
 * Reading your Google Calendar directly needs OAuth, an API key and a server to
 * hold the secret. Curio has none of those and is not going to acquire them for
 * a convenience. But every calendar on earth — Google, Apple, Outlook, Proton —
 * speaks the same plain file format, and that needs nobody's permission.
 *
 *   BRINGING IT IN   Export your calendar as .ics and drop it in. Curio reads
 *                    the events on the device and offers to keep the ones that
 *                    were actually part of your life.
 *
 *   SENDING IT OUT   Curio writes an .ics of your birthdays and sealed capsules
 *                    that you import into Google Calendar once. They then show
 *                    up alongside everything else, and Google's own alarms work
 *                    on them — which is as close to an alarm clock as a web app
 *                    can honestly get.
 */

/* ------------------------------------------------------------------ *
 * reading
 * ------------------------------------------------------------------ */

/** Undo the 75-character line folding the format insists on. */
function unfold(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

const unescapeText = (v) => String(v || '')
  .replace(/\\n/gi, '\n').replace(/\\,/g, ',')
  .replace(/\\;/g, ';').replace(/\\\\/g, '\\');

/** Turn an iCalendar date into a real one. Handles dates, times and UTC. */
export function parseIcsDate(value, params = '') {
  const v = String(value || '').trim();
  let m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return { date: new Date(+m[1], +m[2] - 1, +m[3]), allDay: true };

  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (m) {
    const [, y, mo, d, h, mi, s, z] = m;
    const date = z
      ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
      : new Date(+y, +mo - 1, +d, +h, +mi, +s);
    return { date, allDay: false };
  }
  const loose = new Date(v);
  return Number.isNaN(loose.getTime()) ? null : { date: loose, allDay: /VALUE=DATE/i.test(params) };
}

/**
 * Read an .ics file into plain events.
 * @returns [{ uid, summary, description, location, start, end, allDay, recurring }]
 */
export function parseIcs(text) {
  const lines = unfold(text).split('\n');
  const events = [];
  let cur = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur?.start) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const left = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const [key, ...paramParts] = left.split(';');
    const params = paramParts.join(';');
    const name = key.toUpperCase();

    if (name === 'UID') cur.uid = value;
    else if (name === 'SUMMARY') cur.summary = unescapeText(value);
    else if (name === 'DESCRIPTION') cur.description = unescapeText(value);
    else if (name === 'LOCATION') cur.location = unescapeText(value);
    else if (name === 'DTSTART') {
      const p = parseIcsDate(value, params);
      if (p) { cur.start = p.date; cur.allDay = p.allDay; }
    } else if (name === 'DTEND') {
      const p = parseIcsDate(value, params);
      if (p) cur.end = p.date;
    } else if (name === 'RRULE') cur.recurring = true;
  }
  return events.filter((e) => e.summary || e.location);
}

const dayKeyOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Which calendar events are worth offering to keep.
 * Working hours full of recurring stand-ups are not a diary; a dinner is.
 */
export function worthKeeping(events, { from, to, skipRecurring = true } = {}) {
  const noise = /\b(stand-?up|standup|sync|1:1|one.on.one|weekly|daily|reminder|busy|blocked|focus|lunch break|out of office|ooo)\b/i;
  return events.filter((e) => {
    if (!e.start) return false;
    if (from && e.start < from) return false;
    if (to && e.start > to) return false;
    if (skipRecurring && e.recurring) return false;
    if (e.summary && noise.test(e.summary)) return false;
    return true;
  }).sort((a, b) => a.start - b.start);
}

/** Shape a calendar event like a Curio moment. */
export function toMoment(event, index = 0) {
  const at = event.start;
  const day = dayKeyOf(at);
  const year = day.slice(0, 4);
  const time = event.allDay ? '' : at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return {
    id: `cal-${event.uid || `${at.getTime()}-${index}`}`,
    accession: `${year}.${2000 + index}`,
    kind: event.location ? 'place' : 'note',
    at: at.toISOString(),
    day,
    label: event.summary || event.location || null,
    title: event.summary || event.location || 'An appointment',
    placard: [event.location, event.description].filter(Boolean).join(' \u00b7 ')
      || `From your calendar${time ? `, at ${time}` : ''}.`,
    provenance: `From your calendar \u00b7 ${at.toLocaleDateString(undefined,
      { day: 'numeric', month: 'short', year: 'numeric' })}`,
    imported: 'Calendar',
    kept: true,
    editedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * writing
 * ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0');
const icsDate = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const icsStamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
  + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

const escapeText = (v) => String(v || '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;')
  .replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Fold long lines back to 75 octets, as the format requires. */
function fold(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) { parts.push(' ' + rest.slice(0, 74)); rest = rest.slice(74); }
  if (rest) parts.push(' ' + rest);
  return parts.join('\r\n');
}

function vevent({ uid, summary, description, date, yearly = false, alarmMinutes = null }) {
  const now = new Date();
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART;VALUE=DATE:${icsDate(date)}`,
    `SUMMARY:${escapeText(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (yearly) lines.push('RRULE:FREQ=YEARLY');
  if (alarmMinutes != null) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY',
      `TRIGGER:-PT${alarmMinutes}M`, `DESCRIPTION:${escapeText(summary)}`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines.map(fold).join('\r\n');
}

/**
 * Write a calendar of the dates Curio knows about: birthdays, sealed capsules,
 * and optionally a daily nudge. Import it once and your own calendar handles
 * the reminding — including the alarm, which no web app can do by itself.
 *
 * @param opts.people    [{ name, dob }]
 * @param opts.capsules  [{ title, unlockAt }]
 * @param opts.reminder  { hour, minute, text } for a daily nudge
 */
export function buildIcs({ people = [], capsules = [], reminder = null, ownBirthday = null, name = '' } = {}) {
  const out = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Curio//Diary//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name ? `The Curio \u2014 ${name}` : 'The Curio')}`,
  ];

  if (ownBirthday) {
    const d = new Date(ownBirthday);
    if (!Number.isNaN(d.getTime())) {
      out.push(vevent({
        uid: `curio-birthday-own@curio`,
        summary: 'Your birthday',
        description: 'Worth keeping something today.',
        date: d, yearly: true, alarmMinutes: 540,
      }));
    }
  }

  people.forEach((p, i) => {
    const d = new Date(p.dob);
    if (Number.isNaN(d.getTime()) || !p.name) return;
    out.push(vevent({
      uid: `curio-birthday-${i}@curio`,
      summary: `${p.name}'s birthday`,
      date: d, yearly: true, alarmMinutes: 1440,
    }));
  });

  capsules.forEach((c, i) => {
    const d = new Date(c.unlockAt);
    if (Number.isNaN(d.getTime())) return;
    out.push(vevent({
      uid: `curio-capsule-${i}@curio`,
      summary: 'A capsule opens today',
      description: c.title ? `You sealed: ${c.title}` : 'Something you sealed for later.',
      date: d, alarmMinutes: 0,
    }));
  });

  if (reminder) {
    const start = new Date();
    start.setHours(reminder.hour ?? 21, reminder.minute ?? 0, 0, 0);
    out.push([
      'BEGIN:VEVENT',
      'UID:curio-daily@curio',
      `DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART:${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}`
        + `T${pad(start.getHours())}${pad(start.getMinutes())}00`,
      'RRULE:FREQ=DAILY',
      `SUMMARY:${escapeText(reminder.text || 'Keep a moment')}`,
      'DESCRIPTION:One photo, one place, one meal.',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT0M',
      `DESCRIPTION:${escapeText(reminder.text || 'Keep a moment')}`, 'END:VALARM',
      'END:VEVENT',
    ].map(fold).join('\r\n'));
  }

  out.push('END:VCALENDAR');
  return out.join('\r\n');
}

/** How many events a generated calendar will contain. */
export function countIcs({ people = [], capsules = [], reminder = null, ownBirthday = null } = {}) {
  return (ownBirthday ? 1 : 0)
    + people.filter((p) => p.name && !Number.isNaN(new Date(p.dob).getTime())).length
    + capsules.filter((c) => !Number.isNaN(new Date(c.unlockAt).getTime())).length
    + (reminder ? 1 : 0);
}
