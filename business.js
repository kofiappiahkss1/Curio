/**
 * The Curio for Business.
 *
 * The personal diary stays free for ever. This is the part organisations pay
 * for, and it exists because the same architecture that makes a private diary
 * good makes a field record *better*:
 *
 *   • it works with no signal, in a basement or a village or a mine
 *   • there is no server, so there is no data-residency question to answer
 *   • nothing to procure, no IT approval, no seat management
 *
 * Three things turn a diary into a record people can rely on:
 *
 *   TEMPLATES   A site inspection is not a placard. Structured fields, the
 *               same every time, so two people record the same thing the same way.
 *
 *   INTEGRITY   Each record is hashed together with the one before it. Change
 *               anything afterwards and the chain no longer adds up. That is
 *               what makes a record admissible rather than merely stored.
 *
 *   REPORTS     A folder of placards is not a deliverable. This shapes them
 *               into something you can hand to a client or a regulator.
 */

/* ------------------------------------------------------------------ *
 * templates
 * ------------------------------------------------------------------ */

/** Field kinds a template can ask for. Deliberately few. */
export const FIELD = {
  TEXT: 'text', LONG: 'long', CHOICE: 'choice', NUMBER: 'number',
  YESNO: 'yesno', PEOPLE: 'people', SEVERITY: 'severity',
};

export const TEMPLATES = [
  {
    id: 'site-inspection',
    icon: 'place',
    fields: [
      { key: 'site', label: 'Site or address', kind: FIELD.TEXT, required: true },
      { key: 'ref', label: 'Job or reference number', kind: FIELD.TEXT },
      { key: 'condition', label: 'Overall condition', kind: FIELD.CHOICE,
        options: ['Good', 'Acceptable', 'Needs attention', 'Unsafe'] },
      { key: 'findings', label: 'What you found', kind: FIELD.LONG, required: true },
      { key: 'severity', label: 'Severity', kind: FIELD.SEVERITY },
      { key: 'action', label: 'Action required', kind: FIELD.LONG },
      { key: 'attended', label: 'Who was present', kind: FIELD.PEOPLE },
    ],
  },
  {
    id: 'client-visit',
    icon: 'person',
    fields: [
      { key: 'client', label: 'Client', kind: FIELD.TEXT, required: true },
      { key: 'purpose', label: 'Purpose of visit', kind: FIELD.TEXT },
      { key: 'attended', label: 'Who was present', kind: FIELD.PEOPLE },
      { key: 'discussed', label: 'What was discussed', kind: FIELD.LONG, required: true },
      { key: 'agreed', label: 'What was agreed', kind: FIELD.LONG },
      { key: 'followup', label: 'Follow-up needed', kind: FIELD.YESNO },
    ],
  },
  {
    id: 'incident',
    icon: 'note',
    fields: [
      { key: 'where', label: 'Where it happened', kind: FIELD.TEXT, required: true },
      { key: 'what', label: 'What happened', kind: FIELD.LONG, required: true },
      { key: 'severity', label: 'Severity', kind: FIELD.SEVERITY, required: true },
      { key: 'injured', label: 'Anyone hurt', kind: FIELD.YESNO },
      { key: 'witnesses', label: 'Witnesses', kind: FIELD.PEOPLE },
      { key: 'immediate', label: 'Immediate action taken', kind: FIELD.LONG },
      { key: 'reported', label: 'Reported to', kind: FIELD.TEXT },
    ],
  },
  {
    id: 'delivery',
    icon: 'archive',
    fields: [
      { key: 'ref', label: 'Delivery or order number', kind: FIELD.TEXT, required: true },
      { key: 'to', label: 'Delivered to', kind: FIELD.TEXT, required: true },
      { key: 'items', label: 'Items', kind: FIELD.LONG },
      { key: 'condition', label: 'Condition on arrival', kind: FIELD.CHOICE,
        options: ['As expected', 'Minor damage', 'Damaged', 'Rejected'] },
      { key: 'received', label: 'Received by', kind: FIELD.TEXT },
    ],
  },
  {
    id: 'fieldwork',
    icon: 'read',
    fields: [
      { key: 'location', label: 'Location', kind: FIELD.TEXT, required: true },
      { key: 'subject', label: 'Subject or household', kind: FIELD.TEXT },
      { key: 'observations', label: 'Observations', kind: FIELD.LONG, required: true },
      { key: 'measures', label: 'Measurements or counts', kind: FIELD.TEXT },
      { key: 'next', label: 'Next visit needed', kind: FIELD.YESNO },
    ],
  },
];

export const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || null;

/** Which fields were left blank that should not have been. */
export function missingRequired(template, values = {}) {
  return (template?.fields || [])
    .filter((f) => f.required && !String(values[f.key] ?? '').trim())
    .map((f) => f.key);
}

/** A one-line summary of a completed record, for the placard. */
export function summarise(template, values = {}) {
  if (!template) return '';
  const first = template.fields.find((f) => f.required && values[f.key]);
  const sev = values.severity ? ` \u00b7 ${values.severity}` : '';
  const head = first ? String(values[first.key]).slice(0, 60) : '';
  return `${head}${sev}`.trim();
}

/** The record as readable lines, for the card and for a report. */
export function asLines(template, values = {}) {
  if (!template) return [];
  return template.fields
    .filter((f) => String(values[f.key] ?? '').trim() !== '')
    .map((f) => ({ label: f.label, value: String(values[f.key]), kind: f.kind }));
}

