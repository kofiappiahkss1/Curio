/**
 * Curio — one writer at a time.
 *
 * Two tabs open, or a phone syncing while a laptop writes, and two pieces of
 * code can merge the same archive at once. The result is not a crash but
 * something worse: a diary that quietly loses an entry.
 *
 * The Web Locks API solves this properly where it exists. Where it does not,
 * an in-page queue at least keeps a single tab honest, which is the common
 * case. Either way callers just await `withLock`.
 */

const queues = new Map();          // fallback: one promise chain per name

export const hasWebLocks = () =>
  typeof navigator !== 'undefined' && !!navigator.locks?.request;

/**
 * Run `fn` with exclusive hold of `name`.
 * @param opts.timeout give up rather than hang forever if a tab died mid-write
 */
export async function withLock(name, fn, { timeout = 15000 } = {}) {
  if (hasWebLocks()) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    try {
      return await navigator.locks.request(name, ctrl ? { signal: ctrl.signal } : {}, fn);
    } catch (e) {
      if (e?.name === 'AbortError') return fn();     // waited long enough; proceed alone
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // no Web Locks: serialise within this tab
  const prev = queues.get(name) || Promise.resolve();
  let release;
  const mine = new Promise((r) => { release = r; });
  queues.set(name, prev.then(() => mine));
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (queues.get(name) === mine) queues.delete(name);
  }
}

/** Is somebody else already inside this lock? Only for showing a hint. */
export async function isHeld(name) {
  if (!hasWebLocks() || !navigator.locks.query) return false;
  try {
    const { held = [] } = await navigator.locks.query();
    return held.some((l) => l.name === name);
  } catch { return false; }
}

export const LOCK_SYNC = 'curio-sync';
export const LOCK_WRITE = 'curio-write';
