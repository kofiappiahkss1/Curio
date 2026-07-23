/**
 * Curio — storage.
 *
 * Voice notes and photos are the only things here that grow without bound, and
 * a diary that quietly fills a phone is a diary people delete. So Curio
 * measures itself honestly, shows the person where the weight actually is, and
 * offers to reclaim it without losing a single word.
 *
 * Nothing in this file is destructive on its own: prose, moods, dates and
 * titles are never touched. Only the heavy attachments are ever changed, and
 * only when asked.
 */

export const KB = 1024;
export const MB = 1024 * 1024;

/** Quality tiers for recording. Bitrate is the only lever that really matters. */
export const AUDIO_QUALITY = {
  small:    { bitrate: 16000, label: 'small',    perMinute: 120 * KB },
  balanced: { bitrate: 24000, label: 'balanced', perMinute: 180 * KB },
  clear:    { bitrate: 40000, label: 'clear',    perMinute: 300 * KB },
};
export const DEFAULT_AUDIO_QUALITY = 'balanced';

export const PHOTO_QUALITY = {
  small:    { maxDim: 900,  quality: 0.7 },
  balanced: { maxDim: 1200, quality: 0.82 },
  clear:    { maxDim: 1800, quality: 0.9 },
};
export const DEFAULT_PHOTO_QUALITY = 'balanced';

/* ------------------------------------------------------------------ *
 * measuring
 * ------------------------------------------------------------------ */

/** Real byte size of a data URL, without decoding it. */
export function dataUrlBytes(url) {
  if (typeof url !== 'string') return 0;
  const comma = url.indexOf(',');
  if (comma < 0) return url.length;
  const body = url.length - comma - 1;
  // base64 carries 3 bytes per 4 characters, minus padding
  const padding = url.endsWith('==') ? 2 : url.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((body * 3) / 4) - padding);
}

const textBytes = (m) =>
  [m.title, m.placard, m.provenance, m.label, m.accession]
    .filter(Boolean)
    .reduce((a, s) => a + new TextEncoder().encode(String(s)).length, 0) + 80; // + record overhead

/**
 * Where the archive's weight actually sits.
 * @returns {{total,photos,audio,text,counts,largest,audioSeconds}}
 */
export function measure(moments = []) {
  let photos = 0, audio = 0, text = 0, audioSeconds = 0;
  const counts = { photos: 0, audio: 0, moments: moments.length };
  const sized = [];

  for (const m of moments) {
    const p = m.photo ? dataUrlBytes(m.photo) : 0;
    const a = m.audio ? dataUrlBytes(m.audio) : 0;
    const t = textBytes(m);
    photos += p; audio += a; text += t;
    if (p) counts.photos++;
    if (a) { counts.audio++; audioSeconds += m.audioSeconds || 0; }
    if (p || a) sized.push({ id: m.id, day: m.day, title: m.title, bytes: p + a, photo: !!p, audio: !!a });
  }

  sized.sort((x, y) => y.bytes - x.bytes);
  return {
    total: photos + audio + text,
    photos, audio, text,
    counts,
    audioSeconds: Math.round(audioSeconds),
    largest: sized.slice(0, 8),
  };
}

