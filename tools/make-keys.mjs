#!/usr/bin/env node
/**
 * Make the signing key pair. Run this once, keep the private half safe, and
 * paste the public half into licence.js.
 *
 *   node tools/make-keys.mjs
 *
 * The private key is what lets you sell. If you lose it you cannot issue any
 * more licences for keys already in the wild; if someone else gets it they can
 * issue their own. Treat it like the keys to the shop.
 */
import { webcrypto as crypto } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';

const pair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);

const out = 'curio-signing-key.json';
if (existsSync(out)) {
  console.error(`\n  ${out} already exists. Move it aside first — overwriting it would`);
  console.error('  invalidate every licence you have already sold.\n');
  process.exit(1);
}
writeFileSync(out, JSON.stringify({ privateKey: priv, publicKey: pub }, null, 2));

console.log(`
  Written: ${out}   <-- keep this private, and back it up

  Paste this into licence.js, replacing PUBLIC_KEY_JWK:

export const PUBLIC_KEY_JWK = {
  kty: 'EC',
  crv: 'P-256',
  x: '${pub.x}',
  y: '${pub.y}',
  ext: true,
};
`);
