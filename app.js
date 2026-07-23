/**
 * Curio — the app.
 * Everything runs locally. The only network use is the one-time download of
 * these files; afterwards it works with the radio off.
 */
import { compose, composeDay, weave, guard, dayKey, renumber, sources, SEALED,
         isLocked, visibleMoments, lockedMoments, nextCapsule, newlyOpened, capsuleOptions,
         onThisDay, echoes, streaks, yearGrid, stats, moodCorrelations, moodAverage } from './core.js';
import { LOCALES, getLocale, detectLocale, fill, plural } from './i18n.js';
import * as store from './store.js';
import * as backup from './backup.js';
import { strength, fingerprint } from './crypto.js';
import { renderMoment, renderDay, shareImage } from './share.js';
import { Recorder, Dictation, canRecord, canDictate, formatDuration, MAX_SECONDS } from './voice.js';
import * as history from './history.js';
import * as sizes from './storage.js';
import * as profile from './profile.js';
import * as holidays from './holidays.js';
import * as device from './device.js';
import { MeetingSession, writeUp, placardFor, fmtClock, digest } from './meeting.js';
import * as themes from './themes.js';
import { SearchIndex, highlight } from './search.js';
import * as book from './book.js';
import { withLock, LOCK_SYNC, LOCK_WRITE } from './locks.js';

/** Bumped with every release, and shown in the Vault so a stale cache is obvious. */
export const BUILD = '2026.07.23-14';

const $ = (id) => document.getElementById(id);
const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  today:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  archive:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 9v11"/></svg>',
  threads:'<svg viewBox="0 0 24 24"><path d="M6 4v10a4 4 0 0 0 8 0V6"/><circle cx="6" cy="19" r="1.6"/><circle cx="18" cy="6" r="1.6"/></svg>',
  vault:  '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  photo:  '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3.4"/><path d="M8 6l1.5-2h5L16 6"/></svg>',
  place:  '<svg viewBox="0 0 24 24"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  note:   '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
  meal:   '<svg viewBox="0 0 24 24"><path d="M6 3v8a2 2 0 0 0 4 0V3M8 11v10"/><path d="M17 3c-1.5 2-2 4-2 6s.7 2 2 2 2 0 2-2-.5-4-2-6zM17 11v10"/></svg>',
  person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></svg>',
  read:   '<svg viewBox="0 0 24 24"><path d="M4 5h7v15H4zM20 5h-7v15h7z"/></svg>',
  lock:   '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6z"/></svg>',
  key:    '<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v4M15 12v3"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v10H3z"/></svg>',
  bell:   '<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  share:  '<svg viewBox="0 0 24 24"><path d="M12 3v13M8 7l4-4 4 4"/><path d="M5 14v6h14v-6"/></svg>',
  down:   '<svg viewBox="0 0 24 24"><path d="M12 3v13M7 11l5 5 5-5M4 21h16"/></svg>',
  voice:  '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  hourglass:'<svg viewBox="0 0 24 24"><path d="M6 3h12M6 21h12M8 3v4l4 5 4-5V3M8 21v-4l4-5 4 5v4"/></svg>',
  sync:   '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.7L4 16"/><path d="M4 20v-4h4"/></svg>',
};
const FACES = { 1: '😔', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' };

/** A small, well-mannered haptic. Silent where unsupported. */
const tap = (ms = 8) => { try { navigator.vibrate?.(ms); } catch {} };

const state = { profile: { ...profile.EMPTY_PROFILE }, device: null, tab: 'today', moments: [], vault: null, withheld: {}, query: '',
                locale: 'en-GB', L: null, settings: {}, pass: null, kit: null };
let camStream = null, pendingPhoto = null, pendingMood = null, facing = 'environment';
let recorder = null, pendingAudio = null, dictation = null, pendingUnlock = null;
let meeting = null;
let reminderTimer = null;

/* ================================================================== */
/* boot                                                               */
/* ================================================================== */
async function boot() {
  state.locale = (await store.getMeta('locale', null)) || detectLocale();
  state.L = getLocale(state.locale);
  state.settings = (await store.getMeta('settings', {})) || {};
  themes.apply(state.settings.theme || themes.DEFAULT_THEME);
  themes.watchSystem(state.settings.theme, () => themes.apply(themes.SYSTEM));
  state.profile = { ...profile.EMPTY_PROFILE, ...((await store.getMeta('profile', null)) || {}) };
  if (!state.profile.country) {
    const found = profile.detectCountry();
    if (found.code) { state.profile.country = found.code; state.profile.countryHow = found.how; }
  }
  state.device = device.apply();
  device.watch((d) => { state.device = d; render(); });
  state.pass = state.settings.rememberPass ? await store.getMeta('pass', null) : null;
  applyDirection();

  state.vault = await store.getMeta('vault', null);
  if (!state.vault) {
    state.vault = sources(state.L).map((s) => ({ key: s.key, enabled: true }));
    await store.setMeta('vault', state.vault);
  }
  await refresh();
  wireChrome();

  if (state.settings.pin) { showLock(); return; }
  if (!(await store.getMeta('onboarded', false))) { showOnboarding(); return; }
  start();
}

function start() {
  renderTabs(); render(); handleShareTarget(); registerSW(); scheduleReminder();
  runSyncOnOpen();
  publishWidgetSnapshot();
  offerMeetingRecovery();
}

/** Pull anything a second device left in the shared folder. */
async function runSyncOnOpen() {
  if (!state.pass) return;
  try {
    const res = await withLock(LOCK_SYNC, () => backup.syncNow(state.pass));
    if (res.status === 'ok' && res.pulled > 0) {
      await refresh(); render();
      toast(fill(state.L.ui.syncPulled, { n: res.pulled }));
    } else if (res.status === 'wrong-passphrase') {
      toast(state.L.ui.syncWrongPass, true);
    }
  } catch { /* sync is a convenience, never a blocker */ }
}

let searchIndex = null;

async function refresh() {
  const all = renumber(await store.allMoments());
  // Capsules are simply not part of the archive until their date arrives —
  // not filtered at the edges, but genuinely absent from feed, search and patterns.
  state.all = all;
  state.moments = visibleMoments(all);
  state.withheld = (await store.getMeta('withheld', {})) || {};
  searchIndex = SearchIndex.build(state.moments);
}

function applyDirection() {
  document.documentElement.dir = state.L.dir;
  document.documentElement.lang = state.L.code;
  const t = $('tagline'); if (t) t.textContent = state.L.ui.tagline;
}

async function saveProfile(patch) {
  state.profile = { ...state.profile, ...patch };
  await store.setMeta('profile', state.profile);
}

async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await store.setMeta('settings', state.settings);
}

/* ================================================================== */
/* chrome                                                             */
/* ================================================================== */
function renderTabs() {
  const T = state.L.ui.tabs;
  $('tabs').innerHTML = ['today', 'archive', 'threads', 'vault'].map((id) => `
    <button class="tab ${state.tab === id ? 'active' : ''}" data-tab="${id}"
      aria-current="${state.tab === id ? 'page' : 'false'}">
      ${ICONS[id]}<span>${esc(T[id])}</span>
    </button>`).join('');
  $('tabs').insertAdjacentHTML('beforeend',
    `<div class="kbd-hint"><b>N</b> keep a moment<br><b>/</b> search<br><b>1–4</b> move around</div>`);
  $('tabs').querySelectorAll('.tab').forEach((b) =>
    b.onclick = () => { tap(); state.tab = b.dataset.tab; state.query = ''; renderTabs(); render(); $('body').scrollTop = 0; });
  $('tabs').style.display = ''; $('fab').style.display = '';
}

/* ------------------------------------------------------------------ *
 * connection state
 * ------------------------------------------------------------------ *
 * navigator.onLine only reports whether a network interface exists — a phone
 * on café wi-fi that never authenticated still reads "online". So Curio asks
 * the network a real question, with a parameter the service worker is told to
 * leave alone, otherwise the cache would answer and we would always look
 * connected. The badge reports what is actually true.
 * ------------------------------------------------------------------ */
let netState = null;

async function reachable({ timeout = 4000 } = {}) {
  if (!navigator.onLine) return false;          // a definite no is trustworthy
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    const res = await fetch(`./manifest.webmanifest?curio-ping=${Date.now()}`, {
      method: 'GET', cache: 'no-store', signal: ctrl?.signal,
    });
    if (t) clearTimeout(t);
    return res.ok;
  } catch {
    return false;                                // no answer means no internet
  }
}

function paintNet(on) {
  const dot = $('dot'), label = $('netlabel');
  if (!dot || !label) return;
  const U = state.L.ui;
  dot.className = 'seal-dot' + (on ? '' : ' off');
  label.textContent = on ? U.netOnline : U.netOffline;
  label.parentElement?.setAttribute('title', on ? U.netOnline : U.netOffline);
}

async function refreshNet() {
  const on = await reachable();
  if (on !== netState) { netState = on; paintNet(on); }
  return on;
}

function wireChrome() {
  $('fab').onclick = () => { tap(); openCaptureSheet(); };
  $('sheetbg').onclick = closeSheet;

  paintNet(navigator.onLine);                    // paint something immediately
  refreshNet();                                  // then confirm it for real

  // the browser's own events are the fastest signal; verify each one
  addEventListener('online', refreshNet);
  addEventListener('offline', () => { netState = false; paintNet(false); });

  // Re-check whenever the app comes back to the foreground. No polling: a timer
  // firing every half minute costs battery to tell us something the browser
  // already announces through its own events.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshNet();
  });

  // Keyboard shortcuts — this is a laptop app too.
  addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
    if (e.key === 'Escape') { closeSheet(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const jump = { 1: 'today', 2: 'archive', 3: 'threads', 4: 'vault' }[e.key];
    if (jump) { state.tab = jump; state.query = ''; renderTabs(); render(); return; }
    if (e.key === 'n' || e.key === '+') { e.preventDefault(); openCaptureSheet(); return; }
    if (e.key === '/') {
      e.preventDefault();
      state.tab = 'archive'; renderTabs(); render();
      setTimeout(() => $('q')?.focus(), 60);
    }
  });
}

let toastTimer;
function toast(msg, warn = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (warn ? ' warn' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 3000);
}

/* ================================================================== */
/* lock screen                                                        */
/* ================================================================== */
function showLock() {
  $('tabs').style.display = 'none'; $('fab').style.display = 'none';
  const U = state.L.ui;
  const scr = el(`<div class="lockscreen">
    <div class="emblem">${ICONS.lock}</div>
    <h2>${esc(U.lockEnter)}</h2>
    <input class="field" id="pin" type="password" inputmode="numeric" autocomplete="off">
    <div class="err" id="lerr"></div>
  </div>`);
  document.body.appendChild(scr);
  const inp = scr.querySelector('#pin');
  setTimeout(() => inp.focus(), 150);
  const tryPin = async () => {
    if (inp.value === state.settings.pin) {
      scr.remove();
      if (!(await store.getMeta('onboarded', false))) showOnboarding(); else start();
    } else {
      scr.querySelector('#lerr').textContent = U.lockWrong;
      inp.value = '';
    }
  };
  inp.onkeydown = (e) => { if (e.key === 'Enter') tryPin(); };
  inp.oninput = () => { if (inp.value.length >= (state.settings.pin || '').length) tryPin(); };
}

/* ================================================================== */
/* onboarding — now with a restore path for new devices                */
/* ================================================================== */
async function requestCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return 'unavailable';
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    s.getTracks().forEach((t) => t.stop());
    return 'granted';
  } catch { return 'denied'; }
}
function requestLocation() {
  return new Promise((res) => {
    if (!navigator.geolocation) return res('unavailable');
    navigator.geolocation.getCurrentPosition(() => res('granted'), () => res('denied'),
      { timeout: 10000, enableHighAccuracy: false });
  });
}
async function requestStorage() {
  if (!navigator.storage?.persist) return 'unavailable';
  return (await navigator.storage.persist()) ? 'granted' : 'denied';
}
const PERMS = [
  { key: 'camera', icon: 'photo', request: requestCamera },
  { key: 'photos', icon: 'archive', request: async () => 'granted' },
  { key: 'location', icon: 'place', request: requestLocation },
  { key: 'storage', icon: 'shield', request: requestStorage },
];

