/**
 * Curio — Recovery Kits.
 *
 * The answer to "what if I lose my phone?" without inventing a server.
 *
 * Three levels, strongest first:
 *   1. LIVE FOLDER  — you pick a folder once (ideally one your cloud already
 *                     syncs, like Google Drive or OneDrive). Curio rewrites an
 *                     encrypted kit there automatically as you go. Nothing to
 *                     remember. Supported by Chrome/Edge on Android and desktop.
 *   2. SAVED KIT    — a single encrypted file you download and keep wherever you
 *                     like: your cloud, an email to yourself, a USB stick.
 *                     Works everywhere, including iPhone.
 *   3. NUDGES       — if neither is set up, Curio reminds you before the gap
 *                     gets dangerous, because a diary that vanishes is worse
 *                     than no diary.
 *
 * On any new device: Restore -> choose the kit -> passphrase -> everything back.
 */
import { seal, unseal, peek } from './crypto.js';
import * as store from './store.js';

const HANDLE_KEY = 'backupFolderHandle';
const META_KEY = 'backupMeta';
export const NUDGE_AFTER_MOMENTS = 12;
export const NUDGE_AFTER_DAYS = 7;

export const canUseLiveFolder = () =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

const fileName = () => `curio-recovery-${new Date().toISOString().slice(0, 10)}.curiokit`;

/* ------------------------------------------------------------------ */
/* backup state                                                        */
/* ------------------------------------------------------------------ */
export async function getMeta() {
  return (await store.getMeta(META_KEY, null)) || {
    lastBackupAt: null, lastBackupCount: 0, method: null, folderName: null, fingerprint: null,
  };
}

async function setBackupMeta(patch) {
  const meta = { ...(await getMeta()), ...patch };
  await store.setMeta(META_KEY, meta);
  return meta;
}

/** Should we warn the person that their archive is exposed? */
export async function backupStatus(momentCount) {
  const meta = await getMeta();
  if (!meta.lastBackupAt) {
    return { level: momentCount >= 3 ? 'urgent' : 'none', unbacked: momentCount, meta };
  }
  const days = Math.floor((Date.now() - new Date(meta.lastBackupAt).getTime()) / 86400000);
  const unbacked = Math.max(0, momentCount - (meta.lastBackupCount || 0));
  let level = 'ok';
  if (unbacked >= NUDGE_AFTER_MOMENTS || days >= NUDGE_AFTER_DAYS) level = 'due';
  if (unbacked >= NUDGE_AFTER_MOMENTS * 2 || days >= NUDGE_AFTER_DAYS * 3) level = 'urgent';
  return { level, unbacked, days, meta };
}

/* ------------------------------------------------------------------ */
/* 1 — live folder (automatic)                                         */
/* ------------------------------------------------------------------ */
export async function chooseFolder() {
  if (!canUseLiveFolder()) throw new Error('UNSUPPORTED');
  const handle = await window.showDirectoryPicker({ id: 'curio-backup', mode: 'readwrite' });
  await store.setMeta(HANDLE_KEY, handle);            // IndexedDB can store handles
  await setBackupMeta({ method: 'folder', folderName: handle.name });
  return handle.name;
}

async function getFolder() {
  const handle = await store.getMeta(HANDLE_KEY, null);
  if (!handle) return null;
  if (handle.queryPermission) {
    let p = await handle.queryPermission({ mode: 'readwrite' });
    if (p === 'prompt') p = await handle.requestPermission({ mode: 'readwrite' });
    if (p !== 'granted') return null;
  }
  return handle;
}

export async function forgetFolder() {
  await store.setMeta(HANDLE_KEY, null);
  await setBackupMeta({ method: null, folderName: null });
}

/** Write the kit into the chosen folder. Silent, automatic, no download prompt. */
async function writeToFolder(kitJson) {
  const dir = await getFolder();
  if (!dir) return false;
  const file = await dir.getFileHandle('curio-recovery.curiokit', { create: true });
  const w = await file.createWritable();
  await w.write(kitJson);
  await w.close();
  return true;
}

/* ------------------------------------------------------------------ */
/* making a kit                                                        */
/* ------------------------------------------------------------------ */
export async function buildArchive() {
  const [moments, vault, locale, withheld, settings] = await Promise.all([
    store.allMoments(),
    store.getMeta('vault', null),
    store.getMeta('locale', 'en-GB'),
    store.getMeta('withheld', {}),
    store.getMeta('settings', {}),
  ]);
  return {
    product: 'Curio',
    kind: 'archive',
    version: 2,
    exported: new Date().toISOString(),
    device: deviceName(),
    moments, vault, locale, withheld, settings,
  };
}

