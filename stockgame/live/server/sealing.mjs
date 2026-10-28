// Sealing and opening the game with the game key (AES-GCM; the key comes from PBKDF2).
import { webcrypto as wc } from 'node:crypto';

const enc = new TextEncoder();
export const normaliseKey = (k) => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const b64 = (u) => Buffer.from(u).toString('base64');

async function aesFrom(key, salt, iterations, use) {
  const base = await wc.subtle.importKey('raw', enc.encode(normaliseKey(key)), 'PBKDF2', false, ['deriveKey']);
  return wc.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, [use]);
}

export async function sealGame(plain, key, iterations = 300000) {
  const salt = wc.getRandomValues(new Uint8Array(16));
  const iv = wc.getRandomValues(new Uint8Array(12));
  const aes = await aesFrom(key, salt, iterations, 'encrypt');
  const ct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(JSON.stringify(plain))));
  return { v: 1, salt: b64(salt), iterations, iv: b64(iv), ct: b64(ct) };
}

export async function openSealed(key, sealed) {
  try {
    const aes = await aesFrom(key, Buffer.from(sealed.salt, 'base64'), sealed.iterations, 'decrypt');
    const pt = await wc.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(sealed.iv, 'base64') }, aes, Buffer.from(sealed.ct, 'base64'));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return null;
  }
}
