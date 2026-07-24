/**
 * Curio — bringing a diary with you.
 *
 * The reason people stay on Day One is not that it is better. It is that five
 * years of their life is inside it. This reads an export and puts those years
 * into Curio — on the device, with no upload and no account anywhere.
 *
 * A Day One export is a .zip containing journal.json and a photos folder, so
 * this includes a small ZIP reader built on the browser's own DecompressionStream.
 * No library: a zip parser is a few hundred lines, and pulling in JSZip would
 * cost more than every other module here put together.
 */

/* ------------------------------------------------------------------ *
 * a small ZIP reader
 * ------------------------------------------------------------------ */

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

/** Find the end-of-central-directory record, scanning back from the tail. */
function findEOCD(view) {
  const max = Math.min(view.byteLength, 66000);       // comment can be 64k
  for (let i = view.byteLength - 22; i >= view.byteLength - max; i--) {
    if (i < 0) break;
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  return -1;
}

async function inflate(bytes, method) {
  if (method === 0) return bytes;                     // stored, not compressed
  if (method !== 8) throw new Error('UNSUPPORTED_COMPRESSION');
  if (typeof DecompressionStream === 'undefined') throw new Error('NO_DECOMPRESSION');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Read a ZIP into a map of path → bytes.
 * @returns {Promise<Map<string, Uint8Array>>}
 */
export async function readZip(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const eocd = findEOCD(view);
  if (eocd < 0) throw new Error('NOT_A_ZIP');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);            // start of central directory
  const files = new Map();
  const decoder = new TextDecoder();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== CEN_SIG) break;
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;                  // a directory entry
    // the local header repeats the name and extra fields, with its own lengths
    const lnLen = view.getUint16(localOffset + 26, true);
    const leLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lnLen + leLen;
    try {
      files.set(name, await inflate(bytes.subarray(start, start + compressed), method));
    } catch {
      // one unreadable file should not lose the whole import
    }
  }
  return files;
}

const asText = (bytes) => new TextDecoder().decode(bytes);

function asDataUrl(bytes, name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
                 heic: 'image/heic', webp: 'image/webp', gif: 'image/gif',
                 m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac' }[ext] || 'application/octet-stream';
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/* ------------------------------------------------------------------ *
 * recognising what somebody dropped in
 * ------------------------------------------------------------------ */

export const FORMATS = ['curio', 'dayone', 'journey', 'diarium', 'json', 'csv'];

/** Work out what an export actually is, without asking the person. */
export function detectFormat(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.product === 'Curio' && Array.isArray(parsed.moments)) return 'curio';
  if (Array.isArray(parsed.entries) && parsed.entries.some((e) => e.creationDate || e.richText)) return 'dayone';
  if (Array.isArray(parsed) && parsed.some((e) => e.date_journal || e.text !== undefined)) return 'journey';
  if (Array.isArray(parsed)) return 'json';
  if (parsed.metadata && Array.isArray(parsed.entries)) return 'dayone';
  return null;
}

/* ------------------------------------------------------------------ *
 * the parsers
 * ------------------------------------------------------------------ */

const clean = (t) => String(t || '')
  .replace(/!\[\]\(dayone-moment:\/\/[^)]*\)/g, '')     // Day One photo placeholders
  .replace(/\\\[/g, '[').replace(/\\\]/g, ']')
  .replace(/\r\n/g, '\n')
  .trim();