function showOnboarding() {
  $('tabs').style.display = 'none'; $('fab').style.display = 'none';
  const U = state.L.ui, P = U.perm;
  const langs = Object.keys(LOCALES).map((c) =>
    `<option value="${c}" ${c === state.locale ? 'selected' : ''}>${esc(LOCALES[c].name)}</option>`).join('');

  const v = el(`<div class="view">
    <div class="eyebrow">${esc(U.tagline)}</div>
    <div class="day-title">${esc(P.title)}</div>
    <div class="day-sub">${esc(P.body)}</div>

    <div class="rail-label">${esc(U.language)}</div>
    <select class="field select" id="lang">${langs}</select>

    <div class="rail-label" style="margin-top:20px">${esc(U.profile)}</div>
    <div class="hint" style="margin-bottom:12px">${esc(U.profileBody)}</div>
    <input class="field" id="obname" placeholder="${esc(U.yourNamePh)}" value="${esc(state.profile.name || '')}">
    <input class="field" id="obdob" type="date" value="${esc(state.profile.dob || '')}">
    ${state.profile.country ? `<div class="hint" style="margin:-4px 0 8px">${esc(holidays.countryName(state.profile.country))} · ${esc(U.countryDetected)}</div>` : ''}

    <div class="rail-label" style="margin-top:20px">${esc(U.permissionsLabel)}</div>
    ${PERMS.map((p) => `
      <div class="perm-row">
        <div class="perm-ic">${ICONS[p.icon]}</div>
        <div class="perm-tx"><span class="t">${esc(P[p.key + 'Title'])}</span>
          <span class="d">${esc(P[p.key + 'Body'])}</span></div>
        <button class="perm-btn" data-req="${p.key}">${esc(P.allow)}</button>
      </div>`).join('')}

    <button class="wide-btn primary" id="done" style="margin-top:20px">${esc(P.done)}</button>

    <div class="rail-label" style="margin-top:24px">${esc(U.restoreTitle)}</div>
    <div class="discard-note">${esc(U.restoreBody)}</div>
    <button class="wide-btn" id="restore">${esc(U.restoreBtn)}</button>
    <input type="file" id="kitfile" accept=".curiokit,application/json,.json" hidden>

    <div class="rail-label" style="margin-top:24px">${esc(U.sync)}</div>
    <div class="discard-note">${esc(U.syncBody)}</div>
    <div class="kitinfo" id="syncstate">…</div>
    ${backup.syncCapability() === 'folder'
      ? `<button class="wide-btn" id="syncnow">${esc(U.syncNow)}</button>`
      : `<div class="discard-note">${esc(U.syncManualOnly)}</div>`}

    <div class="rail-label" style="margin-top:24px">${esc(U.history)}</div>
    <div class="row"><div class="rl"><span class="t">${esc(U.history)}</span>
      <span class="d">${esc(U.historyOn)}</span></div>
      <div class="toggle ${state.settings.historyOff ? '' : 'on'}" id="histt" role="switch"></div></div>
    <div class="row"><div class="rl"><span class="t">${esc(U.historyOnline)}</span>
      <span class="d">${esc(U.historyOnlineBody)}</span></div>
      <div class="toggle ${state.settings.historyOnline ? 'on' : ''}" id="histnet" role="switch"></div></div>

    <div class="discard-note" style="margin-top:14px">${U.vaultSealBody}</div>
  </div>`);

  const b = $('body'); b.innerHTML = ''; b.appendChild(v);

  v.querySelector('#lang').onchange = async (e) => {
    state.locale = e.target.value; state.L = getLocale(state.locale);
    await store.setMeta('locale', state.locale);
    applyDirection(); showOnboarding();
  };
  v.querySelectorAll('[data-req]').forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = '…';
      const res = await PERMS.find((p) => p.key === btn.dataset.req).request();
      const P2 = state.L.ui.perm;
      btn.textContent = res === 'granted' ? P2.granted : res === 'denied' ? P2.denied : '—';
      btn.className = 'perm-btn ' + (res === 'granted' ? 'ok' : 'no');
    };
  });
  v.querySelector('#done').onclick = async () => {
    const nm = v.querySelector('#obname')?.value.trim();
    const db = v.querySelector('#obdob')?.value;
    if (nm || db) await saveProfile({ name: nm || '', dob: db || '' });
    await store.setMeta('onboarded', true); start();
  };
  const kf = v.querySelector('#kitfile');
  v.querySelector('#restore').onclick = () => kf.click();
  kf.onchange = (e) => handleKitFile(e.target.files[0]);
}

/* ================================================================== */
/* restore flow (shared by onboarding and the Vault)                   */
/* ================================================================== */
async function handleKitFile(file) {
  if (!file) return;
  const U = state.L.ui;
  try {
    const info = await backup.inspectKitFile(file);
    state.kit = info;
    if (!info.encrypted) { await doRestore(null); return; }
    openSheet(`
      <h3>${esc(U.restoreUnlock)}</h3>
      <div class="kitinfo">${esc(fill(U.restoreFound, {
        when: new Date(info.hint.created || Date.now()).toLocaleDateString(state.L.code),
        n: info.hint.moments ?? '?', from: info.hint.from || '—' }))}</div>
      <input class="field" id="pp" type="password" placeholder="${esc(U.passphrase)}">
      <div class="hint" style="margin-bottom:12px">${esc(U.restoreMerge)}</div>
      <div class="sheet-actions">
        <button id="cancel">${esc(U.cancel)}</button>
        <button class="primary" id="go">${esc(U.restoreUnlock)}</button>
      </div>`);
    const sheet = $('sheet');
    setTimeout(() => sheet.querySelector('#pp')?.focus(), 200);
    sheet.querySelector('#cancel').onclick = closeSheet;
    sheet.querySelector('#go').onclick = () => doRestore(sheet.querySelector('#pp').value);
  } catch {
    toast(U.restoreBad, true);
  }
}

async function doRestore(passphrase) {
  const U = state.L.ui;
  try {
    const res = await backup.restore(state.kit.parsed, passphrase, { merge: true });
    if (passphrase) {
      state.pass = passphrase;
      if (state.settings.rememberPass !== false) await store.setMeta('pass', passphrase);
    }
    state.locale = (await store.getMeta('locale', state.locale)) || state.locale;
    state.L = getLocale(state.locale);
    state.settings = (await store.getMeta('settings', {})) || {};
  themes.apply(state.settings.theme || themes.DEFAULT_THEME);
  themes.watchSystem(state.settings.theme, () => themes.apply(themes.SYSTEM));
  state.profile = { ...profile.EMPTY_PROFILE, ...((await store.getMeta('profile', null)) || {}) };
  if (!state.profile.country) {
    const found = profile.detectCountry();
    if (found.code) { state.profile.country = found.code; state.profile.countryHow = found.how; }
  }
  state.device = device.apply();
  device.watch((d) => { state.device = d; render(); });
    state.vault = await store.getMeta('vault', state.vault);
    applyDirection();
    await refresh();
    closeSheet();
    state.tab = 'today'; renderTabs(); render();
    toast(fill(U.restoreDone, { n: res.added + res.updated }));
  } catch (e) {
    toast(e.message === 'WRONG_PASSPHRASE' ? U.restoreWrong : U.restoreBad, true);
  }
}

/* ================================================================== */
/* views                                                              */
/* ================================================================== */
function render() {
  const b = $('body'); b.innerHTML = '';
  b.appendChild(({ today: viewToday, archive: viewArchive,
                   threads: viewThreads, vault: viewVault }[state.tab])());
}

const momentsFor = (day) => state.moments.filter((m) => m.day === day && m.kept !== false);

function cardHTML(m) {
  const L = state.L;
  const time = new Date(m.at).toLocaleTimeString(L.code, { hour: '2-digit', minute: '2-digit' });
  return `
  <div class="card" data-id="${esc(m.id)}">
    <div class="meta"><span class="acc">${esc(m.accession)}</span><span class="time">${time}</span></div>
    <h3>${esc(m.title)}${m.mood ? `<span class="moodchip">${FACES[m.mood]}</span>` : ''}</h3>
    <div class="placard">${esc(m.placard)}</div>
    ${m.photo ? `<img class="thumb" src="${m.photo}" alt="">` : ''}
    ${m.audio ? `<audio class="cardaudio" controls preload="none" src="${m.audio}"></audio>` : ''}
    <div class="tags"><span class="tag ${m.kind}">${esc(L.ui.kinds[m.kind]?.label || m.kind)}</span></div>
    <div class="expand"><div class="expand-inner">
      ${m.meeting ? `<div class="meetsum">${meetingSummaryHTML(m.meeting)}</div>` : ''}
      <div class="prov">${esc(m.provenance)}</div>
      <div class="acts">
        <button class="mini-btn" data-act="share">${esc(L.ui.share)}</button>
        <button class="mini-btn" data-act="close">${esc(L.ui.keep)}</button>
        <button class="mini-btn forget" data-act="forget">${esc(L.ui.forget)}</button>
      </div>
    </div></div>
  </div>`;
}

/** The meeting write-up, rendered inside its card. */
function meetingSummaryHTML(mt) {
  const M = state.L.ui.meeting;
  const d = mt.digest || {};
  const block = (title, items, box) => items?.length
    ? `<div class="msec"><span>${esc(title)}</span><ul>${items.slice(0, 5).map((x) =>
        `<li>${box ? '□ ' : ''}${esc(typeof x === 'string' ? x : x.text)}</li>`).join('')}</ul></div>` : '';
  return [
    mt.attendees ? `<div class="msec"><span>${esc(M.whoPh)}</span><p>${esc(mt.attendees)}</p></div>` : '',
    block(M.summary, d.summary),
    block(M.decisions, d.decisions),
    block(M.actions, d.actions, true),
    block(M.questions, d.questions),
    mt.notes?.trim() ? `<div class="msec"><span>${esc(M.notes)}</span><p>${esc(mt.notes.trim())}</p></div>` : '',
  ].join('');
}

function wireCards(root) {
  root.querySelectorAll('.card').forEach((c) => {
    c.onclick = (e) => {
      const act = e.target.dataset?.act;
      if (act === 'forget') {
        e.stopPropagation();
        store.forgetMoment(c.dataset.id).then(async () => {
          await refresh(); render(); toast(state.L.ui.toasts.forgotten);
        });
        return;
      }
      if (act === 'share') {
        e.stopPropagation();
        shareMoment(c.dataset.id);
        return;
      }
      if (act === 'close') { e.stopPropagation(); c.classList.remove('open'); return; }
      c.classList.toggle('open');
    };
  });
}

