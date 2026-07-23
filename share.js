/**
 * Curio — the share engine.
 *
 * The quiet growth loop: a placard is a small, beautiful, self-contained thing.
 * People want to show them. This renders one (or a whole day) to an image on
 * the device — no server, no upload — and hands it to the phone's share sheet.
 *
 * Nothing private leaves unless the person deliberately shares it, and what
 * gets shared is only what they can see on the card.
 */

const DUSK = '#1d1a2b';
const DUSK_HI = '#2f2a42';
const IVORY = '#f2ebdb';
const INK = '#2a2118';
const INK_SOFT = '#6d6350';
const BRASS = '#c9a24b';

const SERIF = '"Georgia","Times New Roman",serif';
const MONO = '"SF Mono","Menlo","Consolas",monospace';

/** Wrap text to a width, returning the lines. */
function wrap(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Render a single moment as a shareable card.
 * @returns {Promise<Blob>} a PNG
 */
export async function renderMoment(moment, { locale = 'en-GB', tag = 'Curio', rtl = false } = {}) {
  const W = 1080, H = 1350;                 // portrait, the shape every feed likes
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.textBaseline = 'top';
  if (rtl) ctx.direction = 'rtl';

  // ---- backdrop: a lit gallery wall ----
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, DUSK_HI); g.addColorStop(0.55, DUSK); g.addColorStop(1, '#16131f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.3, H * 0.18, 0, W * 0.3, H * 0.18, W * 0.75);
  glow.addColorStop(0, 'rgba(201,162,75,.16)'); glow.addColorStop(1, 'rgba(201,162,75,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  const M = 82;                              // margin
  let y = 96;

  // ---- photo, if there is one ----
  let photoH = 0;
  if (moment.photo) {
    try {
      const img = await loadImage(moment.photo);
      photoH = 560;
      const ratio = Math.max((W - M * 2) / img.width, photoH / img.height);
      const dw = img.width * ratio, dh = img.height * ratio;
      ctx.save();
      roundRect(ctx, M, y, W - M * 2, photoH, 26);
      ctx.clip();
      ctx.drawImage(img, M + ((W - M * 2) - dw) / 2, y + (photoH - dh) / 2, dw, dh);
      ctx.restore();
      y += photoH + 44;
    } catch { photoH = 0; }
  }

  // ---- the placard itself ----
  ctx.font = `500 44px ${SERIF}`;
  const titleLines = wrap(ctx, moment.title, W - M * 2 - 76);
  ctx.font = `32px ${SERIF}`;
  const bodyLines = wrap(ctx, moment.placard, W - M * 2 - 76);

  const cardH = 44 + titleLines.length * 56 + 16 + bodyLines.length * 46 + 52;
  const cardY = photoH ? y : Math.max(y, (H - cardH) / 2 - 40);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 46; ctx.shadowOffsetY = 20;
  ctx.fillStyle = IVORY;
  roundRect(ctx, M, cardY, W - M * 2, cardH, 24);
  ctx.fill();
  ctx.restore();

  let ty = cardY + 40;
  const tx = rtl ? W - M - 38 : M + 38;
  ctx.textAlign = rtl ? 'right' : 'left';

  // accession + time line
  ctx.font = `600 20px ${MONO}`;
  ctx.fillStyle = INK_SOFT;
  const stamp = [moment.accession, timeOf(moment.at, locale)].filter(Boolean).join('   ·   ');
  ctx.fillText(stamp.toUpperCase(), tx, ty);
  ty += 42;

  ctx.font = `500 44px ${SERIF}`;
  ctx.fillStyle = INK;
  for (const l of titleLines) { ctx.fillText(l, tx, ty); ty += 56; }

  ty += 12;
  ctx.font = `32px ${SERIF}`;
  ctx.fillStyle = '#4a4234';
  for (const l of bodyLines) { ctx.fillText(l, tx, ty); ty += 46; }

  // ---- wordmark ----
  ctx.textAlign = 'center';
  ctx.font = `500 40px ${SERIF}`;
  ctx.fillStyle = IVORY;
  ctx.fillText('Curio', W / 2, H - 138);
  ctx.font = `600 19px ${MONO}`;
  ctx.fillStyle = BRASS;
  ctx.fillText('A DIARY THAT WRITES ITSELF', W / 2, H - 84);

  return toBlob(c);
}

/** Render a whole day as one card — several placards stacked. */
export async function renderDay(day, moments, { locale = 'en-GB', rtl = false } = {}) {
  const W = 1080;
  const items = moments.slice(0, 5);
  const measure = document.createElement('canvas').getContext('2d');

  const M = 82;
  const blocks = items.map((m) => {
    measure.font = `500 38px ${SERIF}`;
    const t = wrap(measure, m.title, W - M * 2 - 64);
    measure.font = `28px ${SERIF}`;
    const b = wrap(measure, m.placard, W - M * 2 - 64);
    return { m, t, b, h: 34 + t.length * 48 + 10 + b.length * 40 + 34 };
  });

  const headerH = 300;
  const H = Math.max(1350, headerH + blocks.reduce((a, x) => a + x.h + 18, 0) + 190);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.textBaseline = 'top';
  if (rtl) ctx.direction = 'rtl';

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, DUSK_HI); g.addColorStop(0.5, DUSK); g.addColorStop(1, '#16131f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.7, 120, 0, W * 0.7, 120, W);
  glow.addColorStop(0, 'rgba(184,129,126,.14)'); glow.addColorStop(1, 'rgba(184,129,126,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  ctx.textAlign = rtl ? 'right' : 'left';
  const hx = rtl ? W - M : M;

  ctx.font = `600 22px ${MONO}`;
  ctx.fillStyle = BRASS;
  ctx.fillText(dateOf(day.day, locale).toUpperCase(), hx, 110);

  ctx.font = `500 62px ${SERIF}`;
  ctx.fillStyle = IVORY;
  const tl = wrap(ctx, day.title, W - M * 2);
  let hy = 158;
  for (const l of tl.slice(0, 2)) { ctx.fillText(l, hx, hy); hy += 74; }

  ctx.font = `italic 30px ${SERIF}`;
  ctx.fillStyle = 'rgba(242,235,219,.6)';
  ctx.fillText(day.subtitle || '', hx, hy + 4);

  let y = headerH;
  for (const blk of blocks) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 34; ctx.shadowOffsetY = 14;
    ctx.fillStyle = IVORY;
    roundRect(ctx, M, y, W - M * 2, blk.h, 20);
    ctx.fill();
    ctx.restore();

    let ty = y + 30;
    const tx = rtl ? W - M - 32 : M + 32;
    ctx.font = `600 18px ${MONO}`;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(timeOf(blk.m.at, locale), tx, ty);
    ty += 32;
    ctx.font = `500 38px ${SERIF}`;
    ctx.fillStyle = INK;
    for (const l of blk.t) { ctx.fillText(l, tx, ty); ty += 48; }
    ty += 8;
    ctx.font = `28px ${SERIF}`;
    ctx.fillStyle = '#4a4234';
    for (const l of blk.b) { ctx.fillText(l, tx, ty); ty += 40; }

    y += blk.h + 18;
  }

  ctx.textAlign = 'center';
  ctx.font = `500 40px ${SERIF}`;
  ctx.fillStyle = IVORY;
  ctx.fillText('Curio', W / 2, H - 128);
  ctx.font = `600 19px ${MONO}`;
  ctx.fillStyle = BRASS;
  ctx.fillText('A DIARY THAT WRITES ITSELF', W / 2, H - 74);

  return toBlob(c);
}

/* ------------------------------------------------------------------ */
function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

function toBlob(canvas) {
  return new Promise((res) => {
    if (canvas.toBlob) canvas.toBlob((b) => res(b), 'image/png');
    else res(dataURLtoBlob(canvas.toDataURL('image/png')));
  });
}

function dataURLtoBlob(url) {
  const [head, body] = url.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

const timeOf = (at, locale) => {
  try { return new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
};
const dateOf = (day, locale) => {
  try {
    return new Date(day + 'T12:00:00').toLocaleDateString(locale,
      { weekday: 'long', day: 'numeric', month: 'long' });
  } catch { return day; }
};

/**
 * Hand the image to the phone's share sheet, or fall back to a download.
 * @returns 'shared' | 'saved' | 'cancelled'
 */
export async function shareImage(blob, filename = 'curio.png', text = '') {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'saved';
}