export function deviceName() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/iPhone/i.test(ua)) return 'an iPhone';
  if (/iPad/i.test(ua)) return 'an iPad';
  if (/Android/i.test(ua)) return 'an Android phone';
  if (/Mac/i.test(ua)) return 'a Mac';
  if (/Windows/i.test(ua)) return 'a Windows PC';
  return 'a device';
}

/**
 * Create a Recovery Kit and put it wherever the person has chosen.
 * Returns { method, name } describing what happened.
 */
export async function backupNow(passphrase, { download = false } = {}) {
  const archive = await buildArchive();
  const kit = await seal(archive, passphrase);
  const json = JSON.stringify(kit);

  let method = 'download';
  if (!download && (await getFolder())) {
    if (await writeToFolder(json)) method = 'folder';
  }
  if (method === 'download') triggerDownload(json, fileName());

  await setBackupMeta({
    lastBackupAt: new Date().toISOString(),
    lastBackupCount: archive.moments.length,
    method: method === 'folder' ? 'folder' : 'file',
  });
  return { method, count: archive.moments.length };
}

/** Quietly refresh the folder copy after a new moment — no prompts, no downloads. */
export async function autoBackup(passphrase) {
  if (!passphrase) return false;
  if (!(await getFolder())) return false;
  const archive = await buildArchive();
  const kit = await seal(archive, passphrase);
  const ok = await writeToFolder(JSON.stringify(kit));
  if (ok) {
    await setBackupMeta({
      lastBackupAt: new Date().toISOString(),
      lastBackupCount: archive.moments.length,
      method: 'folder',
    });
  }
  return ok;
}

function triggerDownload(text, name) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ------------------------------------------------------------------ */
/* restoring on a new device                                           */
/* ------------------------------------------------------------------ */
export async function inspectKitFile(file) {
  const text = await file.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('NOT_A_KIT'); }
  // A plain (unencrypted) export is also accepted, so nobody is ever locked out.
  if (parsed.product === 'Curio' && Array.isArray(parsed.moments))
    return { encrypted: false, parsed, hint: { moments: parsed.moments.length, created: parsed.exported } };
  const hint = peek(parsed);
  if (!hint) throw new Error('NOT_A_KIT');
  return { encrypted: true, parsed, hint };
}

/**
 * Merge a kit into this device. Existing moments are kept; same-id moments are
 * de-duplicated, keeping whichever was edited last. So restoring twice is safe,
 * and two devices can be merged into one archive.
 */
export async function restore(parsed, passphrase, { merge = true } = {}) {
  const archive = passphrase ? await unseal(parsed, passphrase) : parsed;
  if (!Array.isArray(archive.moments)) throw new Error('NOT_A_KIT');

  const existing = merge ? await store.allMoments() : [];
  if (!merge) await store.clearAll();

  const byId = new Map(existing.map((m) => [m.id, m]));
  let added = 0, updated = 0;
  for (const m of archive.moments) {
    const prev = byId.get(m.id);
    if (!prev) { await store.putMoment(m); added++; continue; }
    const a = new Date(m.editedAt || m.at).getTime();
    const b = new Date(prev.editedAt || prev.at).getTime();
    if (a >= b) { await store.putMoment(m); updated++; }
  }

  if (archive.vault) await store.setMeta('vault', archive.vault);
  if (archive.locale) await store.setMeta('locale', archive.locale);
  if (archive.settings) await store.setMeta('settings', archive.settings);
  if (archive.withheld) {
    const mine = (await store.getMeta('withheld', {})) || {};
    await store.setMeta('withheld', { ...archive.withheld, ...mine });
  }
  await store.setMeta('onboarded', true);

  await setBackupMeta({
    lastBackupAt: new Date().toISOString(),
    lastBackupCount: (await store.allMoments()).length,
  });
  return { added, updated, total: archive.moments.length };
}

/** Plain, unencrypted export — for people who'd rather keep their own copy in the open. */
export async function plainExport() {
  const archive = await buildArchive();
  triggerDownload(JSON.stringify(archive, null, 2), `curio-archive-${new Date().toISOString().slice(0, 10)}.json`);
  await setBackupMeta({
    lastBackupAt: new Date().toISOString(),
    lastBackupCount: archive.moments.length,
    method: 'file',
  });
  return archive.moments.length;
}

