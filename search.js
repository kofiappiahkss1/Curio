/**
 * Curio — search.
 *
 * The old search walked every moment calling `includes()`. That is fine for a
 * fortnight and useless for five years: no ranking, no partial words, no
 * tolerance for a typo, and slower with every entry.
 *
 * This is a proper inverted index, written from scratch rather than pulled in
 * as a dependency — a search library would be a third of the app's whole size,
 * and everything here has to fit on a phone with the radio off.
 *
 *   • tokenised and lightly stemmed, so "walking" finds "walked"
 *   • ranked, so the closest answer is first rather than the oldest
 *   • prefix matching, so "harb" finds "harbour" while you are still typing
 *   • one typo forgiven on longer words, so "resturant" still finds it
 *   • fields weighted, because a title matters more than a transcript
 */

const FIELD_WEIGHT = {
  title: 4.0,
  label: 3.5,
  placard: 1.6,
  notes: 1.2,
  transcript: 0.7,   // long and noisy: present, but never drowns the rest
  kind: 2.0,
  people: 3.0,
};

const STOP = new Set(('a an and are as at be but by for from had has have he her his i if in is it its of on or she that the their them then there they this to was were what when which who will with you your'.split(' ')));

/** Split text into comparable tokens. */
export function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')   // café → cafe
    .split(/[^\p{L}\p{N}']+/u)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/**
 * A very light stemmer. Not linguistically complete, and deliberately so:
 * aggressive stemming makes searches surprising, which is worse than missing
 * the odd plural.
 */
export function stem(word) {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('sses')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  return w;
}

/** Is `a` reachable from `b` by one edit? Cheap, bounded, good enough for typos. */
export function withinOneEdit(a, b) {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (l.length - s.length > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (s.length === l.length) { i++; j++; } else j++;
  }
  return edits + (l.length - j) + (s.length - i) <= 1;
}

/* ------------------------------------------------------------------ *
 * the index
 * ------------------------------------------------------------------ */

export class SearchIndex {
  constructor() {
    this.postings = new Map();   // stem -> Map(id -> weight)
    this.docs = new Map();       // id -> { at, kind }
    this.terms = [];             // sorted stems, for prefix and fuzzy walks
    this._dirty = false;
  }

  get size() { return this.docs.size; }

  /** Pull the searchable text out of a moment, field by field. */
  static fieldsOf(m) {
    const f = {
      title: m.title || '',
      label: m.label || '',
      placard: m.placard || '',
      kind: m.kind || '',
      people: m.person || '',
      notes: m.meeting?.notes || '',
      transcript: m.meeting?.transcript || '',
    };
    if (m.meeting?.digest) {
      const d = m.meeting.digest;
      f.notes += ' ' + [...(d.decisions || []), ...(d.actions || [])].map((x) => x.text).join(' ');
    }
    return f;
  }

  add(m) {
    if (!m || m.kept === false) return;
    this.docs.set(m.id, { at: m.at, kind: m.kind });
    const fields = SearchIndex.fieldsOf(m);

    for (const [field, text] of Object.entries(fields)) {
      const weight = FIELD_WEIGHT[field] ?? 1;
      for (const raw of tokenize(text)) {
        const t = stem(raw);
        let posting = this.postings.get(t);
        if (!posting) { posting = new Map(); this.postings.set(t, posting); }
        posting.set(m.id, (posting.get(m.id) || 0) + weight);
      }
    }
    this._dirty = true;
  }

  remove(id) {
    if (!this.docs.delete(id)) return;
    for (const [t, posting] of this.postings) {
      if (posting.delete(id) && posting.size === 0) this.postings.delete(t);
    }
    this._dirty = true;
  }

  /** Rebuild from scratch — cheap enough that it happens on every archive change. */
  static build(moments = []) {
    const ix = new SearchIndex();
    for (const m of moments) ix.add(m);
    ix.finalise();
    return ix;
  }

  finalise() {
    this.terms = [...this.postings.keys()].sort();
    this._dirty = false;
    return this;
  }

  /** Every indexed term starting with a prefix. */
  prefixMatches(prefix, limit = 24) {
    if (this._dirty) this.finalise();
    const out = [];
    // binary search to the first candidate, then walk
    let lo = 0, hi = this.terms.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.terms[mid] < prefix) lo = mid + 1; else hi = mid;
    }
    for (let i = lo; i < this.terms.length && out.length < limit; i++) {
      if (!this.terms[i].startsWith(prefix)) break;
      out.push(this.terms[i]);
    }
    return out;
  }

  fuzzyMatches(term, limit = 8) {
    if (this._dirty) this.finalise();
    if (term.length < 5) return [];
    const out = [];
    for (const t of this.terms) {
      if (Math.abs(t.length - term.length) > 1) continue;
      if (withinOneEdit(t, term)) { out.push(t); if (out.length >= limit) break; }
    }
    return out;
  }

  /**
   * @returns [{ id, score }] best first
   */
  search(query, { limit = 60, now = Date.now() } = {}) {
    if (this._dirty) this.finalise();
    const words = tokenize(query);
    if (!words.length) return [];

    const N = Math.max(1, this.docs.size);
    const scores = new Map();
    const matchedPerDoc = new Map();

    words.forEach((raw, wi) => {
      const term = stem(raw);
      const isLast = wi === words.length - 1;

      // exact, then prefix (only while still typing), then one typo
      const candidates = new Map();
      if (this.postings.has(term)) candidates.set(term, 1);
      if (isLast) for (const p of this.prefixMatches(term, 12)) if (!candidates.has(p)) candidates.set(p, 0.7);
      if (!candidates.size) for (const f of this.fuzzyMatches(term, 6)) candidates.set(f, 0.55);

      for (const [t, quality] of candidates) {
        const posting = this.postings.get(t);
        if (!posting) continue;
        const idf = Math.log(1 + N / posting.size);
        for (const [id, weight] of posting) {
          scores.set(id, (scores.get(id) || 0) + weight * idf * quality);
          const seen = matchedPerDoc.get(id) || new Set();
          seen.add(wi);
          matchedPerDoc.set(id, seen);
        }
      }
    });

    const out = [];
    for (const [id, base] of scores) {
      const doc = this.docs.get(id);
      if (!doc) continue;
      // every word matching counts for a great deal more than one word matching often
      const coverage = (matchedPerDoc.get(id)?.size || 0) / words.length;
      let score = base * (0.35 + 0.65 * coverage) * (coverage === 1 ? 1.6 : 1);
      // a gentle nudge towards the recent; never enough to bury a better match
      const ageDays = Math.max(0, (now - new Date(doc.at).getTime()) / 86400000);
      score *= 1 + 0.25 / (1 + ageDays / 180);
      out.push({ id, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Words to offer while someone is typing. */
  suggest(query, limit = 6) {
    const words = tokenize(query);
    if (!words.length) return [];
    const last = stem(words[words.length - 1]);
    return this.prefixMatches(last, limit * 3)
      .map((t) => ({ term: t, docs: this.postings.get(t)?.size || 0 }))
      .sort((a, b) => b.docs - a.docs)
      .slice(0, limit)
      .map((x) => x.term);
  }
}

/** Search a list of moments directly, building an index on the way. */
export function searchMoments(moments, query, opts) {
  const ix = SearchIndex.build(moments);
  const hits = ix.search(query, opts);
  const byId = new Map(moments.map((m) => [m.id, m]));
  return hits.map((h) => byId.get(h.id)).filter(Boolean);
}

/** Wrap matches in <mark> so the eye lands on them. Escapes first. */
export function highlight(text, query, escapeFn = (s) => s) {
  const words = [...new Set(tokenize(query).map(stem))].filter((w) => w.length > 1);
  if (!words.length) return escapeFn(text || '');
  const safe = escapeFn(String(text || ''));
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\p{L}*`, 'giu');
  return safe.replace(pattern, '<mark>$&</mark>');
}