/* ------------------------------------------------------------------ *
 * integrity — a chain nobody can quietly edit
 * ------------------------------------------------------------------ *
 * Each record carries a hash of its own contents together with the hash of the
 * record before it. Alter one entry, delete one entry, reorder them, and every
 * hash after that point stops matching. You cannot prove *when* something was
 * written this way — that needs a timestamping authority — but you can prove
 * that nothing has been changed since, which is what most audits actually ask.
 * ------------------------------------------------------------------ */

const enc = new TextEncoder();

const toHex = (buf) => [...new Uint8Array(buf)]
  .map((b) => b.toString(16).padStart(2, '0')).join('');

/** Exactly the fields that are sealed — listed so it can never drift silently. */
export function canonical(moment) {
  return JSON.stringify({
    id: moment.id,
    at: moment.at,
    kind: moment.kind,
    title: moment.title,
    placard: moment.placard,
    record: moment.record || null,
    photo: moment.photo ? moment.photo.length : 0,   // length, not the image itself
    audio: moment.audio ? moment.audio.length : 0,
  });
}

export async function hashMoment(moment, previousHash = '') {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('NO_CRYPTO');
  const digest = await subtle.digest('SHA-256', enc.encode(previousHash + canonical(moment)));
  return toHex(digest);
}

/**
 * Seal a run of records. Returns the same moments with `seal` attached, plus
 * the head hash — the single value that stands for the whole chain.
 */
export async function sealChain(moments = []) {
  const ordered = [...moments].sort((a, b) => new Date(a.at) - new Date(b.at));
  let prev = '';
  const sealed = [];
  for (const m of ordered) {
    const hash = await hashMoment(m, prev);
    sealed.push({ ...m, seal: { hash, prev, at: new Date().toISOString() } });
    prev = hash;
  }
  return { moments: sealed, head: prev, count: sealed.length };
}

/**
 * Check a sealed chain. Reports the first record that no longer adds up rather
 * than a bare true/false, because "which one" is the question people ask.
 */
export async function verifyChain(moments = []) {
  const ordered = [...moments]
    .filter((m) => m.seal)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  if (!ordered.length) return { ok: true, checked: 0, head: '' };

  let prev = '';
  for (let i = 0; i < ordered.length; i++) {
    const m = ordered[i];
    const expected = await hashMoment(m, prev);
    if (m.seal.prev !== prev) {
      return { ok: false, checked: i, failedAt: m.id, reason: 'BROKEN_LINK',
        title: m.title, at: m.at };
    }
    if (m.seal.hash !== expected) {
      return { ok: false, checked: i, failedAt: m.id, reason: 'ALTERED',
        title: m.title, at: m.at };
    }
    prev = m.seal.hash;
  }
  return { ok: true, checked: ordered.length, head: prev };
}

/**
 * A short certificate to print at the foot of a report or send to a client.
 * The head hash is what someone re-checks against later.
 */
export function certificate(result, { name = '', from = null, to = null } = {}) {
  return {
    records: result.count ?? result.checked ?? 0,
    head: result.head || '',
    short: (result.head || '').slice(0, 16).toUpperCase().match(/.{1,4}/g)?.join('-') || '',
    sealedAt: new Date().toISOString(),
    by: name || null,
    from, to,
  };
}

/* ------------------------------------------------------------------ *
 * workspaces
 * ------------------------------------------------------------------ *
 * Work and life in one archive would be a mess and, for anyone handling client
 * information, probably a breach. Records carry a workspace; the personal diary
 * is simply the one called "personal", which is what everybody starts with.
 */

export const PERSONAL = 'personal';
export const WORK = 'work';

export const workspaceOf = (m) => m?.workspace || PERSONAL;

export function inWorkspace(moments = [], workspace = PERSONAL) {
  return moments.filter((m) => workspaceOf(m) === workspace);
}

export function workspaces(moments = []) {
  const set = new Set([PERSONAL]);
  for (const m of moments) set.add(workspaceOf(m));
  return [...set];
}

/** Counts per workspace, for the switcher. */
export function workspaceCounts(moments = []) {
  const counts = new Map();
  for (const m of moments) {
    if (m.kept === false) continue;
    const w = workspaceOf(m);
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return counts;
}

/* ------------------------------------------------------------------ *
 * reports
 * ------------------------------------------------------------------ */

/** Group records for a report, and total what a client will ask about. */
export function reportData(moments, { from, to, workspace = WORK } = {}) {
  const inRange = inWorkspace(moments, workspace)
    .filter((m) => m.kept !== false)
    .filter((m) => {
      const at = new Date(m.at);
      if (from && at < from) return false;
      if (to && at > to) return false;
      return true;
    })
    .sort((a, b) => new Date(a.at) - new Date(b.at));

  const byTemplate = new Map();
  for (const m of inRange) {
    const t = m.record?.template || 'other';
    if (!byTemplate.has(t)) byTemplate.set(t, []);
    byTemplate.get(t).push(m);
  }

  const severities = {};
  for (const m of inRange) {
    const s = m.record?.values?.severity;
    if (s) severities[s] = (severities[s] || 0) + 1;
  }

  return {
    records: inRange,
    count: inRange.length,
    byTemplate,
    severities,
    withPhotos: inRange.filter((m) => m.photo).length,
    from: inRange[0]?.at || null,
    to: inRange[inRange.length - 1]?.at || null,
  };
}