/* ---------------- TODAY ---------------- */
function viewToday() {
  const L = state.L, U = L.ui;
  const today = dayKey(new Date());
  const mine = momentsFor(today);
  const withheld = state.withheld[today] || 0;
  const day = composeDay(today, mine, withheld, L);
  const featured = mine[0];
  const sk = streaks(state.moments);
  const otd = onThisDay(state.moments);
  const ech = otd.length ? [] : echoes(state.moments);

  const P = state.profile;
  const bdayMine = profile.nextBirthday(P.dob);
  const bdaysToday = profile.birthdaysToday(P.people || []);
  const bdaysSoon = profile.birthdaysUpcoming(P.people || [], new Date(), 14);
  const holToday = P.country && !state.settings.holidaysOff ? holidays.forDate(P.country) : [];
  const holNext = P.country && !state.settings.holidaysOff ? holidays.next(P.country) : null;
  const greetKey = profile.greetingKey();
  const dayCount = profile.daysAlive(P.dob);

  const v = el(`<div class="view">
    <div id="installbar"></div>
    <div id="banner"></div>

    ${profile.hasName(P) || dayCount ? `<div class="hello">
      <div class="g">${esc(profile.hasName(P)
        ? fill(U.greetingName, { g: U.greeting[greetKey], name: P.name })
        : fill(U.greetingPlain, { g: U.greeting[greetKey] }))}</div>
      ${dayCount ? `<div class="sub">${esc(fill(U.daysAlive, { n: dayCount.toLocaleString(L.code) }))}</div>` : ''}
    </div>` : ''}

    ${bdayMine?.isToday ? `<div class="birthday">
      <span class="bk">✦ ${esc(U.birthdays)}</span>
      <h3>${esc(U.birthdayYours)}</h3>
      <p>${esc(fill(U.birthdayYoursSub, { n: bdayMine.turning }))}</p>
    </div>` : ''}

    ${bdaysToday.map((b) => `<div class="birthday">
      <span class="bk">✦ ${esc(U.birthdays)}</span>
      <h3>${esc(fill(U.birthdayTheirs, { name: b.name, n: b.turning }))}</h3>
    </div>`).join('')}

    ${holToday.length ? `<div class="holidaybox">
      <span class="hk">${esc(holidays.countryName(P.country))}</span>
      <h4>${esc(fill(U.holidayToday, { name: holToday[0].name }))}</h4>
      ${holToday[0].approx ? `<p>${esc(U.holidayApprox)}</p>` : ''}
    </div>`
    : holNext && holNext.daysAway <= 14 ? `<div class="holidaybox">
      <span class="hk">${esc(holidays.countryName(P.country))}</span>
      <h4>${esc(holNext.daysAway === 1
        ? fill(U.holidayTomorrow, { name: holNext.name })
        : fill(U.holidayIn, { name: holNext.name, d: holNext.daysAway }))}</h4>
    </div>` : ''}

    ${bdaysSoon.length && !bdaysToday.length ? `<div class="holidaybox" style="border-left-color:var(--rose)">
      <span class="hk" style="color:var(--rose)">${esc(U.birthdays)}</span>
      <h4>${esc(fill(U.birthdaySoon, { name: bdaysSoon[0].name, n: bdaysSoon[0].turning, d: bdaysSoon[0].daysAway }))}</h4>
    </div>` : ''}

    <div class="streakbar">
      <span class="flame">${sk.current > 0 ? '🔥' : '🕯️'}</span>
      <div class="sk">
        <span class="n">${esc(plural(sk.current, U.streakDays))}</span>
        <span class="d">${esc(U.streak)}${sk.keptToday ? '' : ' · ' + esc(U.streakKeepGoing)}</span>
      </div>
      ${sk.longest > 1 ? `<span class="best">${esc(fill(U.streakBest, { n: sk.longest }))}</span>` : ''}
    </div>

    ${otd.length ? `<div class="otd">
      <span class="lbl">${esc(U.onThisDay)}</span>
      ${otd.slice(0, 3).map((m) => `<div class="item">
        <span class="ago">${esc(plural(m.yearsAgo, U.yearsAgo))}</span>
        <h4>${esc(m.title)}</h4><p>${esc(m.placard)}</p>
        ${m.photo ? `<img src="${m.photo}" alt="">` : ''}
      </div>`).join('')}
    </div>` : ''}

    ${ech.length ? `<div class="otd">
      <span class="lbl">${esc(U.echoes)}</span>
      ${ech.map((m) => `<div class="item">
        <span class="ago">${esc(U['echo' + m.echo.charAt(0).toUpperCase() + m.echo.slice(1)] || '')}</span>
        <h4>${esc(m.title)}</h4><p>${esc(m.placard)}</p>
      </div>`).join('')}
    </div>` : ''}

    <div id="capsules"></div>
    <div id="worldhistory"></div>

    <div class="eyebrow">${new Date().toLocaleDateString(L.code, { weekday: 'long', day: 'numeric', month: 'long' })}${day.place ? ' · ' + esc(day.place) : ''}</div>
    <div class="day-title">${esc(day.title)}</div>
    <div class="day-sub">${esc(day.subtitle)}</div>

    ${featured ? `<div class="vitrine ${featured.photo ? 'has-photo' : ''}">
        ${featured.photo ? `<img src="${featured.photo}" alt=""><div class="scrim"></div>` : ''}
        <span class="acc">${esc(U.featured)} · ${esc(featured.accession)}</span>
        <h2>${esc(featured.title)}</h2><p>${esc(featured.placard)}</p>
      </div>` : ''}

    ${mine.length ? `<div class="rail-label">${esc(U.dayInOrder)}</div>` : `
      <div class="empty"><h3>${esc(U.todayEmptyTitle)}</h3><p>${esc(U.todayEmptyBody)}</p></div>`}
    <div>${mine.map(cardHTML).join('')}</div>

    ${withheld ? `<div class="withheld"><div class="lk">${ICONS.lock}</div>
      <p><b>${esc(plural(withheld, U.withheld))}</b> ${esc(U.withheldBody)}</p></div>` : ''}
    ${mine.length ? `<button class="wide-btn" id="shareday" style="margin-top:8px">${ICONS.share} ${esc(U.shareDay)}</button>` : ''}
  </div>`);
  wireCards(v);
  renderBanner(v.querySelector('#banner'));
  renderWorldHistory(v.querySelector('#worldhistory'));
  renderCapsules(v.querySelector('#capsules'));
  v.querySelector('#shareday')?.addEventListener('click', shareToday);
  maybeShowInstall();
  return v;
}

async function renderBanner(host) {
  if (!host) return;
  const U = state.L.ui;
  const st = await backup.backupStatus(state.moments.length);
  if (st.level === 'ok' || st.level === 'none') {
    if (st.level === 'none' && state.moments.length < 3) return;
    if (st.level === 'ok') {
      host.innerHTML = `<div class="banner ok"><div class="bi">${ICONS.shield}</div>
        <div class="bt"><b>${esc(fill(U.backupOk, { when: new Date(st.meta.lastBackupAt).toLocaleDateString(state.L.code) }))}</b>
        <span>${esc(st.meta.folderName ? fill(U.folderChosen, { x: st.meta.folderName }) : '')}</span></div></div>`;
      return;
    }
  }
  const urgent = st.level === 'urgent';
  const msg = !st.meta.lastBackupAt ? U.backupNone
    : urgent ? fill(U.backupUrgent, { d: st.days }) : fill(U.backupDue, { n: st.unbacked });
  host.innerHTML = `<div class="banner ${urgent ? 'urgent' : 'warn'}" id="gob">
    <div class="bi">${ICONS.shield}</div>
    <div class="bt"><b>${esc(!st.meta.lastBackupAt ? U.backupNever : U.recovery)}</b><span>${esc(msg)}</span></div></div>`;
  host.querySelector('#gob').onclick = () => { state.tab = 'vault'; renderTabs(); render();
    setTimeout(() => $('recovery-anchor')?.scrollIntoView({ behavior: 'smooth' }), 120); };
}

/* ---------------- ARCHIVE ---------------- */
function viewArchive() {
  const L = state.L, U = L.ui;
  const q = state.query;
  const hits = q && searchIndex
    ? searchIndex.search(q).map((h) => state.moments.find((m) => m.id === h.id)).filter(Boolean)
    : null;
  const tips = q && searchIndex ? searchIndex.suggest(q) : [];
  const days = [...new Set(state.moments.filter((m) => m.kept !== false).map((m) => m.day))].sort().reverse();
  const year = new Date().getFullYear();
  const grid = yearGrid(state.moments, year);
  const maxC = Math.max(1, ...grid.map((g) => g.count));

  const v = el(`<div class="view">
    <div class="eyebrow">${esc(U.tabs.archive)}</div>
    <div class="day-title">${esc(U.archiveTitle)}</div>
    <div class="day-sub">${esc(U.archiveSub)}</div>
    <input class="search" id="q" placeholder="${esc(U.searchPlaceholder)}" value="${esc(q)}">
    ${q && tips.length ? `<div class="tips">${esc(U.searchSuggest)}: ${tips.map((t) =>
      `<button class="tip" data-tip="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
    ${!q && days.length ? `
      <div class="rail-label">${esc(U.yearInPixels)} · ${year}</div>
      <div class="year">${grid.map((g) => {
        const lvl = g.count === 0 ? 0 : Math.min(4, Math.ceil((g.count / maxC) * 4));
        return `<i class="px${lvl ? ' l' + lvl : ''}" title="${g.day}"></i>`;
      }).join('')}</div>
      <div class="monthrow">${['J','F','M','A','M','J','J','A','S','O','N','D'].map((m) => `<span>${m}</span>`).join('')}</div>
    ` : ''}
    <div id="results"></div>
  </div>`);

  const results = v.querySelector('#results');
  if (hits) {
    results.innerHTML = hits.length
      ? `<div class="rail-label">${esc(plural(hits.length, U.found))}</div>` + hits.map(cardHTML).join('')
      : `<div class="empty"><h3>${esc(U.nothingMatches)}</h3><p>${esc(U.nothingMatchesBody)}</p></div>`;
    wireCards(results);
  } else if (!days.length) {
    results.innerHTML = `<div class="empty"><h3>${esc(U.archiveEmpty)}</h3><p>${esc(U.archiveEmptyBody)}</p></div>`;
  } else {
    results.innerHTML = `<div class="tl">${days.map((d) => {
      const mine = momentsFor(d);
      const day = composeDay(d, mine, state.withheld[d] || 0, L);
      const mood = moodAverage(mine);
      return `<div class="tl-item" data-day="${d}">
        <div class="tl-date">${new Date(d + 'T12:00:00').toLocaleDateString(L.code, { weekday: 'short', day: 'numeric', month: 'short' })}${mood ? ' · ' + FACES[Math.round(mood)] : ''}</div>
        <div class="tl-h">${esc(day.title)}</div>
        <div class="tl-c">${esc(mine.slice(0, 3).map((m) => (m.label || m.title)).join(', '))}</div>
        <div class="tl-count">${esc(day.subtitle)}</div>
      </div>`;
    }).join('')}</div>`;
    results.querySelectorAll('.tl-item').forEach((it) => { it.onclick = () => showDay(it.dataset.day); });
  }

  v.querySelectorAll('[data-tip]').forEach((b) => b.onclick = () => {
    state.query = b.dataset.tip; render();
  });
  const input = v.querySelector('#q');
  input.oninput = (e) => {
    state.query = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const nq = $('q'); if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); }
  };
  return v;
}

function showDay(d) {
  const L = state.L;
  const mine = momentsFor(d);
  const day = composeDay(d, mine, state.withheld[d] || 0, L);
  const b = $('body'); b.innerHTML = '';
  const v = el(`<div class="view">
    <div class="eyebrow">${new Date(d + 'T12:00:00').toLocaleDateString(L.code, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
    <div class="day-title">${esc(day.title)}</div>
    <div class="day-sub">${esc(day.subtitle)}</div>
    <button class="wide-btn" id="back">${esc(L.ui.back)}</button>
    <div class="rail-label">${esc(L.ui.dayInOrder)}</div>
    ${mine.map(cardHTML).join('')}
  </div>`);
  wireCards(v);
  v.querySelector('#back').onclick = () => render();
  b.appendChild(v);
}

/* ---------------- THREADS ---------------- */
function viewThreads() {
  const L = state.L, U = L.ui;
  const threads = weave(state.moments, L);
  const corr = moodCorrelations(state.moments);
  const s = stats(state.moments);

  return el(`<div class="view">
    <div class="eyebrow">${esc(U.tabs.threads)}</div>
    <div class="day-title">${esc(U.threadsTitle)}</div>
    <div class="day-sub">${esc(U.threadsSub)}</div>

    ${s.moments ? `<div class="statgrid">
      <div class="stat"><span class="v">${s.moments}</span><span class="k">${esc(U.statMoments)}</span></div>
      <div class="stat"><span class="v">${s.days}</span><span class="k">${esc(U.statDays)}</span></div>
      <div class="stat"><span class="v">${s.withPhoto}</span><span class="k">${esc(U.statPhotos)}</span></div>
      <div class="stat"><span class="v">${s.mood ? FACES[Math.round(s.mood)] : '—'}</span><span class="k">${esc(U.moodAvg)}</span></div>
    </div>` : ''}

    ${corr.length ? `<div class="rail-label">${esc(U.mood)}</div>
      ${corr.slice(0, 6).map((c) => `<div class="corr">
        <span class="cl">${esc(c.label)}</span>
        <span class="cv ${c.delta >= 0 ? 'up' : 'down'}">${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(1)}</span>
      </div>`).join('')}
      <div style="height:20px"></div>` : ''}

    ${threads.length ? threads.map((t) => `
      <div class="thread"><span class="n">${esc(t.count)}</span>
        <span class="kind">${esc(t.label)}</span>
        <h3>${esc(t.title)}</h3><p>${esc(t.body)}</p></div>`).join('')
      : `<div class="empty"><h3>${esc(U.threadsEmpty)}</h3><p>${esc(U.threadsEmptyBody)}</p></div>`}
  </div>`);
}

