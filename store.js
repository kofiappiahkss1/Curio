/**
 * Local storage for Curio — IndexedDB, on the phone, nothing else.
 *
 * There is no account, no sync, no server. If the phone is yours, so is the
 * archive. Photos are stored as data URLs in the same local database, so an
 * exported archive is complete and a lost phone leaks nothing to a network.
 */

const DB_NAME = 'curio';
const DB_VERSION = 1;
const MOMENTS = 'moments';
const META = 'meta';

let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MOMENTS)) {
        const s = db.createObjectStore(MOMENTS, { keyPath: 'id' });
        s.createIndex('day', 'day');
        s.createIndex('at', 'at');
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try { out = fn(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

/* ---------------- moments ---------------- */
export const putMoment = (m) => tx(MOMENTS, 'readwrite', (s) => s.put(m));

export const allMoments = () =>
  tx(MOMENTS, 'readonly', (s) => s.getAll()).then((r) =>
    (r || []).sort((a, b) => new Date(a.at) - new Date(b.at)));

export const getMoment = (id) => tx(MOMENTS, 'readonly', (s) => s.get(id));

export async function forgetMoment(id) {
  const m = await getMoment(id);
  if (!m) return null;
  m.kept = false;
  await putMoment(m);
  return m;
}

export const deleteMoment = (id) => tx(MOMENTS, 'readwrite', (s) => s.delete(id));

export const clearAll = () => tx(MOMENTS, 'readwrite', (s) => s.clear());

/* ---------------- meta (vault, counters) ---------------- */
export const getMeta = (key, fallback = null) =>
  tx(META, 'readonly', (s) => s.get(key)).then((r) => (r ? r.value : fallback));

export const setMeta = (key, value) =>
  tx(META, 'readwrite', (s) => s.put({ key, value }));

export async function bumpWithheld(day) {
  const all = (await getMeta('withheld', {})) || {};
  all[day] = (all[day] || 0) + 1;
  await setMeta('withheld', all);
  return all[day];
}

export const getWithheld = async (day) =>
  ((await getMeta('withheld', {})) || {})[day] || 0;

/* ---------------- import ---------------- */
export async function importArchive(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || !Array.isArray(data.moments)) throw new Error('Not a Curio archive.');
  for (const m of data.moments) await putMoment(m);
  if (data.vault) await setMeta('vault', data.vault);
  return data.moments.length;
}

/** Rough storage usage, for the vault screen. */
export async function usage() {
  if (navigator.storage?.estimate) {
    const e = await navigator.storage.estimate();
    return { used: e.usage || 0, quota: e.quota || 0 };
  }
  return { used: 0, quota: 0 };
}

/** Ask the browser to keep this data even under storage pressure. */
export async function persist() {
  if (navigator.storage?.persist) return navigator.storage.persist();
  return false;
}
