// Passwords and sign-in tokens.
//  - Passwords are never stored: only a scrypt hash with a random salt per account.
//  - A token is "<kind>.<id>.<expiry>.<version>.<signature>", signed with the server's secret
//    key (HMAC-SHA256). Changing the version (log out everywhere) makes old tokens useless.
import { scrypt as scryptCb, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const hash = (await scrypt(String(password).normalize('NFKC'), salt, 32, PARAMS)).toString('base64url');
  return { salt, hash, algo: 'scrypt-16384-8-1' };
}

export async function checkPassword(password, rec) {
  if (!rec?.salt || !rec?.hash) return false;
  const got = await scrypt(String(password).normalize('NFKC'), rec.salt, 32, PARAMS);
  const want = Buffer.from(rec.hash, 'base64url');
  return want.length === got.length && timingSafeEqual(got, want);
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString('utf8');
const sign = (key, msg) => createHmac('sha256', key).update(msg).digest('base64url');

export function makeToken(key, kind, id, version, ttlMs, now) {
  const body = `${kind}.${b64(id)}.${now + ttlMs}.${version}`;
  return `${body}.${sign(key, body)}`;
}

/** Returns { kind, id, version } or null. */
export function readToken(key, token, now) {
  if (typeof token !== 'string' || token.length > 400) return null;
  const parts = token.split('.');
  if (parts.length !== 5) return null;
  const [kind, id64, exp, version, sig] = parts;
  const body = `${kind}.${id64}.${exp}.${version}`;
  const want = Buffer.from(sign(key, body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (!(Number(exp) > now)) return null;
  let id;
  try { id = unb64(id64); } catch { return null; }
  return { kind, id, version: Number(version) };
}