/* ---------------- VAULT ---------------- */
function viewVault() {
  const L = state.L, U = L.ui;
  const rows = sources(L).map((s) => {
    const on = state.vault.find((v) => v.key === s.key)?.enabled !== false;
    return `<div class="row"><div class="rl"><span class="t">${esc(s.label)}</span>
      <span class="d">${esc(s.detail)}</span></div>
      <div class="toggle ${on ? 'on' : ''}" data-key="${s.key}" role="switch"
        tabindex="0" aria-checked="${on}" aria-label="${esc(s.label)}"></div></div>`;
  }).join('');
  const sealed = SEALED.map((k) => `<div class="row">
      <div class="rl"><span class="t">${esc(U.perm[k + 'Title'] || k[0].toUpperCase() + k.slice(1))}</span>
      <span class="d">${esc(U.sealedDetail)}</span></div>
      <div class="toggle locked" role="switch" aria-checked="true" aria-disabled="true"></div></div>`).join('');
  const langs = Object.keys(LOCALES).map((c) =>
    `<option value="${c}" ${c === state.locale ? 'selected' : ''}>${esc(LOCALES[c].name)}</option>`).join('');

  const v = el(`<div class="view">
    <div class="eyebrow">${esc(U.tabs.vault)}</div>
    <div class="day-title">${esc(U.vaultTitle)}</div>
    <div class="seal-big"><div class="seal-emblem">${ICONS.lock}</div>
      <h3>${esc(U.vaultSealTitle)}</h3><p>${esc(U.vaultSealBody)}</p></div>

    <div class="rail-label">${esc(U.theme)}</div>
    <div class="discard-note">${esc(U.themeBody)}</div>
    <div class="themegrid" id="themegrid">
      ${themes.THEMES.map((t) => `
        <button class="swatch ${(state.settings.theme || 'dusk') === t.id ? 'on' : ''}" data-theme="${t.id}"
          aria-label="${esc(U.themeNames[t.id] || t.id)}">
          <span class="chips">
            <i style="background:${t.swatch[0]}"></i>
            <i style="background:${t.swatch[1]}"></i>
            <i style="background:${t.swatch[2]}"></i>
          </span>
          <span class="sname">${esc(U.themeNames[t.id] || t.id)}</span>
        </button>`).join('')}
      <button class="swatch wide ${state.settings.theme === 'system' ? 'on' : ''}" data-theme="system">
        <span class="chips"><i class="sysdark"></i><i class="syslight"></i></span>
        <span class="sname">${esc(U.themeNames.system)}</span>
      </button>
    </div>

    <div id="recovery-anchor"></div>
    <div class="rail-label">${esc(U.recovery)}</div>
    <div class="day-title" style="font-size:20px;margin-bottom:6px">${esc(U.recoveryTitle)}</div>
    <div class="discard-note">${esc(U.recoveryBody)}</div>
    <div id="backupstate"></div>
    <button class="wide-btn primary" id="backup">${esc(U.saveKit)}</button>
    ${backup.canUseLiveFolder()
      ? `<button class="wide-btn" id="folder">${esc(U.chooseFolder)}</button>`
      : `<div class="discard-note">${esc(U.folderUnsupported)}</div>`}
    <button class="wide-btn" id="restore">${esc(U.restoreBtn)}</button>
    <input type="file" id="kitfile" accept=".curiokit,application/json,.json" hidden>

    <div class="rail-label" style="margin-top:24px">${esc(U.sync)}</div>
    <div class="discard-note">${esc(U.syncBody)}</div>
    <div class="kitinfo" id="syncstate">…</div>
    ${backup.syncCapability() === 'folder'
      ? `<button class="wide-btn" id="syncnow">${esc(U.syncNow)}</button>`
      : `<div class="discard-note">${esc(U.syncManualOnly)}</div>`}

    <div class="rail-label" style="margin-top:24px">${esc(U.history)}</div>
    <div class="row"><div class="rl"><span class="t">${esc(U.history)}</span>
      <span class="d">${esc(U.historyOn)}</span></div>
      <div class="toggle ${state.settings.historyOff ? '' : 'on'}" id="histt" role="switch"></div></div>
    <div class="row"><div class="rl"><span class="t">${esc(U.historyOnline)}</span>
      <span class="d">${esc(U.historyOnlineBody)}</span></div>
      <div class="toggle ${state.settings.historyOnline ? 'on' : ''}" id="histnet" role="switch"></div></div>

    <div class="rail-label" style="margin-top:24px">${esc(U.profile)}</div>
    <div class="discard-note">${esc(U.profileBody)}</div>
    <input class="field" id="pname" placeholder="${esc(U.yourNamePh)}" value="${esc(state.profile.name || '')}">
    <div class="row" style="border:none;padding:0 0 10px"><div class="rl"><span class="t">${esc(U.yourDob)}</span>
      <span class="d">${esc(U.yourDobHelp)}</span></div>
      <input class="field" id="pdob" type="date" style="width:auto;margin:0" value="${esc(state.profile.dob || '')}"></div>
    <div class="rail-label" style="margin-top:6px">${esc(U.yourCountry)}</div>
    <select class="field select" id="pcountry">
      <option value="">${esc(U.countryNone)}</option>
      ${holidays.COUNTRY_CODES.map((c) =>
        `<option value="${c}" ${state.profile.country === c ? 'selected' : ''}>${esc(holidays.countryName(c))}</option>`).join('')}
    </select>
    ${state.profile.countryHow === 'timezone' ? `<div class="hint" style="margin:-4px 0 14px">${esc(U.countryDetected)}</div>` : ''}

    <div class="rail-label">${esc(U.birthdays)}</div>
    <div id="peoplelist"></div>
    <button class="wide-btn" id="addperson">${esc(U.addPerson)}</button>
    <div class="row"><div class="rl"><span class="t">${esc(U.holidaysOff)}</span></div>
      <div class="toggle ${state.settings.holidaysOff ? '' : 'on'}" id="holt" role="switch"></div></div>

    <div class="rail-label" style="margin-top:24px">${esc(U.language)}</div>
    <select class="field select" id="lang">${langs}</select>
    <div class="hint" style="margin:-4px 0 20px">${esc(U.languageSub)}</div>

    <div class="rail-label">${esc(U.mayKeep)}</div>${rows}
    <div class="rail-label" style="margin-top:22px">${esc(U.offLimits)}</div>${sealed}

    <div class="rail-label" style="margin-top:22px">${esc(U.settings)}</div>
    <div class="row"><div class="rl"><span class="t">${esc(U.lock)}</span>
      <span class="d">${esc(U.lockBody)}</span></div>
      <div class="toggle ${state.settings.pin ? 'on' : ''}" id="lockt"></div></div>
    <div class="row"><div class="rl"><span class="t">${esc(U.reminder)}</span>
      <span class="d">${esc(U.reminderBody)}</span></div>
      <div class="toggle ${state.settings.reminder ? 'on' : ''}" id="remt"></div></div>
    ${state.settings.reminder ? `<div class="row"><div class="rl"><span class="t">${esc(U.reminderAt)}</span></div>
      <input class="field" id="remtime" type="time" style="width:130px;margin:0" value="${esc(state.settings.reminderAt || '21:00')}"></div>` : ''}

    <div class="rail-label" style="margin-top:24px">${esc(U.storageTitle)}</div>
    <div class="discard-note">${esc(U.storageBody)}</div>
    <div id="storagepanel">…</div>

    <div class="rail-label" style="margin-top:22px">${esc(U.quality)}</div>
    <div class="row"><div class="rl"><span class="t">${esc(U.photoQuality)}</span>
      <span class="d">${esc(U.qualityHint)}</span></div></div>
    <div class="pill-row" id="pq">${['small', 'balanced', 'clear'].map((t) =>
      `<button class="pill ${(state.settings.photoQuality || 'balanced') === t ? 'on' : ''}" data-pq="${t}">${esc(U.qualityTiers[t])}</button>`).join('')}</div>
    <div class="row"><div class="rl"><span class="t">${esc(U.audioQuality)}</span>
      <span class="d">${esc(fill(U.audioPerMin, { x: '120–300 KB' }))}</span></div></div>
    <div class="pill-row" id="aq">${['small', 'balanced', 'clear'].map((t) =>
      `<button class="pill ${(state.settings.audioQuality || 'balanced') === t ? 'on' : ''}" data-aq="${t}">${esc(U.qualityTiers[t])}</button>`).join('')}</div>

    <div class="rail-label" style="margin-top:24px">${esc(U.book)}</div>
    <div class="discard-note">${esc(U.bookBody)}</div>
    <div class="pill-row" id="bookyears">
      ${(book.yearsWithContent(state.moments).length
          ? book.yearsWithContent(state.moments)
          : [new Date().getFullYear()]).slice(0, 6).map((y, i) =>
        `<button class="pill ${i === 0 ? 'on' : ''}" data-year="${y}">${y}</button>`).join('')}
    </div>
    <button class="wide-btn primary" id="makebook">${esc(fill(U.bookMake, {
      y: book.yearsWithContent(state.moments)[0] || new Date().getFullYear() }))}</button>

    <div class="rail-label" style="margin-top:22px">${esc(U.yourArchive)}</div>
    <button class="wide-btn" id="expmd">${esc(U.exportMarkdown)}</button>
    <button class="wide-btn" id="expplain">${esc(U.exportPlain)}</button>
    <div class="rail-label" style="margin-top:22px">${esc(U.dangerZone)}</div>
    <button class="wide-btn danger" id="wipe">${esc(U.wipeBtn)}</button>
    <div class="discard-note" style="margin-top:14px"><b>${esc(U.aboutTitle)}</b> ${esc(U.aboutBody)}</div>

    <div class="rail-label" style="margin-top:24px">${esc(U.legal)}</div>
    <a class="linkrow" href="about.html" target="_blank" rel="noopener">
      <span class="lr"><b>${esc(U.linkAbout)}</b><i>${esc(U.linkAboutSub)}</i></span><span class="chev">↗</span></a>
    <a class="linkrow" href="privacy.html" target="_blank" rel="noopener">
      <span class="lr"><b>${esc(U.linkPrivacy)}</b><i>${esc(U.linkPrivacySub)}</i></span><span class="chev">↗</span></a>
    <a class="linkrow" href="terms.html" target="_blank" rel="noopener">
      <span class="lr"><b>${esc(U.linkTerms)}</b><i>${esc(U.linkTermsSub)}</i></span><span class="chev">↗</span></a>

    <div class="rail-label" style="margin-top:24px">${esc(U.version)}</div>
    <div class="kitinfo"><b class="buildstamp">${esc(BUILD)}</b><br>${esc(U.versionBody)}</div>
    <button class="wide-btn" id="checkupd">${esc(U.checkUpdates)}</button>
  </div>`);

  wireVault(v);
  return v;
}

