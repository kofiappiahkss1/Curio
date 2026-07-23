/**
 * Curio — portable encryption.
 *
 * This is what makes your archive survive a lost phone without a server.
 *
 * A Recovery Kit is your whole archive, encrypted with a key derived from a
 * passphrase you choose. You keep the file anywhere you like — your own cloud,
 * an email to yourself, a USB stick. On any new phone or laptop, Curio can
 * unlock it with the same passphrase and your diary is back, intact.
 *
 * We never see the passphrase or the file. There is nothing to hack because
 * there is nowhere for it to be stored but with you.
 *
 * Scheme:  PBKDF2-SHA256 (310,000 iterations, per-file random salt)
 *          -> AES-256-GCM (per-file random IV)
 * Both are standard WebCrypto — available on every modern phone and browser,
 * offline, with no library and no key from anyone.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF_ITERATIONS = 310000;   // OWASP-recommended floor for PBKDF2-SHA256
const SALT_BYTES = 16;
const IV_BYTES = 12;
export const MAGIC = 'CURIO-KIT-1';

const subtle = () => {
  const c = globalThis.crypto?.subtle;
  if (!c) throw new Error('This browser cannot encrypt (needs a secure page: https or localhost).');
  return c;
};

const b64 = {
  from: (buf) => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  to: (str) => {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

async function deriveKey(passphrase, salt, iterations = KDF_ITERATIONS) {
  const base = await subtle().importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt an archive object into a portable Recovery Kit.
 * The result is plain JSON — safe to store anywhere, readable only with the passphrase.
 */
export async function seal(archive, passphrase) {
  if (!passphrase || passphrase.length < 6)
    throw new Error('Choose a passphrase of at least 6 characters.');

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);

  const plaintext = enc.encode(JSON.stringify(archive));
  const cipher = await subtle().encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    magic: MAGIC,
    v: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, salt: b64.from(salt) },
    cipher: { name: 'AES-256-GCM', iv: b64.from(iv) },
    // unencrypted, so a person can identify a kit before unlocking it
    hint: {
      created: new Date().toISOString(),
      moments: Array.isArray(archive?.moments) ? archive.moments.length : 0,
      from: archive?.device || 'a phone',
    },
    data: b64.from(cipher),
  };
}

/** Decrypt a Recovery Kit back into the archive object. */
export async function unseal(kit, passphrase) {
  if (!kit || kit.magic !== MAGIC) throw new Error('That file is not a Curio Recovery Kit.');
  const salt = b64.to(kit.kdf.salt);
  const iv = b64.to(kit.cipher.iv);
  const key = await deriveKey(passphrase, salt, kit.kdf.iterations || KDF_ITERATIONS);

  let plain;
  try {
    plain = await subtle().decrypt({ name: 'AES-GCM', iv }, key, b64.to(kit.data));
  } catch {
    throw new Error('WRONG_PASSPHRASE');
  }
  return JSON.parse(dec.decode(plain));
}

/** Quick look inside a kit without the passphrase — for the restore screen. */
export function peek(kit) {
  if (!kit || kit.magic !== MAGIC) return null;
  return kit.hint || {};
}

/**
 * A short, human-readable fingerprint of a passphrase, so someone can confirm
 * they've written down the right one without ever revealing it.
 */
export async function fingerprint(passphrase) {
  const h = await subtle().digest('SHA-256', enc.encode('curio-fp:' + passphrase));
  const bytes = new Uint8Array(h).slice(0, 4);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase().match(/.{1,4}/g).join('-');
}

/** Rough strength read, so we can steer people away from a passphrase they'll regret. */
export function strength(p) {
  if (!p) return { score: 0, label: 'empty' };
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (p.length >= 20) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^\w\s]/.test(p)) score++;
  if (/\s/.test(p) && p.trim().split(/\s+/).length >= 3) score += 2;   // passphrases beat passwords
  const label = score <= 2 ? 'weak' : score <= 4 ? 'fair' : score <= 6 ? 'good' : 'strong';
  return { score: Math.min(score, 8), label };
}