/** Human-readable Markdown, so the archive outlives Curio itself. */
export async function markdownExport(composeDayFn, locale) {
  const archive = await buildArchive();
  const byDay = new Map();
  for (const m of archive.moments.filter((x) => x.kept !== false)) {
    if (!byDay.has(m.day)) byDay.set(m.day, []);
    byDay.get(m.day).push(m);
  }
  const days = [...byDay.keys()].sort().reverse();
  let out = `# Curio\n\nA private museum of ordinary days.\n\n`;
  for (const d of days) {
    const moments = byDay.get(d);
    const day = composeDayFn ? composeDayFn(d, moments, 0, locale) : { title: d, subtitle: '' };
    out += `\n## ${d} — ${day.title}\n\n_${day.subtitle}_\n\n`;
    for (const m of moments) {
      const t = new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      out += `**${t} · ${m.title}**\n\n${m.placard}\n\n`;
      if (m.mood) out += `Mood: ${m.mood}/5\n\n`;
    }
  }
  triggerDownload(out, `curio-diary-${new Date().toISOString().slice(0, 10)}.md`);
  return days.length;
}

/* ------------------------------------------------------------------ *
 * SYNC — two-way, through a folder you already own
 * ------------------------------------------------------------------ *
 * There is no Curio server, so there is no Curio sync service. What there is
 * instead: point two devices at the same folder that your own cloud already
 * keeps in step — Google Drive, OneDrive, Dropbox, iCloud Drive on a Mac — and
 * Curio reads that folder when it opens and writes back when you keep
 * something. Both devices converge, and nothing passes through anyone else.
 *
 * Merging is by moment id, keeping whichever copy was edited last, so the two
 * devices can be used independently and still end up agreeing.
 * ------------------------------------------------------------------ */

const SYNC_FILE = 'curio-recovery.curiokit';

/** Read the kit sitting in the chosen folder, if there is one. */
async function readFolderKit() {
  const dir = await getFolder();
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(SYNC_FILE, { create: false });
    const file = await handle.getFile();
    const text = await file.text();
    return { parsed: JSON.parse(text), modified: file.lastModified };
  } catch {
    return null;                      // nothing there yet, which is fine
  }
}

/**
 * Pull anything new from the folder, merge it in, then push the combined
 * archive back. Safe to call on every launch.
 *
 * @returns {Promise<{status:string, pulled?:number, pushed?:number}>}
 */
export async function syncNow(passphrase) {
  if (!(await getFolder())) return { status: 'no-folder' };
  if (!passphrase) return { status: 'no-passphrase' };

  let pulled = 0;
  const remote = await readFolderKit();

  if (remote) {
    try {
      const theirs = await unseal(remote.parsed, passphrase);
      if (Array.isArray(theirs.moments)) {
        const mine = await store.allMoments();
        const byId = new Map(mine.map((m) => [m.id, m]));
        for (const m of theirs.moments) {
          const prev = byId.get(m.id);
          if (!prev) { await store.putMoment(m); pulled++; continue; }
          const a = new Date(m.editedAt || m.at).getTime();
          const b = new Date(prev.editedAt || prev.at).getTime();
          if (a > b) { await store.putMoment(m); pulled++; }
        }
        // settings follow the most recently written device
        if (theirs.settings && remote.modified > (await lastPushAt())) {
          const mineSettings = (await store.getMeta('settings', {})) || {};
          await store.setMeta('settings', { ...theirs.settings, ...mineSettings });
        }
      }
    } catch (e) {
      if (e.message === 'WRONG_PASSPHRASE') return { status: 'wrong-passphrase' };
      return { status: 'unreadable' };
    }
  }

  const archive = await buildArchive();
  const kit = await seal(archive, passphrase);
  const ok = await writeToFolder(JSON.stringify(kit));
  if (!ok) return { status: 'write-failed', pulled };

  await setBackupMeta({
    lastBackupAt: new Date().toISOString(),
    lastBackupCount: archive.moments.length,
    method: 'folder',
    lastSyncAt: new Date().toISOString(),
  });
  return { status: 'ok', pulled, pushed: archive.moments.length };
}

async function lastPushAt() {
  const meta = await getMeta();
  return meta.lastSyncAt ? new Date(meta.lastSyncAt).getTime() : 0;
}

/** Is two-way sync actually set up on this device? */
export async function syncEnabled() {
  return !!(await getFolder());
}

/**
 * Plain-language description of what sync can do on this browser, so the UI
 * never over-promises.
 */
export function syncCapability() {
  if (canUseLiveFolder()) return 'folder';       // Chrome/Edge: real two-way sync
  return 'manual';                                // Safari/iOS: Recovery Kits by hand
}