function wireVault(v) {
  const L = state.L, U = L.ui;

  // ---- theme ----
  v.querySelectorAll('[data-theme]').forEach((b) => b.onclick = async () => {
    const id = b.dataset.theme;
    await saveSettings({ theme: id });
    themes.apply(id);
    themes.watchSystem(id, () => themes.apply(themes.SYSTEM));
    v.querySelectorAll('[data-theme]').forEach((x) => x.classList.toggle('on', x === b));
    tap();
    toast(fill(U.themeSet, { x: U.themeNames[id] || id }));
  });

  // ---- profile ----
  const pn = v.querySelector('#pname');
  pn.onchange = async () => { await saveProfile({ name: pn.value.trim() }); toast(U.saved); };
  const pd = v.querySelector('#pdob');
  pd.onchange = async () => { await saveProfile({ dob: pd.value }); toast(U.saved); };
  const pc = v.querySelector('#pcountry');
  pc.onchange = async () => {
    await saveProfile({ country: pc.value || null, countryHow: 'chosen' });
    render(); toast(U.saved);
  };
  v.querySelector('#holt').onclick = async (e) => {
    await saveSettings({ holidaysOff: !state.settings.holidaysOff });
    e.target.classList.toggle('on', !state.settings.holidaysOff);
  };

  const renderPeople = () => {
    const host = v.querySelector('#peoplelist'); if (!host) return;
    const people = state.profile.people || [];
    if (!people.length) { host.innerHTML = `<div class="kitinfo">${esc(U.noBirthdays)}</div>`; return; }
    host.innerHTML = people.map((p) => {
      const nb = profile.nextBirthday(p.dob);
      return `<div class="corr">
        <span class="cl">${esc(p.name)}<span style="opacity:.5;font-size:12px"> · ${nb ? esc(fill(U.ageIs, { n: nb.turning - 1 })) : ''}</span></span>
        <button class="mini-btn forget" data-rm="${esc(p.id)}" style="flex:0 0 auto;padding:6px 12px">${esc(U.forget)}</button>
      </div>`;
    }).join('');
    host.querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => {
      await saveProfile({ people: (state.profile.people || []).filter((x) => String(x.id) !== b.dataset.rm) });
      renderPeople(); toast(U.personRemoved);
    });
  };
  renderPeople();

  v.querySelector('#addperson').onclick = () => {
    openSheet(`<h3>${esc(U.addPerson)}</h3>
      <input class="field" id="bname" placeholder="${esc(U.personName)}">
      <input class="field" id="bdob" type="date" placeholder="${esc(U.personDob)}">
      <div class="sheet-actions"><button id="cancel">${esc(U.cancel)}</button>
      <button class="primary" id="go">${esc(U.save)}</button></div>`);
    const sh = $('sheet');
    setTimeout(() => sh.querySelector('#bname')?.focus(), 200);
    sh.querySelector('#cancel').onclick = closeSheet;
    sh.querySelector('#go').onclick = async () => {
      const name = sh.querySelector('#bname').value.trim();
      const dob = sh.querySelector('#bdob').value;
      if (!name || !dob) return toast(U.toasts.addSomething, true);
      const people = [...(state.profile.people || []), { id: `${Date.now()}`, name, dob }];
      await saveProfile({ people });
      closeSheet(); renderPeople(); toast(U.personAdded);
    };
  };

  v.querySelector('#lang').onchange = async (e) => {
    state.locale = e.target.value; state.L = getLocale(state.locale);
    await store.setMeta('locale', state.locale);
    applyDirection(); renderTabs(); render();
    toast(fill(state.L.ui.toasts.langChanged, { lang: state.L.name }));
  };

  v.querySelectorAll('.toggle[data-key]').forEach((t) => {
    t.onclick = async () => {
      const row = state.vault.find((x) => x.key === t.dataset.key);
      row.enabled = !(row.enabled !== false);
      await store.setMeta('vault', state.vault);
      t.classList.toggle('on', row.enabled);
      toast(fill(row.enabled ? U.toasts.captureOn : U.toasts.captureOff, { k: L.ui.kinds[t.dataset.key].label }));
    };
  });

  // ---- recovery ----
  backup.backupStatus(state.moments.length).then((st) => {
    const host = v.querySelector('#backupstate'); if (!host) return;
    const when = st.meta.lastBackupAt ? new Date(st.meta.lastBackupAt).toLocaleString(state.L.code) : null;
    host.innerHTML = `<div class="kitinfo">${when
      ? `<b>${esc(fill(U.backupOk, { when }))}</b>` + (st.meta.folderName ? `<br>${esc(fill(U.folderChosen, { x: st.meta.folderName }))}` : '')
      : `<b>${esc(U.backupNever)}</b><br>${esc(U.backupNone)}`}</div>`;
  });

  v.querySelector('#backup').onclick = () => askPassphrase(async (pp) => {
    try {
      const res = await backup.backupNow(pp);
      state.pass = pp;
      if (state.settings.rememberPass !== false) await store.setMeta('pass', pp);
      closeSheet(); render();
      toast(res.method === 'folder' ? U.backedUpFolder : fill(U.backupDone, { n: res.count }));
    } catch (e) { toast(e.message, true); }
  });

  const fbtn = v.querySelector('#folder');
  if (fbtn) fbtn.onclick = async () => {
    try {
      const name = await backup.chooseFolder();
      toast(fill(U.folderChosen, { x: name }));
      if (state.pass) await backup.autoBackup(state.pass);
      else askPassphrase(async (pp) => {
        state.pass = pp;
        if (state.settings.rememberPass !== false) await store.setMeta('pass', pp);
        await backup.backupNow(pp); closeSheet(); render(); toast(U.backedUpFolder);
      });
      render();
    } catch (e) { if (e?.name !== 'AbortError') toast(U.folderUnsupported, true); }
  };

  const kf = v.querySelector('#kitfile');
  v.querySelector('#restore').onclick = () => kf.click();
  kf.onchange = (e) => handleKitFile(e.target.files[0]);

  // ---- sync ----
  backup.syncEnabled().then(async (on) => {
    const host = v.querySelector('#syncstate'); if (!host) return;
    const meta = await backup.getMeta();
    host.innerHTML = on && meta.folderName
      ? `<b>${esc(fill(U.syncOn, { x: meta.folderName }))}</b>`
      : `<b>${esc(U.syncOff)}</b>`;
  });
  v.querySelector('#syncnow')?.addEventListener('click', async () => {
    if (!state.pass) return toast(U.backupNever, true);
    toast(U.syncing);
    const res = await backup.syncNow(state.pass);
    if (res.status === 'ok') {
      await refresh(); render();
      toast(res.pulled ? fill(U.syncPulled, { n: res.pulled }) : U.syncDone);
    } else if (res.status === 'wrong-passphrase') toast(U.syncWrongPass, true);
    else if (res.status === 'no-folder') toast(U.syncManualOnly, true);
  });

  // ---- today in history ----
  v.querySelector('#histt').onclick = async (e) => {
    await saveSettings({ historyOff: !state.settings.historyOff });
    e.target.classList.toggle('on', !state.settings.historyOff);
  };
  v.querySelector('#histnet').onclick = async (e) => {
    await saveSettings({ historyOnline: !state.settings.historyOnline });
    e.target.classList.toggle('on', !!state.settings.historyOnline);
  };

  // ---- lock ----
  v.querySelector('#lockt').onclick = async () => {
    if (state.settings.pin) { await saveSettings({ pin: null }); render(); toast(U.lockOff); return; }
    openSheet(`<h3>${esc(U.lockSet)}</h3><div class="hint">${esc(U.lockBody)}</div>
      <input class="field" id="p1" type="password" inputmode="numeric" placeholder="${esc(U.lockPh)}">
      <div class="sheet-actions"><button id="cancel">${esc(U.cancel)}</button>
      <button class="primary" id="go">${esc(U.save)}</button></div>`);
    const sh = $('sheet');
    sh.querySelector('#cancel').onclick = closeSheet;
    sh.querySelector('#go').onclick = async () => {
      const pin = sh.querySelector('#p1').value.trim();
      if (pin.length < 4) return toast(U.lockPh, true);
      await saveSettings({ pin }); closeSheet(); render(); toast(U.saved);
    };
  };

  // ---- reminder ----
  v.querySelector('#remt').onclick = async () => {
    if (state.settings.reminder) { await saveSettings({ reminder: false }); scheduleReminder(); render(); toast(U.reminderOff); return; }
    if (!('Notification' in window)) return toast(U.reminderDenied, true);
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast(U.reminderDenied, true);
    await saveSettings({ reminder: true, reminderAt: state.settings.reminderAt || '21:00' });
    scheduleReminder(); render();
    toast(fill(U.reminderOn, { x: state.settings.reminderAt }));
  };
  const rt = v.querySelector('#remtime');
  if (rt) rt.onchange = async (e) => {
    await saveSettings({ reminderAt: e.target.value });
    scheduleReminder(); toast(fill(U.reminderOn, { x: e.target.value }));
  };

  // ---- exports ----
  // ---- the annual book ----
  let bookYear = book.yearsWithContent(state.moments)[0] || new Date().getFullYear();
  v.querySelectorAll('[data-year]').forEach((b) => b.onclick = () => {
    bookYear = Number(b.dataset.year);
    v.querySelectorAll('[data-year]').forEach((x) => x.classList.toggle('on', x === b));
    v.querySelector('#makebook').textContent = fill(U.bookMake, { y: bookYear });
  });
  v.querySelector('#makebook').onclick = () => {
    const vol = book.organise(state.moments, bookYear, { composeDay, locale: state.L.code });
    if (!vol.moments) return toast(U.bookNone, true);
    const html = book.render(vol, {
      locale: state.L.code,
      name: state.profile.name || '',
      stats: sizes.measure(state.moments).counts,
      labels: U.bookLabels,
    });
    const how = book.open(html, `curio-${bookYear}.html`);
    toast(how === 'printed' ? U.bookOpened : U.bookDownloaded);
  };

  v.querySelector('#checkupd').onclick = () => checkForUpdates();

  v.querySelector('#expmd').onclick = async () => {
    const n = await backup.markdownExport(composeDay, state.L);
    toast(fill(U.imported, { n }) || U.saved);
  };
  v.querySelector('#expplain').onclick = async () => {
    const n = await backup.plainExport();
    render(); toast(fill(U.backupDone, { n }));
  };
  v.querySelector('#wipe').onclick = async () => {
    if (!confirm(U.confirmWipe)) return;
    await store.clearAll(); await store.setMeta('withheld', {});
    await refresh(); render(); toast(U.toasts.erased);
  };

  store.usage().then(({ used, quota }) => {
    const u = v.querySelector('#usage'); if (!u) return;
    u.innerHTML = quota
      ? fill(U.storageUsing, { used: (used / 1048576).toFixed(1), quota: (quota / 1048576).toFixed(0) })
      : U.storageLocal;
  });
}

/* ================================================================== */
/* meetings                                                            */
/* ================================================================== */
function openMeetingSetup() {
  const U = state.L.ui, M = U.meeting;
  openSheet(`
    <h3>${esc(M.title)}</h3>
    <div class="hint">${esc(M.hint)}</div>
    <input class="field" id="mtitle" placeholder="${esc(M.namePh)}">
    <input class="field" id="mwho" placeholder="${esc(M.whoPh)}">
    ${canDictate() ? `<div class="row" style="border:none;padding:6px 0">
      <div class="rl"><span class="t">${esc(M.enableTranscript)}</span>
        <span class="d">${esc(M.transcriptWarn)}</span></div>
      <div class="toggle ${state.settings.meetingTranscript ? 'on' : ''}" id="mdict" role="switch"></div>
    </div>` : `<div class="hint">${esc(M.transcriptOff)}</div>`}
    <div class="sheet-actions">
      <button id="cancel">${esc(U.cancel)}</button>
      <button class="primary" id="next">${esc(M.start)}</button>
    </div>`);
  const sh = $('sheet');
  setTimeout(() => sh.querySelector('#mtitle')?.focus(), 200);
  sh.querySelector('#mdict')?.addEventListener('click', async (e) => {
    await saveSettings({ meetingTranscript: !state.settings.meetingTranscript });
    e.target.classList.toggle('on', !!state.settings.meetingTranscript);
  });
  sh.querySelector('#cancel').onclick = closeSheet;
  sh.querySelector('#next').onclick = () => askConsent(
    sh.querySelector('#mtitle').value.trim(),
    sh.querySelector('#mwho').value.trim());
}

/** The gate. Curio will not record a room that has not been told. */
function askConsent(title, who) {
  const U = state.L.ui, M = U.meeting;
  openSheet(`
    <h3>${esc(M.consentTitle)}</h3>
    <div class="consentbox">
      <p>${esc(M.consentBody)}</p>
      <p class="say">${esc(M.consentAsk)}</p>
    </div>
    <div class="sheet-actions">
      <button id="no">${esc(M.consentNo)}</button>
      <button class="primary" id="yes">${esc(M.consentYes)}</button>
    </div>`);
  const sh = $('sheet');
  sh.querySelector('#no').onclick = () => openMeetingSetup();
  sh.querySelector('#yes').onclick = () => startMeeting(title, who);
}