/** Plain-English size. */
export function humanBytes(n) {
  if (!n || n < 0) return '0 KB';
  if (n < KB) return `${n} B`;
  if (n < MB) return `${(n / KB).toFixed(0)} KB`;
  if (n < 1024 * MB) return `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;
  return `${(n / (1024 * MB)).toFixed(1)} GB`;
}

/**
 * How fast the archive is growing, and how long the phone can carry it.
 * Uses the real spread of the archive rather than guessing.
 */
export function projection(moments = [], quotaBytes = 0, now = new Date()) {
  const kept = moments.filter((m) => m.kept !== false);
  if (kept.length < 2) return { perDay: 0, perYear: 0, daysLeft: null, spanDays: 0 };

  const times = kept.map((m) => new Date(m.at).getTime()).sort((a, b) => a - b);
  const spanDays = Math.max(1, (times[times.length - 1] - times[0]) / 86400000);
  const { total } = measure(kept);
  const perDay = total / spanDays;
  const used = total;
  const free = quotaBytes ? Math.max(0, quotaBytes - used) : 0;

  return {
    perDay,
    perYear: perDay * 365,
    spanDays: Math.round(spanDays),
    daysLeft: quotaBytes && perDay > 0 ? Math.floor(free / perDay) : null,
  };
}

/** Where the archive sits against the device's allowance. */
export function pressure(usedBytes, quotaBytes) {
  if (!quotaBytes) return { level: 'unknown', ratio: 0 };
  const ratio = usedBytes / quotaBytes;
  const level = ratio >= 0.9 ? 'critical' : ratio >= 0.7 ? 'high' : ratio >= 0.4 ? 'moderate' : 'comfortable';
  return { level, ratio };
}

/* ------------------------------------------------------------------ *
 * advice — always specific, always reversible-by-choice
 * ------------------------------------------------------------------ */
export function suggestions(m, quotaBytes = 0, opts = {}) {
  const out = [];
  const { level } = pressure(m.total, quotaBytes);

  if (m.photos > 4 * MB && m.counts.photos > 4) {
    out.push({
      key: 'shrinkPhotos',
      saves: Math.round(m.photos * 0.45),          // measured against the small tier
      count: m.counts.photos,
    });
  }
  if (m.audio > 8 * MB && m.counts.audio > 3) {
    out.push({
      key: 'trimAudio',
      saves: Math.round(m.audio * 0.6),
      count: m.counts.audio,
      olderThanDays: opts.olderThanDays ?? 180,
    });
  }
  if (level === 'critical' || level === 'high') {
    out.push({ key: 'exportAndClear', saves: m.photos + m.audio, count: m.counts.moments });
  }
  return out;
}

/** Which moments carry audio older than a cutoff — the trim candidates. */
export function audioOlderThan(moments, days, now = new Date()) {
  const cutoff = now.getTime() - days * 86400000;
  return moments.filter((m) => m.audio && new Date(m.at).getTime() < cutoff);
}

/* ------------------------------------------------------------------ *
 * re-compression (browser only — needs a canvas)
 * ------------------------------------------------------------------ */

/**
 * Redraw a stored photo smaller. Returns the original untouched if the result
 * would be no better, so this can never make an archive bigger.
 */
export function recompressPhoto(dataUrl, { maxDim = 900, quality = 0.7 } = {}) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !dataUrl) return resolve(dataUrl);
    const img = new Image();
    img.onload = () => {
      try {
        let { width: w, height: h } = img;
        if (w > maxDim || h > maxDim) {
          const r = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        const out = c.toDataURL('image/jpeg', quality);
        resolve(dataUrlBytes(out) < dataUrlBytes(dataUrl) ? out : dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Walk the archive shrinking photos, reporting progress so a long job can show
 * something honest rather than a frozen screen.
 */
export async function shrinkAllPhotos(moments, put, { tier = 'small', onProgress } = {}) {
  const cfg = PHOTO_QUALITY[tier] || PHOTO_QUALITY.small;
  const withPhotos = moments.filter((m) => m.photo);
  let saved = 0, done = 0;

  for (const m of withPhotos) {
    const before = dataUrlBytes(m.photo);
    const next = await recompressPhoto(m.photo, cfg);
    const after = dataUrlBytes(next);
    if (after < before) {
      await put({ ...m, photo: next, editedAt: new Date().toISOString() });
      saved += before - after;
    }
    done++;
    onProgress?.(done, withPhotos.length, saved);
  }
  return { saved, processed: withPhotos.length };
}

/**
 * Drop the audio from older moments while keeping every word of the placard,
 * the mood, the date and the photo. The diary stays complete; only the
 * recording goes.
 */
export async function dropOldAudio(moments, put, { days = 180, onProgress } = {}) {
  const targets = audioOlderThan(moments, days);
  let saved = 0, done = 0;
  for (const m of targets) {
    saved += dataUrlBytes(m.audio);
    const next = { ...m, audio: null, audioDropped: true, editedAt: new Date().toISOString() };
    delete next.audio;
    next.audio = null;
    await put(next);
    done++;
    onProgress?.(done, targets.length, saved);
  }
  return { saved, processed: targets.length };
}
