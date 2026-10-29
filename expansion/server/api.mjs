// The Round 4 control server: sign-in, permissions, sessions, actions, audit, backups and
// exports. Runs inside the Netlify function (netlify/functions/api.mjs) and, for the tests
// and the local dev server, against an in-memory store with the same interface.
//
// Access rules (tested in tests/api.test.mjs):
//  - Every route except /api/health, /api/setup (only while no user exists) and
//    /api/login needs a valid sign-in token. There are no participant or judge accounts.
//  - Permissions are checked here, on the server, for every request (see auth.mjs).
//  - Each change is applied as one transaction: read the session, apply the action to it,
//    write it back only if nobody else wrote in between (otherwise retry from fresh data).
//  - A practice session is a separate document; nothing done in it can touch another session.

import { gzipSync } from 'node:zlib';
import { newSessionDoc } from '../src/data/seed.mjs';
import { applyAction, Refusal } from './actions.mjs';
import { officialCompute, snapshotInputs } from './results.mjs';
import { sessionView, sessionMeta, redactAudit } from './view.mjs';
import { computeAll } from '../src/engine/index.mjs';
import { hashPassword, issueToken, readToken, randomId, safeEqual, publicUser, permsOf, can, ROLES, GRANTS, passwordProblem, PBKDF2_ITERATIONS } from './auth.mjs';
import { refuse, need, str, reasonOf } from './validators.mjs';

const MAX_FAILED = 5;
const LOCK_MINUTES = 10;
const MAX_BACKUPS = 80;

// ---------------- responses ----------------