async function startMeeting(title, who) {
  const U = state.L.ui, M = U.meeting;
  const aq = sizes.AUDIO_QUALITY[state.settings.audioQuality || sizes.DEFAULT_AUDIO_QUALITY]
             || sizes.AUDIO_QUALITY.balanced;

  meeting = new MeetingSession({
    title, attendees: who,
    bitrate: aq.bitrate,
    locale: state.L.code,
    dictate: !!state.settings.meetingTranscript,
    save: (st) => store.setMeta('meetingDraft', st),
    onTick: (secs, text) => paintMeeting(secs, text),
  });
  meeting.confirmConsent(true, `${title || ''} ${who || ''}`.trim());

  try {
    await meeting.start();
  } catch (e) {
    meeting = null;
    return toast(e.message === 'NO_CONSENT' ? M.consentTitle : U.voiceDenied, true);
  }
  closeSheet();
  showMeetingScreen();
  tap(20);
}

function showMeetingScreen() {
  const U = state.L.ui, M = U.meeting;
  $('tabs').style.display = 'none'; $('fab').style.display = 'none';
  const perHour = sizes.humanBytes((state.settings.audioQuality === 'small' ? 16000 : 24000) * 3600 / 8);

  const scr = el(`<div class="meetscreen" id="meetscreen">
    <div class="meethead">
      <div>
        <div class="mlive"><span class="pip"></span>${esc(M.live)}</div>
        <h2 id="mname">${esc(meeting.title || M.label)}</h2>
      </div>
      <div class="mclock" id="mclock">0:00</div>
    </div>

    <div class="mtranscript" id="mtx">
      <span class="tlabel">${esc(state.settings.meetingTranscript ? M.transcriptOn : M.transcriptOff)}</span>
      <p id="mtxbody">${esc(state.settings.meetingTranscript ? M.transcriptEmpty : '')}</p>
    </div>

    <textarea class="field mnotes" id="mnotes" placeholder="${esc(M.notesPh)}"></textarea>
    <div class="mmarks" id="mmarks"></div>

    <div class="mfoot">
      <button class="wide-btn" id="mmark">${esc(M.markIt)}</button>
      <div class="mrow">
        <button class="wide-btn danger" id="mdiscard">${esc(M.discard)}</button>
        <button class="wide-btn primary" id="mstop">${esc(M.stop)}</button>
      </div>
      <div class="hint" style="text-align:center;margin-top:4px">${esc(fill(M.longWarning, { x: perHour }))}</div>
    </div>
  </div>`);
  document.body.appendChild(scr);

  scr.querySelector('#mnotes').oninput = (e) => meeting?.setNotes(e.target.value);
  scr.querySelector('#mmark').onclick = () => {
    const m = meeting?.mark('');
    if (!m) return;
    tap();
    paintMarks();
    toast(fill(M.marked, { t: fmtClock(m.at) }));
  };
  scr.querySelector('#mdiscard').onclick = async () => {
    if (!confirm(M.confirmDiscard)) return;
    meeting?.cancel(); meeting = null;
    await store.setMeta('meetingDraft', null);
    closeMeetingScreen(); toast(M.discarded);
  };
  scr.querySelector('#mstop').onclick = () => finishMeeting();
}

function paintMeeting(secs, text) {
  const clock = $('mclock'); if (clock) clock.textContent = fmtClock(secs);
  const body = $('mtxbody');
  if (body && state.settings.meetingTranscript) {
    body.textContent = text || state.L.ui.meeting.transcriptEmpty;
    body.scrollTop = body.scrollHeight;
  }
}

function paintMarks() {
  const host = $('mmarks'); if (!host || !meeting) return;
  host.innerHTML = meeting.marks.slice(-4).reverse()
    .map((m) => `<span class="markchip">${esc(fmtClock(m.at))}</span>`).join('');
}

function closeMeetingScreen() {
  $('meetscreen')?.remove();
  renderTabs(); render();
}

async function finishMeeting() {
  const U = state.L.ui, M = U.meeting;
  if (!meeting) return;
  const notes = $('mnotes')?.value || '';
  meeting.setNotes(notes);
  const state_ = await meeting.stop();
  meeting = null;
  await store.setMeta('meetingDraft', null);
  await saveMeetingMoment(state_);
  closeMeetingScreen();
  toast(M.saved);
}

/** Turn a finished meeting into a moment in the diary. */
async function saveMeetingMoment(st) {
  const L = state.L;
  const written = writeUp(st, L);
  const signal = {
    kind: 'meeting',
    label: st.title || L.ui.meeting.label,
    text: st.title || '',
    at: st.startedAt || new Date().toISOString(),
    subject: null,
  };
  const moment = compose(signal, state.moments, L);
  moment.placard = placardFor(st, L);
  moment.meeting = {
    attendees: st.attendees || '',
    consent: st.consent,
    seconds: st.seconds,
    marks: st.marks,
    transcript: st.transcript,
    notes: st.notes,
    digest: st.digest || digest(st.transcript || ''),
    markdown: written.markdown,
  };
  if (st.audio) { moment.audio = st.audio; moment.audioSeconds = st.audioSeconds; }
  moment.editedAt = new Date().toISOString();
  await store.putMoment(moment);
  await refresh();
  state.tab = 'today';
  publishWidgetSnapshot();
  if (state.pass) withLock(LOCK_SYNC, () => backup.syncNow(state.pass)).catch(() => {});
}

/** A meeting cut short by a flat battery is offered back on the next launch. */
async function offerMeetingRecovery() {
  const draft = await store.getMeta('meetingDraft', null);
  if (!draft || !draft.startedAt) return;
  const U = state.L.ui, M = U.meeting;
  openSheet(`
    <h3>${esc(M.recovered)}</h3>
    <div class="hint">${esc(M.recoveredBody)}</div>
    <div class="kitinfo"><b>${esc(draft.title || M.label)}</b><br>
      ${esc(fmtClock(draft.seconds || 0))}${draft.marks?.length ? ` · ${draft.marks.length}` : ''}</div>
    <div class="sheet-actions">
      <button id="drop">${esc(M.recoverDrop)}</button>
      <button class="primary" id="keep">${esc(M.recoverKeep)}</button>
    </div>`);
  const sh = $('sheet');
  sh.querySelector('#drop').onclick = async () => {
    await store.setMeta('meetingDraft', null); closeSheet(); toast(M.discarded);
  };
  sh.querySelector('#keep').onclick = async () => {
    await store.setMeta('meetingDraft', null);
    await saveMeetingMoment({ ...draft, digest: digest(draft.transcript || '') });
    closeSheet(); render(); toast(M.saved);
  };
}

/* ---- storage panel ---- */
async function renderStoragePanel(host) {
  if (!host) return;
  const U = state.L.ui;
  const kept = state.moments.filter((m) => m.kept !== false);
  const m = sizes.measure(kept);
  const { quota } = await store.usage();
  const p = sizes.pressure(m.total, quota);
  const proj = sizes.projection(kept, quota);
  const advice = sizes.suggestions(m, quota);

  if (!kept.length) { host.innerHTML = `<div class="kitinfo">${esc(U.storNothing)}</div>`; return; }

  const pct = (n) => (m.total ? Math.max(n ? 2 : 0, Math.round((n / m.total) * 100)) : 0);
  const bars = [
    { k: 'photos', v: m.photos, cls: 'b-photo', label: U.storPhotos },
    { k: 'audio', v: m.audio, cls: 'b-audio', label: U.storAudio },
    { k: 'text', v: m.text, cls: 'b-text', label: U.storText },
  ].filter((b) => b.v > 0);

  host.innerHTML = `
    <div class="storbox">
      <div class="storhead">
        <span class="stotal">${esc(sizes.humanBytes(m.total))}</span>
        <span class="sstate s-${p.level}">${esc(U.storPressure[p.level])}</span>
      </div>
      ${quota ? `<div class="ssub">${esc(fill(U.storFree, { x: sizes.humanBytes(quota) }))}</div>` : ''}
      <div class="sbar">${bars.map((b) => `<i class="${b.cls}" style="width:${pct(b.v)}%"></i>`).join('')}</div>
      <div class="skeys">${bars.map((b) => `<span class="skey"><i class="${b.cls}"></i>${esc(b.label)}
        <b>${esc(sizes.humanBytes(b.v))}</b></span>`).join('')}</div>
      ${proj.perYear > 0 ? `<div class="snote">${esc(fill(U.storGrowth, { x: sizes.humanBytes(proj.perYear) }))}${
        proj.daysLeft != null && proj.daysLeft < 36500
          ? ' ' + esc(fill(U.storYears, { n: Math.max(1, Math.floor(proj.daysLeft / 365)) })) : ''}</div>` : ''}
    </div>
    ${m.largest.length ? `<div class="rail-label" style="margin:18px 0 10px">${esc(U.storLargest)}</div>
      ${m.largest.slice(0, 4).map((l) => `<div class="corr">
        <span class="cl">${esc(l.title)}${l.audio ? ' ♪' : ''}</span>
        <span class="cv">${esc(sizes.humanBytes(l.bytes))}</span></div>`).join('')}` : ''}
    ${advice.length ? `<div class="rail-label" style="margin:18px 0 10px">${esc(U.storReclaim)}</div>
      ${advice.filter((a) => a.key !== 'exportAndClear').map((a) => `
        <button class="wide-btn" data-do="${a.key}">
          ${esc(a.key === 'shrinkPhotos' ? U.storShrink : U.storTrim)}
          <span class="saves">−${esc(sizes.humanBytes(a.saves))}</span>
        </button>
        <div class="hint" style="margin:-4px 0 12px">${esc(fill(
          a.key === 'shrinkPhotos' ? U.storShrinkBody : U.storTrimBody,
          { n: a.count, x: sizes.humanBytes(a.saves) }))}</div>`).join('')}` : ''}
    <div id="storprog"></div>`;

  host.querySelector('[data-do="shrinkPhotos"]')?.addEventListener('click', () => runReclaim('shrink', host));
  host.querySelector('[data-do="trimAudio"]')?.addEventListener('click', () => runReclaim('trim', host));
}

async function runReclaim(what, host) {
  const U = state.L.ui;
  const confirmText = what === 'shrink' ? U.storConfirmShrink : U.storConfirmTrim;
  if (!confirm(confirmText)) return;

  const prog = host.querySelector('#storprog');
  const onProgress = (a, b) => { if (prog) prog.innerHTML = `<div class="kitinfo">${esc(fill(U.storWorking, { a, b }))}</div>`; };
  const kept = state.moments.filter((x) => x.kept !== false);

  let res;
  try {
    res = what === 'shrink'
      ? await sizes.shrinkAllPhotos(kept, store.putMoment, { tier: 'small', onProgress })
      : await sizes.dropOldAudio(kept, store.putMoment, { days: 180, onProgress });
  } catch {
    if (prog) prog.innerHTML = '';
    return toast(U.toasts.notArchive, true);
  }

  if (prog) prog.innerHTML = '';
  await refresh();
  render();
  toast(res.saved > 0 ? fill(U.storReclaimed, { x: sizes.humanBytes(res.saved) }) : U.storNothingToDo);
  if (state.pass) withLock(LOCK_SYNC, () => backup.syncNow(state.pass)).catch(() => {});
}

/* ---- passphrase dialog ---- */
function askPassphrase(onOk) {
  const U = state.L.ui;
  openSheet(`
    <h3>${esc(U.passphrase)}</h3>
    <div class="hint">${esc(U.passphraseHelp)}</div>
    <div class="pass-wrap"><input class="field" id="p1" type="password" placeholder="${esc(U.passphrasePh)}"></div>
    <div class="strength-bar"><i id="sbar"></i></div>
    <input class="field" id="p2" type="password" placeholder="${esc(U.passphraseAgain)}">
    <div id="fp"></div>
    <div class="sheet-actions">
      <button id="cancel">${esc(U.cancel)}</button>
      <button class="primary" id="go">${esc(U.saveKit)}</button>
    </div>`);
  const sh = $('sheet');
  const p1 = sh.querySelector('#p1'), p2 = sh.querySelector('#p2');
  setTimeout(() => p1.focus(), 200);
  p1.oninput = async () => {
    const s = strength(p1.value);
    sh.querySelector('#sbar').className = 'sb-' + s.label;
    if (p1.value.length >= 6) {
      sh.querySelector('#fp').innerHTML =
        `<div class="fingerprint">${await fingerprint(p1.value)}</div>
         <div class="hint" style="margin-bottom:12px">${esc(U.fingerprintHelp)}</div>`;
    } else sh.querySelector('#fp').innerHTML = '';
  };
  sh.querySelector('#cancel').onclick = closeSheet;
  sh.querySelector('#go').onclick = () => {
    if (p1.value.length < 6) return toast(U.passphraseWeak, true);
    if (p1.value !== p2.value) return toast(U.passphraseMismatch, true);
    onOk(p1.value);
  };
}