const firstLine = (t, max = 70) => {
  const line = clean(t).split('\n').find((l) => l.trim().length > 1) || '';
  const stripped = line.replace(/^#+\s*/, '').trim();
  return stripped.length > max ? stripped.slice(0, max - 1).trimEnd() + '\u2026' : stripped;
};

const dayKeyOf = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Day One: journal.json plus a photos folder keyed by md5. */
export function parseDayOne(data, files = new Map()) {
  const photoIndex = new Map();
  for (const [path, bytes] of files) {
    const base = path.split('/').pop();
    const stem = base.replace(/\.[^.]+$/, '');
    if (/photos?\//i.test(path) || /audios?\//i.test(path)) photoIndex.set(stem.toLowerCase(), { path, bytes });
  }

  const out = [];
  for (const e of data.entries || []) {
    const at = e.creationDate || e.modifiedDate;
    const day = dayKeyOf(at);
    if (!day) continue;

    const text = clean(e.text || e.richText || '');
    const place = e.location?.placeName || e.location?.localityName
      || e.location?.administrativeArea || null;

    let photo = null;
    const first = (e.photos || [])[0];
    if (first) {
      const hit = photoIndex.get(String(first.md5 || first.identifier || '').toLowerCase());
      if (hit) { try { photo = asDataUrl(hit.bytes, hit.path); } catch { photo = null; } }
    }

    out.push({
      id: `dayone-${e.uuid || `${at}-${out.length}`}`,
      at: new Date(at).toISOString(),
      day,
      kind: photo ? 'photo' : place ? 'place' : 'note',
      label: place || firstLine(text) || null,
      title: firstLine(text) || place || 'An entry',
      placard: text || place || '',
      photo,
      tags: Array.isArray(e.tags) ? e.tags : [],
      starred: !!e.starred,
      imported: 'Day One',
      kept: true,
    });
  }
  return out;
}

/** Journey exports one JSON object per entry, or an array of them. */
export function parseJourney(data) {
  const list = Array.isArray(data) ? data : [data];
  const out = [];
  for (const e of list) {
    const at = e.date_journal ? new Date(Number(e.date_journal)) : new Date(e.date || e.created);
    if (Number.isNaN(at.getTime())) continue;
    const text = clean(e.text || '');
    out.push({
      id: `journey-${e.id || at.getTime()}`,
      at: at.toISOString(),
      day: dayKeyOf(at),
      kind: e.address ? 'place' : 'note',
      label: e.address || firstLine(text) || null,
      title: firstLine(text) || e.address || 'An entry',
      placard: text,
      photo: null,
      tags: Array.isArray(e.tags) ? e.tags : [],
      imported: 'Journey',
      kept: true,
    });
  }
  return out;
}

/** A plain array of objects — anybody's export, so guess the field names kindly. */
export function parseGenericJson(data) {
  const list = Array.isArray(data) ? data : data.entries || [];
  const out = [];
  for (const e of list) {
    const raw = e.date || e.created || e.createdAt || e.creationDate || e.timestamp || e.at;
    const at = new Date(raw);
    if (Number.isNaN(at.getTime())) continue;
    const text = clean(e.text || e.body || e.content || e.entry || e.note || '');
    if (!text && !e.title) continue;
    out.push({
      id: `import-${at.getTime()}-${out.length}`,
      at: at.toISOString(),
      day: dayKeyOf(at),
      kind: 'note',
      label: e.title || firstLine(text) || null,
      title: e.title || firstLine(text) || 'An entry',
      placard: text,
      photo: null,
      tags: Array.isArray(e.tags) ? e.tags : [],
      imported: 'Import',
      kept: true,
    });
  }
  return out;
}

/** CSV with a header row. Date and text columns are found by name. */
export function parseCsv(text) {
  const rows = splitCsv(text);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const dateCol = head.findIndex((h) => /date|created|time/.test(h));
  const textCol = head.findIndex((h) => /text|body|content|entry|note/.test(h));
  const titleCol = head.findIndex((h) => /title|name|subject/.test(h));
  if (dateCol < 0) return [];

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const at = new Date(rows[i][dateCol]);
    if (Number.isNaN(at.getTime())) continue;
    const body = clean(textCol >= 0 ? rows[i][textCol] : '');
    const title = titleCol >= 0 ? rows[i][titleCol] : firstLine(body);
    if (!body && !title) continue;
    out.push({
      id: `csv-${at.getTime()}-${i}`,
      at: at.toISOString(), day: dayKeyOf(at), kind: 'note',
      label: title || null, title: title || 'An entry', placard: body,
      photo: null, tags: [], imported: 'CSV', kept: true,
    });
  }
  return out;
}

/** A CSV splitter that copes with quotes and embedded newlines. */
export function splitCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = String(text || '').replace(/\r\n/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ''));
}

/* ------------------------------------------------------------------ *
 * the whole job
 * ------------------------------------------------------------------ */

/**
 * Read whatever the person dropped in and hand back moments ready to keep.
 * @returns {Promise<{format, moments, photos, skipped, years}>}
 */
export async function readExport(file) {
  const name = (file.name || '').toLowerCase();

  if (name.endsWith('.zip')) {
    const files = await readZip(await file.arrayBuffer());
    let jsonName = [...files.keys()].find((f) => /journal\.json$/i.test(f))
      || [...files.keys()].find((f) => f.toLowerCase().endsWith('.json'));
    if (!jsonName) throw new Error('NO_JOURNAL_IN_ZIP');
    const parsed = JSON.parse(asText(files.get(jsonName)));
    const format = detectFormat(parsed) || 'json';
    const moments = format === 'dayone' ? parseDayOne(parsed, files)
      : format === 'journey' ? parseJourney(parsed)
        : parseGenericJson(parsed);
    return summarise(format, moments);
  }

  const text = await file.text();
  if (name.endsWith('.csv')) return summarise('csv', parseCsv(text));

  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('UNREADABLE'); }
  const format = detectFormat(parsed);
  if (!format) throw new Error('UNKNOWN_FORMAT');
  if (format === 'curio') return summarise('curio', parsed.moments || []);
  const moments = format === 'dayone' ? parseDayOne(parsed)
    : format === 'journey' ? parseJourney(parsed)
      : parseGenericJson(parsed);
  return summarise(format, moments);
}

function summarise(format, moments) {
  const years = [...new Set(moments.map((m) => String(m.day || '').slice(0, 4)).filter(Boolean))].sort();
  return {
    format,
    moments,
    photos: moments.filter((m) => m.photo).length,
    years,
    span: years.length ? `${years[0]}\u2013${years[years.length - 1]}` : null,
  };
}

/**
 * Give an imported entry the shape of a Curio moment, without pretending Curio
 * wrote it. `imported` is kept so the archive stays honest about where a
 * memory came from.
 */
export function toMoment(entry, index = 0) {
  const year = String(entry.day || '').slice(0, 4) || new Date().getFullYear();
  return {
    id: entry.id,
    accession: `${year}.${1000 + index}`,
    kind: entry.kind || 'note',
    at: entry.at,
    day: entry.day,
    label: entry.label,
    title: entry.title,
    placard: entry.placard,
    provenance: `${entry.imported || 'Imported'} \u00b7 ${new Date(entry.at)
      .toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    photo: entry.photo || null,
    tags: entry.tags || [],
    imported: entry.imported || 'Imported',
    editedAt: new Date().toISOString(),
    kept: true,
  };
}
