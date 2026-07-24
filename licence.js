/**
 * The Curio — licences.
 *
 * THE PROBLEM: how do you sell an upgrade when there is no server?
 *
 * The usual answer is a licence server that the app phones home to. That would
 * undo the one thing this product is built on, so instead the licence carries
 * its own proof.
 *
 *   You hold a private key. It never leaves your machine and is never shipped.
 *   The app holds only the matching public key.
 *   After someone pays, you sign a small licence for them.
 *   Their copy verifies the signature on the device, offline, once, for ever.
 *
 * A licence cannot be forged without your private key, cannot be checked by
 * anyone but the person holding it, and works on a plane. No account, no
 * activation server, nothing to keep running, nothing to leak.
 *
 * ON HONESTY: a determined person can edit the JavaScript and skip the check.
 * That is true of every client-side licence ever written, including the ones
 * with servers. This is built for the people who will pay, not against the
 * people who will not — and it costs those people nothing.
 */

export const TIERS = { FREE: 'free', BUSINESS: 'business' };
export const LICENCE_PREFIX = 'CURIO-1.';

/**
 * The public half of the signing key. Replace this with your own before you
 * sell anything — `node tools/make-keys.mjs` prints a matching pair.
 * Being public is the point: it can only verify, never sign.
 */
export const PUBLIC_KEY_JWK = {
  kty: 'EC',
  crv: 'P-256',
  x: 'REPLACE-WITH-YOUR-PUBLIC-KEY-X',
  y: 'REPLACE-WITH-YOUR-PUBLIC-KEY-Y',
  ext: true,
};

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = {
  from: (buf) => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  to: (str) => {
    const norm = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(norm + '='.repeat((4 - (norm.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

const subtle = () => {
  const c = globalThis.crypto?.subtle;
  if (!c) throw new Error('NO_CRYPTO');
  return c;
};

/**
 * A licence is two dot-separated parts: the claims, and the signature over them.
 *   CURIO-1.<claims>.<signature>
 * The claims are readable on purpose — a buyer can see exactly what they bought.
 */
export function encodeLicence(claims, signature) {
  return `${LICENCE_PREFIX}${b64.from(enc.encode(JSON.stringify(claims)))}.${b64.from(signature)}`;
}

export function decodeLicence(text) {
  const raw = String(text || '').trim().replace(/\s+/g, '');
  if (!raw.startsWith(LICENCE_PREFIX)) throw new Error('NOT_A_LICENCE');
  const body = raw.slice(LICENCE_PREFIX.length);
  const dot = body.indexOf('.');
  if (dot < 0) throw new Error('MALFORMED');
  const claimsB64 = body.slice(0, dot);
  const sigB64 = body.slice(dot + 1);
  let claims;
  try {
    claims = JSON.parse(dec.decode(b64.to(claimsB64)));
  } catch { throw new Error('MALFORMED'); }
  return { claims, claimsB64, signature: b64.to(sigB64) };
}

/** Read a licence without verifying it — for showing what a key claims to be. */
export function peek(text) {
  try { return decodeLicence(text).claims; } catch { return null; }
}

async function importPublicKey(jwk = PUBLIC_KEY_JWK) {
  return subtle().importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
}

/**
 * Check a licence properly: the signature must be ours, and the licence must
 * not have expired.
 * @returns {Promise<{valid, reason?, claims?}>}
 */
export async function verify(text, { now = new Date(), publicKey = PUBLIC_KEY_JWK } = {}) {
  let parsed;
  try { parsed = decodeLicence(text); } catch (e) { return { valid: false, reason: e.message }; }

  if (String(publicKey.x || '').startsWith('REPLACE-WITH')) {
    return { valid: false, reason: 'NO_KEY_CONFIGURED' };
  }

  let ok = false;
  try {
    const key = await importPublicKey(publicKey);
    ok = await subtle().verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      parsed.signature,
      enc.encode(parsed.claimsB64),
    );
  } catch {
    return { valid: false, reason: 'UNVERIFIABLE' };
  }
  if (!ok) return { valid: false, reason: 'BAD_SIGNATURE' };

  const c = parsed.claims;
  if (c.expires) {
    const until = new Date(c.expires);
    if (!Number.isNaN(until.getTime()) && until < now) {
      return { valid: false, reason: 'EXPIRED', claims: c };
    }
  }
  if (c.tier !== TIERS.BUSINESS) return { valid: false, reason: 'UNKNOWN_TIER', claims: c };

  return { valid: true, claims: c };
}

/** A short code a buyer can quote in an email without exposing the whole key. */
export async function shortCode(text) {
  const h = await subtle().digest('SHA-256', enc.encode(String(text || '')));
  const bytes = new Uint8Array(h).slice(0, 4);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase().match(/.{1,4}/g).join('-');
}

/* ------------------------------------------------------------------ *
 * what each tier includes
 * ------------------------------------------------------------------ */

export const FEATURES = {
  workspaces:   { tier: TIERS.BUSINESS, key: 'workspaces' },
  templates:    { tier: TIERS.BUSINESS, key: 'templates' },
  integrity:    { tier: TIERS.BUSINESS, key: 'integrity' },
  reports:      { tier: TIERS.BUSINESS, key: 'reports' },
  bulkExport:   { tier: TIERS.BUSINESS, key: 'bulkExport' },
};

/**
 * Everything the personal diary does stays free, for ever. This only ever
 * gates the work-shaped additions.
 */
export function has(feature, tier = TIERS.FREE) {
  const f = FEATURES[feature];
  if (!f) return true;                      // anything unlisted is free
  return tier === TIERS.BUSINESS ? true : f.tier === TIERS.FREE;
}

export const isBusiness = (tier) => tier === TIERS.BUSINESS;

/** A licence, tidied for display. */
export function describe(claims, locale = 'en-GB') {
  if (!claims) return null;
  return {
    holder: claims.name || claims.email || 'Licensed',
    email: claims.email || null,
    id: claims.id || null,
    seats: claims.seats || 1,
    issued: claims.issued ? new Date(claims.issued).toLocaleDateString(locale) : null,
    expires: claims.expires ? new Date(claims.expires).toLocaleDateString(locale) : null,
    perpetual: !claims.expires,
  };
}