/* ================================================================== */
/* reminders                                                          */
/* ================================================================== */
function scheduleReminder() {
  clearTimeout(reminderTimer);
  if (!state.settings.reminder || !('Notification' in window) || Notification.permission !== 'granted') return;
  const [h, m] = (state.settings.reminderAt || '21:00').split(':').map(Number);
  const now = new Date();
  const next = new Date(now); next.setHours(h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  reminderTimer = setTimeout(() => {
    const U = state.L.ui;
    const today = dayKey(new Date());
    if (!momentsFor(today).length) {
      try { new Notification(U.reminderTitle, { body: U.reminderText, icon: 'icons/icon-192.png' }); } catch {}
    }
    scheduleReminder();
  }, Math.min(next - now, 2 ** 31 - 1));
}

/* ================================================================== */
/* capture                                                            */
/* ================================================================== */
function openSheet(html) {
  $('sheet').innerHTML = `<div class="grab"></div>` + html;
  $('sheet').classList.add('open'); $('sheetbg').classList.add('open');
}
function closeSheet() {
  stopCamera();
  $('sheet').classList.remove('open'); $('sheetbg').classList.remove('open');
}

function openCaptureSheet() {
  const L = state.L, U = L.ui;
  const kinds = sources(L).filter((s) => state.vault.find((v) => v.key === s.key)?.enabled !== false);
  openSheet(`
    <h3>${esc(U.keepMoment)}</h3><div class="hint">${esc(U.staysHere)}</div>
    <div class="kinds">${kinds.map((k) =>
      `<div class="kind" data-kind="${k.key}">${ICONS[k.key]}<span>${esc(k.label)}</span></div>`).join('')}</div>
    ${kinds.length === 0 ? `<div class="hint" style="margin-top:14px">${esc(U.allSourcesOff)}</div>` : ''}`);
  $('sheet').querySelectorAll('.kind').forEach((k) => k.onclick = () => {
    if (k.dataset.kind === 'meeting') { closeSheet(); openMeetingSetup(); return; }
    captureFor(k.dataset.kind);
  });
}

function captureFor(kind) {
  const L = state.L, U = L.ui, K = U.kinds[kind];
  pendingPhoto = null; pendingMood = null; pendingUnlock = null;
  openSheet(`
    <h3>${esc(K.title)}</h3><div class="hint">${esc(K.hint)}</div>
    ${kind === 'photo' ? `
      <div id="camwrap" class="camwrap" style="display:none">
        <video id="cam" autoplay playsinline muted></video>
        <button class="shutter" id="shutter" aria-label="${esc(U.camera.take)}"></button>
        <button class="camswitch" id="camswitch">${esc(U.camera.switch)}</button>
      </div>
      <img id="pv" class="preview" style="display:none" alt="">
      <button class="wide-btn primary" id="opencam">${esc(U.camera.open)}</button>
      <input type="file" id="pf" accept="image/*" hidden>
      <button class="wide-btn" id="pick">${esc(U.camera.choose)}</button>` : ''}
    ${kind === 'note' || kind === 'read'
      ? `<textarea class="field" id="val" placeholder="${esc(K.ph)}"></textarea>`
      : `<input class="field" id="val" placeholder="${esc(K.ph)}">`}
    ${kind === 'place' ? `<button class="wide-btn" id="geo">${esc(U.useLocation)}</button>` : ''}
    ${kind === 'voice' ? `
      <div class="recorder" id="recbox">
        <button class="recbtn" id="recbtn" aria-label="${esc(U.record)}"><span class="dot"></span></button>
        <div class="rectime" id="rectime">0:00</div>
        <div class="rechint" id="rechint">${esc(U.record)}</div>
      </div>
      <audio id="recplay" controls style="display:none;width:100%;margin-bottom:12px"></audio>
      ${canDictate() ? `<button class="wide-btn" id="dictate">${esc(U.dictate)}</button>` : ''}
      <div class="hint" style="margin:-4px 0 12px">${esc(U.dictateTip)}</div>` : ''}

    <details class="capsule">
      <summary>${esc(U.capsule)}</summary>
      <div class="hint" style="margin:8px 0 10px">${esc(U.capsuleBody)}</div>
      <div class="pill-row" id="caps">
        ${capsuleOptions().map((o) =>
          `<button class="pill" data-cap="${o.date.toISOString()}">${esc(U.capsuleOptions[o.key])}</button>`).join('')}
        <button class="pill" data-cap="">${esc(U.capsuleNone)}</button>
      </div>
      <input class="field" id="capdate" type="date" style="margin-bottom:0">
    </details>

    <div class="rail-label" style="margin:6px 0 10px">${esc(U.mood)}</div>
    <div class="moodrow">${[1, 2, 3, 4, 5].map((n) =>
      `<div class="moodbtn" data-mood="${n}"><span class="face">${FACES[n]}</span><span class="lb">${esc(U.moods[n])}</span></div>`).join('')}</div>

    <div class="sheet-actions">
      <button id="cancel">${esc(U.cancel)}</button>
      <button class="primary" id="save">${esc(U.keepIt)}</button>
    </div>`);

  const sheet = $('sheet');
  const val = sheet.querySelector('#val');
  if (kind !== 'photo') setTimeout(() => val?.focus(), 250);
  if (kind === 'photo') wirePhoto(sheet);
  if (kind === 'place') wireGeo(sheet, val);
  if (kind === 'voice') wireVoice(sheet, val);

  sheet.querySelectorAll('[data-cap]').forEach((b) => b.onclick = () => {
    pendingUnlock = b.dataset.cap || null;
    sheet.querySelectorAll('[data-cap]').forEach((x) => x.classList.toggle('on', x === b && !!pendingUnlock));
    const d = sheet.querySelector('#capdate');
    if (d) d.value = pendingUnlock ? pendingUnlock.slice(0, 10) : '';
    tap();
  });
  sheet.querySelector('#capdate')?.addEventListener('change', (e) => {
    pendingUnlock = e.target.value ? new Date(e.target.value + 'T09:00:00').toISOString() : null;
    sheet.querySelectorAll('[data-cap]').forEach((x) => x.classList.remove('on'));
  });

  sheet.querySelectorAll('.moodbtn').forEach((b) => {
    b.onclick = () => {
      const n = Number(b.dataset.mood);
      tap();
      pendingMood = pendingMood === n ? null : n;
      sheet.querySelectorAll('.moodbtn').forEach((x) =>
        x.classList.toggle('on', Number(x.dataset.mood) === pendingMood));
    };
  });
  sheet.querySelector('#cancel').onclick = closeSheet;
  sheet.querySelector('#save').onclick = () => saveMoment(kind, val?.value || '');
}

function wirePhoto(sheet) {
  const pf = sheet.querySelector('#pf');
  sheet.querySelector('#pick').onclick = () => pf.click();
  pf.onchange = async () => {
    const f = pf.files[0]; if (!f) return;
    pendingPhoto = await shrink(f); showPreview(sheet);
  };
  sheet.querySelector('#opencam').onclick = () => startCamera(sheet);
  sheet.querySelector('#camswitch').onclick = () => {
    facing = facing === 'environment' ? 'user' : 'environment'; startCamera(sheet);
  };
  sheet.querySelector('#shutter').onclick = () => snap(sheet);
}

async function startCamera(sheet) {
  const U = state.L.ui;
  if (!navigator.mediaDevices?.getUserMedia) return toast(U.camera.unavailable, true);
  stopCamera();
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1600 } }, audio: false });
    sheet.querySelector('#cam').srcObject = camStream;
    sheet.querySelector('#camwrap').style.display = 'block';
    sheet.querySelector('#opencam').style.display = 'none';
    sheet.querySelector('#pv').style.display = 'none';
  } catch { toast(U.camera.denied, true); }
}
function stopCamera() { if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; } }

function snap(sheet) {
  const video = sheet.querySelector('#cam');
  if (!video || !video.videoWidth) return;
  const tier = sizes.PHOTO_QUALITY[state.settings.photoQuality || sizes.DEFAULT_PHOTO_QUALITY]
               || sizes.PHOTO_QUALITY.balanced;
  let w = video.videoWidth, h = video.videoHeight;
  if (w > tier.maxDim || h > tier.maxDim) {
    const r = Math.min(tier.maxDim / w, tier.maxDim / h);
    w = Math.round(w * r); h = Math.round(h * r);
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(video, 0, 0, w, h);
  pendingPhoto = sizes.encodeCanvas(c, state.settings.photoQuality || sizes.DEFAULT_PHOTO_QUALITY);
  stopCamera();
  sheet.querySelector('#camwrap').style.display = 'none';
  showPreview(sheet);
}
function showPreview(sheet) {
  const pv = sheet.querySelector('#pv');
  pv.src = pendingPhoto; pv.style.display = 'block';
  const oc = sheet.querySelector('#opencam');
  if (oc) { oc.style.display = ''; oc.textContent = state.L.ui.camera.retake; }
}

function wireGeo(sheet, val) {
  const U = state.L.ui;
  sheet.querySelector('#geo').onclick = () => {
    if (!navigator.geolocation) return toast(U.toasts.noLocation, true);
    toast(U.toasts.locating);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: la, longitude: lo } = pos.coords;
        if (!val.value.trim()) val.value = `${la.toFixed(3)}, ${lo.toFixed(3)}`;
        toast(U.toasts.locationAdded);
      },
      () => toast(U.toasts.locationDenied, true),
      { timeout: 8000, enableHighAccuracy: false });
  };
}

/* ---- voice ---- */
function wireVoice(sheet, val) {
  const U = state.L.ui;
  pendingAudio = null;
  const btn = sheet.querySelector('#recbtn');
  const time = sheet.querySelector('#rectime');
  const hint = sheet.querySelector('#rechint');
  const player = sheet.querySelector('#recplay');

  btn.onclick = async () => {
    if (recorder?.recording) {
      const out = await recorder.stop();
      recorder = null;
      btn.classList.remove('on');
      if (out) {
        pendingAudio = out;
        player.src = out.dataUrl;
        player.style.display = '';
        hint.textContent = U.rerecord;
        time.textContent = formatDuration(out.seconds);
      } else {
        hint.textContent = U.record;
      }
      return;
    }
    if (!canRecord()) return toast(U.voiceNoMic, true);
    try {
      const aq = sizes.AUDIO_QUALITY[state.settings.audioQuality || sizes.DEFAULT_AUDIO_QUALITY]
                 || sizes.AUDIO_QUALITY.balanced;
      recorder = new Recorder({ bitrate: aq.bitrate });
      await recorder.start((secs) => {
        time.textContent = formatDuration(secs);
        if (secs >= MAX_SECONDS - 0.3) btn.click();
      });
      tap();
      btn.classList.add('on');
      hint.textContent = U.recording;
      player.style.display = 'none';
    } catch {
      recorder = null;
      toast(U.voiceDenied, true);
    }
  };

  const dbtn = sheet.querySelector('#dictate');
  if (dbtn) dbtn.onclick = () => startDictation(dbtn, val);
}

function startDictation(btn, field) {
  const U = state.L.ui;
  if (dictation) {
    const text = dictation.stop();
    dictation = null;
    btn.textContent = U.dictate;
    if (text && field) field.value = (field.value ? field.value + ' ' : '') + text;
    return;
  }
  const go = () => {
    dictation = new Dictation({ locale: state.L.code });
    const ok = dictation.start(
      (finalText, interim) => { if (field) field.value = (finalText + ' ' + interim).trim(); },
      () => { dictation = null; btn.textContent = U.dictate; toast(U.dictateUnavailable, true); }
    );
    if (ok) btn.textContent = U.dictateOff;
    else { dictation = null; toast(U.dictateUnavailable, true); }
  };

  if (state.settings.dictateOk) return go();
  if (!confirm(`${U.dictateWarnTitle}\n\n${U.dictateWarnBody}`)) return;
  saveSettings({ dictateOk: true }).then(go);
}

function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const fr = new FileReader();
    fr.onload = () => { img.src = fr.result; };
    fr.onerror = reject;
    img.onload = () => {
      const max = 1200;
      let { width: w, height: h } = img;
      if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    fr.readAsDataURL(file);
  });
}