const SECURITY_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'x-frame-options': 'DENY' };
function json(body, status = 200, request = null) {
  const text = JSON.stringify(body);
  const headers = { 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS };
  if (request && text.length > 4096 && /\bgzip\b/.test(request.headers.get('accept-encoding') || '')) {
    return new Response(gzipSync(Buffer.from(text)), { status, headers: { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' } });
  }
  return new Response(text, { status, headers });
}
const fail = (status, error, extra = {}) => json({ ok: false, error, ...extra }, status);
function file(bytes, { name, type }) {
  return new Response(bytes, { status: 200, headers: { 'content-type': type, 'content-disposition': `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, ...SECURITY_HEADERS } });
}

// ---------------- storage ----------------

async function getJ(store, key) { return (await store.get(key)) ?? null; }
async function update(store, key, fn, { tries = 8, metadata = null } = {}) {
  for (let k = 0; k < tries; k++) {
    const cur = await store.getMeta(key);
    const next = await fn(cur ? cur.data : null);
    if (next === undefined) return cur ? cur.data : null;
    const md = typeof metadata === 'function' ? metadata(next) : metadata;
    const res = cur ? await store.set(key, next, { onlyIfMatch: cur.etag, metadata: md }) : await store.set(key, next, { onlyIfNew: true, metadata: md });
    if (res.modified) return next;
    await new Promise((r) => setTimeout(r, 10 + Math.random() * 30 * (k + 1)));
  }
  throw new Refusal('BUSY', 'The system is busy with another change. Please try again.');
}
const docKey = (id) => `sessions/${id}/doc`;
const docMeta = (d) => ({ rev: d.rev, updatedAt: d.updatedAt || null, updatedBy: d.updatedBy || null, name: d.name, mode: d.mode });

async function system(store, env) {
  let s = await getJ(store, 'system');
  if (!s) s = await update(store, 'system', (cur) => cur || { signingKey: randomId(48), createdAt: new Date().toISOString() });
  return { ...s, secret: env.TOKEN_SECRET || s.signingKey };
}
async function usersDoc(store) { return (await getJ(store, 'users')) || { list: [] }; }
async function indexDoc(store) { return (await getJ(store, 'sessions/index')) || { list: [] }; }
async function setIndex(store, fn) { return update(store, 'sessions/index', async (cur) => { const d = cur || { list: [] }; const out = await fn(structuredClone(d)); return out === undefined ? undefined : out; }); }

// ---------------- authentication ----------------

async function authUser(store, env, request) {
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  const sys = await system(store, env);
  const p = await readToken(sys.secret, token, Date.now());
  if (!p) return null;
  const u = (await usersDoc(store)).list.find((x) => x.id === p.u);
  if (!u || !u.active || (u.tokenVer || 0) !== p.v) return null;
  return u;
}

async function setup(store, env, body) {
  const users = await usersDoc(store);
  if (users.list.length) return fail(403, 'Setup is already complete. Sign in instead.');
  if (env.SETUP_CODE && !safeEqual(String(body.setupCode || ''), env.SETUP_CODE)) return json({ ok: false, refused: true, code: 'SETUP_CODE', error: 'The setup code is not correct.' }, 403);
  const username = String(body.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return json({ ok: false, refused: true, code: 'INVALID', error: 'Choose a username of 3–32 letters, numbers, dots or dashes.' });
  const pp = passwordProblem(body.password);
  if (pp) return json({ ok: false, refused: true, code: 'WEAK_PASSWORD', error: pp });
  const salt = randomId(24);
  const iter = env.PBKDF2_ITERATIONS || PBKDF2_ITERATIONS;
  const user = { id: randomId(10), username, name: str(body.name, 80, { field: 'Name' }) || username, role: 'super', grants: [], salt, iter, hash: await hashPassword(body.password, salt, iter), active: true, tokenVer: 0, failed: 0, lockedUntil: null, createdAt: new Date().toISOString(), createdBy: 'setup' };
  const out = await update(store, 'users', (cur) => { if (cur?.list?.length) return undefined; return { list: [user] }; });
  if (!out.list.some((u) => u.id === user.id)) return fail(403, 'Setup is already complete. Sign in instead.');
  const sys = await system(store, env);
  return json({ ok: true, token: await issueToken(sys.secret, user, Date.now(), env.TOKEN_HOURS || 12), user: publicUser(user), perms: permsOf(user) });
}

async function login(store, env, body) {
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const generic = { ok: false, refused: true, code: 'BAD_LOGIN', error: 'That username and password do not match.' };
  const users = await usersDoc(store);
  const u = users.list.find((x) => x.username === username);
  const now = Date.now();
  if (!u) { await hashPassword(password, 'no-such-user', env.PBKDF2_ITERATIONS || PBKDF2_ITERATIONS); return json(generic, 401); }
  if (u.lockedUntil && Date.parse(u.lockedUntil) > now) return json({ ok: false, refused: true, code: 'LOCKED', error: `Too many failed attempts. Try again after ${new Date(u.lockedUntil).toLocaleTimeString('en-IN')}, or ask a Super Administrator to unlock the account.` }, 429);
  const good = safeEqual(await hashPassword(password, u.salt, u.iter || PBKDF2_ITERATIONS), u.hash);
  const updated = await update(store, 'users', (cur) => {
    const d = structuredClone(cur);
    const x = d.list.find((y) => y.id === u.id);
    if (!x) return undefined;
    if (good) { x.failed = 0; x.lockedUntil = null; x.lastLoginAt = new Date(now).toISOString(); }
    else { x.failed = (x.failed || 0) + 1; if (x.failed >= MAX_FAILED) { x.lockedUntil = new Date(now + LOCK_MINUTES * 60000).toISOString(); x.failed = 0; } }
    return d;
  });
  if (!good) return json(generic, 401);
  const fresh = updated.list.find((y) => y.id === u.id);
  if (!fresh.active) return json({ ok: false, refused: true, code: 'DISABLED', error: 'This account is disabled.' }, 403);
  const sys = await system(store, env);
  return json({ ok: true, token: await issueToken(sys.secret, fresh, now, env.TOKEN_HOURS || 12), user: publicUser(fresh), perms: permsOf(fresh) });
}

async function changeUsers(store, actor, fn) {
  return update(store, 'users', async (cur) => { const d = structuredClone(cur || { list: [] }); await fn(d); return d; });
}

async function usersOp(store, env, actor, body) {
  need(can(actor, 'users.manage'), 'FORBIDDEN', 'Only a Super Administrator manages accounts.', null, 403);
  const op = body.op;
  const iter = env.PBKDF2_ITERATIONS || PBKDF2_ITERATIONS;
  let result = null;
  if (op === 'create') {
    const username = String(body.username || '').trim().toLowerCase();
    need(/^[a-z0-9._-]{3,32}$/.test(username), 'INVALID', 'Choose a username of 3–32 letters, numbers, dots or dashes.');
    need(ROLES[body.role], 'INVALID', 'Choose a role.');
    const pp = passwordProblem(body.password); if (pp) refuse('WEAK_PASSWORD', pp);
    const grants = (body.grants || []).filter((g) => GRANTS[g]);
    const salt = randomId(24);
    const hash = await hashPassword(body.password, salt, iter);
    await changeUsers(store, actor, (d) => {
      need(!d.list.some((u) => u.username === username), 'DUPLICATE', 'That username is already used.');
      const u = { id: randomId(10), username, name: str(body.name, 80, { field: 'Name' }) || username, role: body.role, grants: body.role === 'operator' ? grants : [], salt, iter, hash, active: true, tokenVer: 0, failed: 0, lockedUntil: null, createdAt: new Date().toISOString(), createdBy: actor.username };
      d.list.push(u); result = u;
    });
  } else {
    const target = (await usersDoc(store)).list.find((u) => u.id === body.id);
    need(target, 'NOT_FOUND', 'That account does not exist.');
    let hash = null; let salt = null;
    if (op === 'resetPassword') { const pp = passwordProblem(body.password); if (pp) refuse('WEAK_PASSWORD', pp); salt = randomId(24); hash = await hashPassword(body.password, salt, iter); }
    await changeUsers(store, actor, (d) => {
      const u = d.list.find((x) => x.id === body.id);
      const supers = d.list.filter((x) => x.role === 'super' && x.active);
      const lastSuper = u.role === 'super' && supers.length === 1;
      if (op === 'update') {
        if (body.role !== undefined) { need(ROLES[body.role], 'INVALID', 'Choose a role.'); need(!(lastSuper && body.role !== 'super'), 'LAST_SUPER', 'There must always be at least one active Super Administrator.'); u.role = body.role; }
        if (body.grants !== undefined) u.grants = u.role === 'operator' ? (body.grants || []).filter((g) => GRANTS[g]) : [];
        if (body.name !== undefined) u.name = str(body.name, 80, { field: 'Name' }) || u.username;
        if (body.active !== undefined) { need(!(lastSuper && !body.active), 'LAST_SUPER', 'There must always be at least one active Super Administrator.'); u.active = !!body.active; }
        u.tokenVer = (u.tokenVer || 0) + 1; // role changes take effect at once
      } else if (op === 'resetPassword') { u.salt = salt; u.hash = hash; u.iter = iter; u.tokenVer = (u.tokenVer || 0) + 1; u.failed = 0; u.lockedUntil = null; }
      else if (op === 'unlock') { u.failed = 0; u.lockedUntil = null; }
      else if (op === 'delete') { need(u.id !== actor.id, 'SELF', 'You cannot delete your own account.'); need(!lastSuper, 'LAST_SUPER', 'There must always be at least one active Super Administrator.'); d.list = d.list.filter((x) => x.id !== u.id); }
      else refuse('INVALID', 'Unknown account operation.');
      result = u;
    });
  }
  return json({ ok: true, user: publicUser(result), users: (await usersDoc(store)).list.map(publicUser) });
}

// ---------------- sessions ----------------

async function loadSession(store, id) {
  need(/^[a-z0-9]{6,24}$/.test(String(id || '')), 'NOT_FOUND', 'That session does not exist.', null, 404);
  const doc = await getJ(store, docKey(id));
  need(doc, 'NOT_FOUND', 'That session does not exist.', null, 404);
  return doc;
}

async function writeNewSession(store, doc) {
  const res = await store.set(docKey(doc.id), doc, { onlyIfNew: true, metadata: docMeta(doc) });
  if (!res.modified) refuse('BUSY', 'Please try again.');
  await setIndex(store, (d) => { d.list = d.list.filter((x) => x.id !== doc.id); d.list.push({ id: doc.id, name: doc.name, mode: doc.mode, createdAt: doc.createdAt, createdBy: doc.createdBy, archived: false }); return d; });
}

function auditFirst(doc, actor, summary, kind = 'session') {
  doc.auditSeq = (doc.auditSeq || 0) + 1;
  doc.audit.push({ seq: doc.auditSeq, at: new Date().toISOString(), user: { id: actor.id, username: actor.username, name: actor.name, role: actor.role }, action: kind, kind: 'session', target: { kind: 'session', id: doc.id }, summary, changes: [], reason: null, revert: null, revertedBy: null, mode: doc.mode });
}

async function backup(store, doc, actor, reason) {
  const at = new Date().toISOString();
  const key = `backups/${doc.id}/${at.replace(/[-:.TZ]/g, '')}-${randomId(4)}`;
  await store.set(key, { at, by: actor?.username || 'system', reason, sessionId: doc.id, rev: doc.rev, doc }, { metadata: { at, by: actor?.username || 'system', reason, rev: doc.rev } });
  const keys = await store.list(`backups/${doc.id}/`);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_BACKUPS))) { try { await store.del(k); } catch { /* keep going */ } }
  return key;
}

async function sessionsOp(store, actor, body) {
  const op = body.op;
  need(can(actor, 'session.manage'), 'FORBIDDEN', 'Only a Super Administrator manages event sessions.', null, 403);
  const now = new Date().toISOString();
  const index = await indexDoc(store);
  if (op === 'create' || op === 'duplicate' || op === 'import') {
    const mode = op === 'create' ? body.mode : 'practice';
    need(['official', 'practice'].includes(mode), 'INVALID', 'Choose official or practice.');
    if (mode === 'official') need(!index.list.some((s) => s.mode === 'official' && !s.archived), 'OFFICIAL_EXISTS', 'An official event session already exists. Archive it before creating another.');
    const id = randomId(10);
    const name = str(body.name, 80, { required: true, field: 'Session name' });
    let doc = newSessionDoc({ id, name, mode, createdAt: now, createdBy: actor.username });
    if (op === 'duplicate') {
      const src = await loadSession(store, body.sourceId);
      const inputs = snapshotInputs(src);
      doc = { ...doc, ...inputs, id, name, mode: 'practice', createdAt: now, createdBy: actor.username, sourceSessionId: src.id, rev: 0, calc: { draft: null }, finals: [], audit: [], auditSeq: 0 };
      if (body.includeResults === false) Object.assign(doc, { auction: newSessionDoc({ id, name, mode: 'practice', createdAt: now, createdBy: actor.username }).auction, round1: { status: 'open', lockedAt: null, lockedBy: null, snapshot: null, corrections: [], unlocks: [] }, round2: { status: 'open', submissions: {}, finalisedAt: null, reopenings: [] }, deployments: [], depSeq: 0, compliance: {} });
      else if (doc.round2.status === 'finalised') doc.round2 = { ...doc.round2, status: 'open' };
      auditFirst(doc, actor, `Created practice copy of “${src.name}”${body.includeResults === false ? ' (configuration only)' : ''}`);
    } else if (op === 'import') {
      const src = body.doc?.doc || body.doc;
      need(src && src.config && Array.isArray(src.employees) && Array.isArray(src.cities) && src.auction, 'INVALID', 'That file is not a session backup.');
      const inputs = snapshotInputs(src);
      doc = { ...doc, ...inputs, id, name, mode: 'practice', createdAt: now, createdBy: actor.username, sourceSessionId: src.id || null, rev: 0, calc: { draft: null }, finals: [], audit: [], auditSeq: 0 };
      if (doc.round2?.status === 'finalised') doc.round2 = { ...doc.round2, status: 'open' };
      try { computeAll(doc); } catch (e) { refuse('INVALID', `That backup cannot be loaded: ${e.message}`); }
      auditFirst(doc, actor, 'Created practice session from an uploaded backup file');
    } else {
      auditFirst(doc, actor, `Created ${mode} session “${name}” from the fictional sample data`);
    }
    await writeNewSession(store, doc);
    return json({ ok: true, session: sessionMeta(doc) });
  }
  const doc = await loadSession(store, body.id);
  if (op === 'archive') {
    if (!body.archived && doc.mode === 'official') need(!index.list.some((s) => s.mode === 'official' && !s.archived && s.id !== doc.id), 'OFFICIAL_EXISTS', 'Another official session is active. Archive it first.');
    await setIndex(store, (d) => { const s = d.list.find((x) => x.id === doc.id); if (s) s.archived = !!body.archived; return d; });
    await mutate(store, doc.id, actor, (d) => { auditFirst(d, actor, body.archived ? 'Archived the session' : 'Restored the session from the archive'); });
    return json({ ok: true });
  }
  if (op === 'delete') {
    need(String(body.confirmText || '') === doc.name, 'CONFIRM_REQUIRED', `Type the session name exactly (“${doc.name}”) to delete it.`);
    if (doc.mode === 'official') need(index.list.find((s) => s.id === doc.id)?.archived, 'ARCHIVE_FIRST', 'Archive the official session before deleting it.');
    await backup(store, doc, actor, 'Before deleting the session');
    await store.del(docKey(doc.id));
    await setIndex(store, (d) => { d.list = d.list.filter((x) => x.id !== doc.id); return d; });
    return json({ ok: true, note: 'Deleted. A final backup was kept and can be imported as a practice session.' });
  }
  if (op === 'reset') {
    const want = doc.mode === 'official' ? 'RESET OFFICIAL' : 'RESET';
    need(String(body.confirmText || '') === want, 'CONFIRM_REQUIRED', `Type ${want} to confirm the reset.`);
    const key = await backup(store, doc, actor, 'Before reset');
    const out = await mutate(store, doc.id, actor, (d) => {
      const fresh = newSessionDoc({ id: d.id, name: d.name, mode: d.mode, createdAt: d.createdAt, createdBy: d.createdBy });
      const audit = d.audit; const seq = d.auditSeq;
      for (const k of Object.keys(d)) delete d[k];
      Object.assign(d, fresh, { audit, auditSeq: seq, rev: 0 });
      auditFirst(d, actor, `Reset the session to the fictional sample data (backup ${key.split('/').pop()} kept)`, 'session.reset');
    });
    return json({ ok: true, session: sessionMeta(out) });
  }
  if (op === 'restore') {
    need(can(actor, 'backup.restore'), 'FORBIDDEN', 'Only a Super Administrator restores backups.', null, 403);
    need(String(body.confirmText || '') === 'RESTORE', 'CONFIRM_REQUIRED', 'Type RESTORE to confirm.');
    let src;
    if (body.key) { need(String(body.key).startsWith(`backups/${doc.id}/`), 'NOT_FOUND', 'That backup does not belong to this session.'); src = (await getJ(store, body.key))?.doc; need(src, 'NOT_FOUND', 'That backup no longer exists.'); }
    else { src = body.doc?.doc || body.doc; need(src && src.config && src.employees, 'INVALID', 'That file is not a session backup.'); need(!src.mode || src.mode === doc.mode, 'MODE', 'A backup can only be restored into a session of the same kind (official or practice).'); }
    const key = await backup(store, doc, actor, 'Before restoring a backup');
    const out = await mutate(store, doc.id, actor, (d) => {
      const audit = d.audit; const seq = d.auditSeq;
      const keep = { id: d.id, name: d.name, mode: d.mode, createdAt: d.createdAt, createdBy: d.createdBy };
      for (const k of Object.keys(d)) delete d[k];
      Object.assign(d, structuredClone(src), keep, { audit, auditSeq: seq });
      auditFirst(d, actor, `Restored ${body.key ? `backup ${body.key.split('/').pop()}` : 'an uploaded backup file'} (previous state kept as ${key.split('/').pop()})`, 'backup.restore');
    });
    return json({ ok: true, session: sessionMeta(out) });
  }
  refuse('INVALID', 'Unknown session operation.');
}

/** One transaction on a session document. fn may throw a Refusal (nothing is written). */
async function mutate(store, id, actor, fn) {
  let after = null;
  await update(store, docKey(id), async (cur) => {
    need(cur, 'NOT_FOUND', 'That session does not exist.', null, 404);
    const d = structuredClone(cur);
    const r = await fn(d);
    d.rev = (cur.rev || 0) + 1; d.updatedAt = new Date().toISOString(); d.updatedBy = actor.username;
    after = { doc: d, r };
    return d;
  }, { metadata: (d) => docMeta(d) });
  return after.doc;
}

async function act(store, actor, id, body, request) {
  need(can(actor, 'view'), 'FORBIDDEN', 'You do not have access.', null, 403);
  let backupReason = null;
  const doc = await mutate(store, id, actor, (d) => {
    const { backup: b } = applyAction(d, { type: body.type, payload: body.payload || {} }, actor, new Date().toISOString());
    backupReason = b;
  });
  if (backupReason) await backup(store, doc, actor, backupReason);
  const view = sessionView(doc, actor, computeAll(doc));
  view.lastEntry = (actor.role === 'super' ? doc.audit.slice(-1) : redactAudit(doc.audit.slice(-1), doc.config))[0];
  return json(view, 200, request);
}

async function listSessions(store, actor) {
  const index = await indexDoc(store);
  const list = [];
  for (const s of index.list) {
    const h = await store.head(docKey(s.id));
    if (!h) continue;
    list.push({ ...s, rev: h.metadata?.rev ?? null, updatedAt: h.metadata?.updatedAt || null, updatedBy: h.metadata?.updatedBy || null });
  }
  return json({ ok: true, sessions: list, me: { user: publicUser(actor), perms: permsOf(actor) } });
}

function auditQuery(doc, actor, url) {
  let entries = [...(doc.audit || [])].reverse();
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const who = url.searchParams.get('user');
  const kind = url.searchParams.get('kind');
  if (q) entries = entries.filter((e) => `${e.summary} ${e.action} ${e.target?.id} ${e.reason || ''}`.toLowerCase().includes(q));
  if (who) entries = entries.filter((e) => e.user?.username === who);
  if (kind) entries = entries.filter((e) => e.kind === kind || e.action.startsWith(kind));
  const total = entries.length;
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 100)));
  const page = entries.slice(offset, offset + limit);
  return { total, offset, limit, entries: actor.role === 'super' ? page : redactAudit(page, doc.config) };
}

async function listBackups(store, id) {
  const keys = await store.list(`backups/${id}/`);
  const out = [];
  for (const k of keys.reverse()) { const h = await store.head(k); out.push({ key: k, ...(h?.metadata || {}) }); }
  return out;
}

// ---------------- the router ----------------

export async function handle(request, store, env = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/^\.netlify\/functions\/api\/?/, '').replace(/\/+$/, '');
  try {
    if (request.method === 'GET' && path === 'health') return json({ ok: true, storage: store.kind || 'blobs', now: Date.now(), service: 'jaco-r4-control' });
    if (path === 'setup') {
      if (request.method === 'GET') return json({ ok: true, needsSetup: !(await usersDoc(store)).list.length, setupCodeRequired: !!env.SETUP_CODE });
      if (request.method === 'POST') return await setup(store, env, await body(request));
    }
    if (request.method === 'POST' && path === 'login') return await login(store, env, await body(request));

    const actor = await authUser(store, env, request);
    if (!actor) return fail(401, 'Please sign in.', { code: 'SIGN_IN' });

    if (path === 'me' && request.method === 'GET') return json({ ok: true, user: publicUser(actor), perms: permsOf(actor), roles: ROLES, grants: GRANTS });
    if (path === 'me/password' && request.method === 'POST') {
      const b = await body(request);
      const ok = safeEqual(await hashPassword(String(b.current || ''), actor.salt, actor.iter || PBKDF2_ITERATIONS), actor.hash);
      if (!ok) refuse('BAD_LOGIN', 'Your current password is not correct.');
      const pp = passwordProblem(b.next); if (pp) refuse('WEAK_PASSWORD', pp);
      const salt = randomId(24); const iter = env.PBKDF2_ITERATIONS || PBKDF2_ITERATIONS; const hash = await hashPassword(b.next, salt, iter);
      const users = await changeUsers(store, actor, (d) => { const u = d.list.find((x) => x.id === actor.id); u.salt = salt; u.hash = hash; u.iter = iter; u.tokenVer = (u.tokenVer || 0) + 1; });
      const sys = await system(store, env);
      return json({ ok: true, token: await issueToken(sys.secret, users.list.find((x) => x.id === actor.id), Date.now(), env.TOKEN_HOURS || 12) });
    }
    if (path === 'logout' && request.method === 'POST') {
      const b = await body(request);
      if (b.everywhere) await changeUsers(store, actor, (d) => { const u = d.list.find((x) => x.id === actor.id); u.tokenVer = (u.tokenVer || 0) + 1; });
      return json({ ok: true });
    }
    if (path === 'users') {
      if (request.method === 'GET') { need(can(actor, 'users.manage'), 'FORBIDDEN', 'Only a Super Administrator manages accounts.', null, 403); return json({ ok: true, users: (await usersDoc(store)).list.map(publicUser), roles: ROLES, grants: GRANTS }); }
      if (request.method === 'POST') return await usersOp(store, env, actor, await body(request));
    }
    if (path === 'sessions') {
      if (request.method === 'GET') return await listSessions(store, actor);
      if (request.method === 'POST') return await sessionsOp(store, actor, await body(request));
    }
    const m = /^session\/([a-z0-9]{6,24})(?:\/([a-z]+))?$/.exec(path);
    if (m) {
      const [, id, sub] = m;
      need(can(actor, 'view'), 'FORBIDDEN', 'You do not have access.', null, 403);
      if (!sub && request.method === 'GET') { const doc = await loadSession(store, id); return json(sessionView(doc, actor, computeAll(doc)), 200, request); }
      if (sub === 'head' && request.method === 'GET') { const h = await store.head(docKey(id)); need(h, 'NOT_FOUND', 'That session does not exist.', null, 404); return json({ ok: true, ...h.metadata }); }
      if (sub === 'act' && request.method === 'POST') return await act(store, actor, id, await body(request), request);
      if (sub === 'audit' && request.method === 'GET') { need(can(actor, 'audit.view'), 'FORBIDDEN', 'No access to the audit log.', null, 403); const doc = await loadSession(store, id); return json({ ok: true, ...auditQuery(doc, actor, url) }, 200, request); }
      if (sub === 'backups' && request.method === 'GET') { need(can(actor, 'backup.download'), 'FORBIDDEN', 'No access to backups.', null, 403); await loadSession(store, id); return json({ ok: true, backups: await listBackups(store, id) }); }
      if (sub === 'backups' && request.method === 'POST') {
        const b = await body(request);
        const doc = await loadSession(store, id);
        if (b.op === 'create') { need(can(actor, 'backup.create'), 'FORBIDDEN', 'No permission to create backups.', null, 403); const key = await backup(store, doc, actor, str(b.reason, 200, { field: 'Reason' }) || 'Manual backup'); return json({ ok: true, key, backups: await listBackups(store, id) }); }
        if (b.op === 'restore') return await sessionsOp(store, actor, { ...b, op: 'restore', id });
        refuse('INVALID', 'Unknown backup operation.');
      }
      if (sub === 'backup' && request.method === 'GET') {
        need(can(actor, 'backup.download'), 'FORBIDDEN', 'No permission to download backups.', null, 403);
        const key = url.searchParams.get('key');
        let data;
        if (key) { need(key.startsWith(`backups/${id}/`), 'NOT_FOUND', 'That backup does not belong to this session.'); data = await getJ(store, key); need(data, 'NOT_FOUND', 'That backup no longer exists.'); }
        else { const doc = await loadSession(store, id); data = { at: new Date().toISOString(), by: actor.username, reason: 'Download', sessionId: id, rev: doc.rev, doc }; }
        return file(Buffer.from(JSON.stringify(data, null, 1)), { name: `jaco-r4-${data.doc.mode}-${id}-rev${data.rev}.json`, type: 'application/json' });
      }
      if (sub === 'export' && request.method === 'GET') {
        need(can(actor, 'export'), 'FORBIDDEN', 'No permission to export.', null, 403);
        const doc = await loadSession(store, id);
        const { buildExport } = await import('./exports/index.mjs');
        const out = await buildExport(doc, actor, { kind: url.searchParams.get('kind'), format: url.searchParams.get('format'), team: url.searchParams.get('team'), source: url.searchParams.get('source') });
        return file(out.bytes, out);
      }
    }
    return fail(404, 'Not found');
  } catch (e) {
    if (e instanceof Refusal) return json({ ok: false, refused: true, code: e.code, error: e.message, details: e.details }, e.status || 200);
    console.error(e);
    return fail(500, 'Something went wrong on the server. Nothing was changed. Please try again.');
  }
}

async function body(request) {
  const t = await request.text();
  if (t.length > 6_000_000) refuse('TOO_LARGE', 'That request is too large.', null, 413);
  try { return t ? JSON.parse(t) : {}; } catch { refuse('BAD_REQUEST', 'The request could not be read.', null, 400); }
  return {};
}

export { reasonOf };
