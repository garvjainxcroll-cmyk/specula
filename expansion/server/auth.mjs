// Passwords, sign-in tokens and the permission matrix. Everything here runs on the
// server: the website never decides what a person may do, it only asks.
//
// Passwords: PBKDF2-SHA256, 210,000 iterations, a random salt per user.
// Tokens: base64url(payload).HMAC-SHA256, signed with a random key kept in the store
// (or JACO_TOKEN_SECRET). A token names the user and their token version; changing a
// password, disabling a user or "sign out everywhere" raises the version and ends it.

const enc = new TextEncoder();
const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64url');
export const b64json = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const unb64json = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

export const PBKDF2_ITERATIONS = 210000;

export async function hashPassword(pass, salt, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' }, key, 256);
  return b64(bits);
}
export async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
export async function sha256hex(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Buffer.from(new Uint8Array(d)).toString('hex');
}
export function randomId(n = 12, alphabet = 'abcdefghijkmnpqrstuvwxyz23456789') {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(a, (x) => alphabet[x % alphabet.length]).join('');
}
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function issueToken(secret, user, nowMs, hours = 12) {
  const payload = b64json({ u: user.id, v: user.tokenVer || 0, iat: nowMs, exp: nowMs + hours * 3600 * 1000 });
  return `${payload}.${await hmac(secret, payload)}`;
}
export async function readToken(secret, token, nowMs) {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  if (!safeEqual(sig, await hmac(secret, payload))) return null;
  let p; try { p = unb64json(payload); } catch { return null; }
  if (!p || typeof p.exp !== 'number' || p.exp < nowMs) return null;
  return p;
}

export const ROLES = {
  super: 'Super Administrator',
  operator: 'Event Operator',
  viewer: 'Read-only Control Officer',
};
export const GRANTS = {
  config: 'May edit event configuration (teams, regions, CVs, rules, assumptions)',
  formulas: 'May edit formula and scoring settings (when they are not locked)',
};

// permission → roles that hold it
const MATRIX = {
  view: ['super', 'operator', 'viewer'],
  export: ['super', 'operator', 'viewer'],
  'audit.view': ['super', 'operator', 'viewer'],
  'auction.record': ['super', 'operator'],
  'deploy.record': ['super', 'operator'],
  'compliance.record': ['super', 'operator'],
  'calc.run': ['super', 'operator'],
  'backup.create': ['super', 'operator'],
  'backup.download': ['super', 'operator'],
  'practice.load': ['super', 'operator'],
  'config.edit': ['super'],
  'formulas.edit': ['super'],
  'rules.approve': ['super'],
  'round.lock': ['super'],
  'round.finalise': ['super'],
  'correction': ['super'],
  'waiver': ['super'],
  'audit.revert': ['super'],
  'users.manage': ['super'],
  'session.manage': ['super'],
  'backup.restore': ['super'],
  'visibility.set': ['super'],
  'severity.set': ['super'],
  'formulas.lock': ['super'],
};
export const PERMISSIONS = Object.keys(MATRIX);

export function can(user, perm) {
  if (!user || !user.active) return false;
  if (MATRIX[perm]?.includes(user.role)) return true;
  if (user.role === 'operator' && perm === 'config.edit' && (user.grants || []).includes('config')) return true;
  if (user.role === 'operator' && perm === 'formulas.edit' && (user.grants || []).includes('formulas')) return true;
  return false;
}
export const permsOf = (user) => PERMISSIONS.filter((p) => can(user, p));

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, name: u.name, role: u.role, roleName: ROLES[u.role], grants: u.grants || [], active: !!u.active, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null, lockedUntil: u.lockedUntil || null };
}

export function passwordProblem(p) {
  if (typeof p !== 'string' || p.length < 10) return 'Use at least 10 characters.';
  if (p.length > 200) return 'Use at most 200 characters.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Use letters and at least one number.';
  return null;
}