async function saveMoment(kind, text) {
  const U = state.L.ui;
  const label = text.trim();
  if (!label && !pendingPhoto && !pendingMood && !pendingAudio) { toast(U.toasts.addSomething, true); return; }

  const signal = { kind, label, text: label, at: new Date().toISOString(),
                   subject: detectSubject(label), photo: pendingPhoto };
  const g = guard(signal, state.vault);
  if (!g.accepted) {
    if (g.sealed) { await store.bumpWithheld(dayKey(new Date())); await refresh(); }
    closeSheet(); render();
    toast(g.sealed ? U.withheldBody : g.reason, true);
    return;
  }

  const moment = compose(signal, state.moments, state.L);
  moment.photo = pendingPhoto;
  moment.mood = pendingMood;
  if (pendingAudio) {
    moment.audio = pendingAudio.dataUrl;
    moment.audioSeconds = pendingAudio.seconds;
  }
  if (pendingUnlock) moment.unlockAt = pendingUnlock;
  moment.editedAt = new Date().toISOString();
  await withLock(LOCK_WRITE, () => store.putMoment(moment));
  const sealedUntil = pendingUnlock;
  pendingPhoto = null; pendingMood = null; pendingAudio = null; pendingUnlock = null;
  await refresh();
  state.tab = 'today'; renderTabs(); render();
  closeSheet();
  tap(14);
  toast(sealedUntil
    ? fill(U.capsuleSealed, { d: new Date(sealedUntil).toLocaleDateString(state.L.code) })
    : U.toasts.kept);

  publishWidgetSnapshot();
  if (state.pass) withLock(LOCK_SYNC, () => backup.syncNow(state.pass)).catch(() => {});
}

const SUBJECT_WORDS = {
  banking: ['bank', 'iban', 'account number', 'sort code', 'credit card', 'balance', 'banco', 'cuenta',
            'banque', 'konto', 'مصرف', 'حساب', 'benki', 'बैंक', '银行', '銀行', 'akhawunti'],
  health: ['diagnos', 'prescription', 'blood test', 'therapy', 'receta', 'ordonnance', 'rezept',
           'تشخيص', 'daktari', 'निदान', '诊断', '診断'],
  messages: ['whatsapp thread', 'private message', 'mensaje privado', 'message privé',
             'رسالة خاصة', 'ujumbe binafsi', 'निजी संदेश', '私信', '非公開メッセージ'],
  passwords: ['password', 'passcode', 'pin code', '2fa', 'otp', 'contraseña', 'senha', 'mot de passe',
              'passwort', 'كلمة المرور', 'nenosiri', 'पासवर्ड', '密码', 'パスワード', 'iphasiwedi'],
};
function detectSubject(text) {
  const t = (text || '').toLowerCase();
  for (const [subject, words] of Object.entries(SUBJECT_WORDS))
    if (words.some((w) => t.includes(w))) return subject;
  return null;
}

/* ================================================================== */
/* time capsules                                                       */
/* ================================================================== */
async function renderCapsules(host) {
  if (!host) return;
  const U = state.L.ui;
  const all = state.all || [];

  // anything that came due since the last visit deserves announcing
  const lastSeen = await store.getMeta('lastSeenAt', null);
  const opened = newlyOpened(all, lastSeen);
  await store.setMeta('lastSeenAt', new Date().toISOString());

  const waiting = lockedMoments(all);
  const next = nextCapsule(all);

  host.innerHTML = [
    ...opened.map((m) => `<div class="birthday">
      <span class="bk">✦ ${esc(U.capsuleOpened)}</span>
      <h3>${esc(m.title)}</h3>
      <p>${esc(m.placard)}</p>
    </div>`),
    waiting.length ? `<div class="holidaybox" style="border-left-color:var(--slate)">
      <span class="hk" style="color:var(--slate)">${esc(U.capsuleTitle)}</span>
      <h4>${esc(plural(waiting.length, U.capsuleWaiting))}</h4>
      ${next ? `<p>${esc(fill(U.capsuleNext, { d: next.daysAway }))}</p>` : ''}
    </div>` : '',
  ].join('');
}

/* ================================================================== */
/* today in history — a separate pane from your own day               */
/* ================================================================== */
let historyExtra = null;

async function renderWorldHistory(host) {
  if (!host) return;
  if (state.settings.historyOff) return;
  const U = state.L.ui;
  const today = new Date();
  let events = history.forDate(today);
  if (historyExtra) events = history.merge(events, historyExtra);
  if (!events.length) return;

  const show = events.slice(0, state.settings.historyExpanded ? 6 : 2);
  host.innerHTML = `<div class="worldbox">
    <span class="lbl">${ICONS.hourglass} ${esc(U.history)}</span>
    ${show.map((e) => `<div class="witem">
      <span class="wyear">${e.year}<span class="wago">${esc(fill(U.historyAgo, { n: history.yearsAgo(e.year, today) }))}</span></span>
      <p>${esc(e.text)}</p>
      <span class="wtag t-${esc(e.tag)}">${esc(U.historyTags[e.tag] || e.tag)}</span>
    </div>`).join('')}
    ${events.length > 2 ? `<button class="wmore" id="wmore">${esc(state.settings.historyExpanded ? U.back : U.historyMore)}</button>` : ''}
  </div>`;

  host.querySelector('#wmore')?.addEventListener('click', async () => {
    await saveSettings({ historyExpanded: !state.settings.historyExpanded });
    renderWorldHistory(host);
  });

  // quietly enrich when there is a connection and permission to do so
  if (!historyExtra && navigator.onLine && state.settings.historyOnline) {
    history.enrich(today).then((extra) => {
      if (extra?.length) { historyExtra = extra; renderWorldHistory(host); }
    }).catch(() => {});
  }
}

/* ================================================================== */
/* sharing — the quiet growth loop                                    */
/* ================================================================== */
async function shareMoment(id) {
  const U = state.L.ui;
  const m = state.moments.find((x) => String(x.id) === String(id));
  if (!m) return;
  toast(U.sharing);
  try {
    const blob = await renderMoment(m, { locale: state.L.code, rtl: state.L.dir === 'rtl' });
    const res = await shareImage(blob, `curio-${m.accession || 'moment'}.png`, U.shareText);
    if (res !== 'cancelled') toast(res === 'shared' ? U.shared : U.savedImage);
  } catch { toast(U.toasts.notArchive, true); }
}

async function shareToday() {
  const U = state.L.ui;
  const today = dayKey(new Date());
  const mine = momentsFor(today);
  if (!mine.length) return toast(U.toasts.addSomething, true);
  toast(U.sharing);
  try {
    const day = composeDay(today, mine, state.withheld[today] || 0, state.L);
    const blob = await renderDay(day, mine, { locale: state.L.code, rtl: state.L.dir === 'rtl' });
    const res = await shareImage(blob, `curio-${today}.png`, U.shareText);
    if (res !== 'cancelled') toast(res === 'shared' ? U.shared : U.savedImage);
  } catch { toast(U.toasts.notArchive, true); }
}

/* ================================================================== */
/* install prompt                                                     */
/* ================================================================== */
let deferredInstall = null;
try { addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  maybeShowInstall();
}); } catch { /* unsupported browsers simply never prompt */ }

const isStandalone = () => {
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch { /* some webviews have no matchMedia */ }
  return navigator.standalone === true;
};
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent || '') && !window.MSStream;

async function maybeShowInstall() {
  try {
  if (isStandalone()) return;
  if (state.settings.installDismissed) return;
  if (state.moments.length < 2) return;       // earn the ask first
  const host = $('installbar'); if (!host) return;
  const U = state.L.ui;
  if (!deferredInstall && !isIos()) return;
  host.innerHTML = `<div class="installbar">
    <div class="ib-tx"><b>${esc(U.installTitle)}</b><span>${esc(deferredInstall ? U.installBody : U.installIos)}</span></div>
    ${deferredInstall ? `<button class="ib-go" id="ibgo">${esc(U.installBtn)}</button>` : ''}
    <button class="ib-x" id="ibx" aria-label="${esc(U.installLater)}">×</button>
  </div>`;
  const go = host.querySelector('#ibgo');
  if (go) go.onclick = async () => {
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    host.innerHTML = '';
  };
  host.querySelector('#ibx').onclick = async () => {
    await saveSettings({ installDismissed: true });
    host.innerHTML = '';
  };
  } catch { /* the install hint is a nicety; never let it break a render */ }
}

/* ================================================================== */
function handleShareTarget() {
  const p = new URLSearchParams(location.search);
  const shared = [p.get('title'), p.get('text'), p.get('url')].filter(Boolean).join(' ').trim();
  if (!shared) return;
  history.replaceState({}, '', location.pathname);
  captureFor('read');
  setTimeout(() => { const v = $('sheet').querySelector('#val'); if (v) v.value = shared; }, 120);
}

/* ================================================================== */
/* widget bridge — feeds the native home-screen and watch widgets      */
/* ================================================================== */
/**
 * Native shells (see store/ios and store/android) call this and write the
 * result into the shared container the widget reads from. In a plain browser
 * nothing is listening, and it simply does nothing.
 */
async function publishWidgetSnapshot() {
  try {
    const today = dayKey(new Date());
    const mine = momentsFor(today);
    const sk = streaks(state.moments);
    const otd = onThisDay(state.moments)[0];
    const day = composeDay(today, mine, state.withheld[today] || 0, state.L);

    const snapshot = history.widgetSnapshot({
      locale: state.L.code,
      diary: {
        title: day.title,
        placard: mine[0]?.placard || null,
        kept: mine.length,
        streak: sk.current,
        onThisDay: otd ? { title: otd.title, placard: otd.placard, yearsAgo: otd.yearsAgo } : null,
      },
    });

    const json = JSON.stringify(snapshot);
    // iOS shell (WKScriptMessageHandler) and Android shell (JavascriptInterface)
    window.webkit?.messageHandlers?.curioWidget?.postMessage(json);
    window.CurioNative?.publishWidget?.(json);
    await store.setMeta('widgetSnapshot', snapshot);
    return snapshot;
  } catch {
    return null;
  }
}
window.curioWidgetSnapshot = publishWidgetSnapshot;   // the shells can also pull it

/* ================================================================== */
/* keeping the app up to date                                          */
/* ================================================================== */
/**
 * The old registration installed a worker and then never looked again, so a
 * published change could sit unseen for days. This watches for a new one,
 * says so plainly, and lets the person take it when they are ready.
 */
let swRegistration = null;

function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      swRegistration = reg;

      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const incoming = reg.installing;
        if (!incoming) return;
        incoming.addEventListener('statechange', () => {
          // "installed" with an existing controller means: a newer version is ready
          if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBar(incoming);
          }
        });
      });

      // look again when the app comes back to the foreground
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
      setTimeout(() => reg.update().catch(() => {}), 3000);
    } catch { /* no service worker is not fatal; the app still runs */ }
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

function showUpdateBar(worker) {
  const U = state.L?.ui || {};
  if ($('updatebar')) return;
  const bar = el(`<div class="updatebar" id="updatebar">
    <div class="ub-tx"><b>${esc(U.updateReady || 'A new version is ready')}</b>
      <span>${esc(U.updateBody || '')}</span></div>
    <button class="ub-go" id="ubgo">${esc(U.updateNow || 'Reload')}</button>
  </div>`);
  document.body.appendChild(bar);
  bar.querySelector('#ubgo').onclick = () => {
    bar.remove();
    worker.postMessage({ type: 'skipWaiting' });
    setTimeout(() => location.reload(), 400);
  };
}

/** Ask the server outright, for when someone has just published a change. */
async function checkForUpdates() {
  const U = state.L.ui;
  if (!swRegistration) { location.reload(); return; }
  toast(U.checking);
  try {
    await swRegistration.update();
    if (swRegistration.waiting || swRegistration.installing) {
      toast(U.updateFound);
      setTimeout(() => {
        (swRegistration.waiting || swRegistration.installing)?.postMessage({ type: 'skipWaiting' });
        setTimeout(() => location.reload(), 400);
      }, 700);
    } else {
      toast(U.upToDate);
    }
  } catch {
    location.reload();
  }
}

boot();
