#!/usr/bin/env node
/**
 * Issue a licence after someone has paid.
 *
 *   node tools/issue-licence.mjs "Acme Ltd" buyer@example.com
 *   node tools/issue-licence.mjs "Acme Ltd" buyer@example.com --seats 5
 *   node tools/issue-licence.mjs "Trial Co" t@example.com --days 30
 *
 * Prints the key to send them. They paste it into Settings → Business.
 * Nothing is transmitted; this runs entirely on your machine.
 */
import { webcrypto as crypto } from 'node:crypto';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) =>
  !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));

const name = positional[0];
const email = positional[1];
if (!name) {
  console.error('\n  usage: node tools/issue-licence.mjs "Buyer name" email@example.com [--seats N] [--days N]\n');
  process.exit(1);
}

const { privateKey } = JSON.parse(readFileSync('curio-signing-key.json', 'utf8'));
const key = await crypto.subtle.importKey('jwk', privateKey,
  { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

const days = Number(flag('days', 0));
const id = 'CUR-' + [...crypto.getRandomValues(new Uint8Array(4))]
  .map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase().match(/.{1,4}/g).join('-');

const claims = {
  v: 1,
  tier: 'business',
  name,
  email: email || null,
  seats: Number(flag('seats', 1)),
  id,
  issued: new Date().toISOString().slice(0, 10),
  expires: days ? new Date(Date.now() + days * 86400000).toISOString().slice(0, 10) : null,
};

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const claimsB64 = b64url(new TextEncoder().encode(JSON.stringify(claims)));
const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key,
  new TextEncoder().encode(claimsB64));
const licence = `CURIO-1.${claimsB64}.${b64url(sig)}`;

console.log(`
  Licence for ${name}${email ? ` <${email}>` : ''}
  ${claims.seats} seat${claims.seats > 1 ? 's' : ''} · ${claims.expires ? `expires ${claims.expires}` : 'perpetual'} · ${id}

${licence}

  Send that to them. They paste it into Settings → Business.
`);
