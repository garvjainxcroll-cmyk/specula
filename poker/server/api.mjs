// The ALEA server: accounts, chips, rooms and the live game. Runs inside the Netlify
// function (netlify/functions/api.mjs) with Netlify Blobs, and in the stand-alone Node server
// (scripts/dev-server.mjs) and the tests with the in-memory store. Same code everywhere.
//
// Rules this file enforces (all tested in tests/api.test.mjs):
//  - The server decides everything. A client only sends what it wants to do; the server checks
//    that it is that player's turn, that the hand and action number match what they saw
//    (so a replayed or double-clicked action is refused) and that the amount is legal.
//  - Cards are shuffled here with a cryptographically secure generator. The deck, the cards
//    still to come and other players' hole cards are never sent to anyone, the Event Head
//    included, while a hand is in play.
//  - Every change to a room is one conditional write: if two requests race, one wins and the
//    other re-reads and tries again, so a pot can never be paid twice.
//  - Chips moving between an account and a table carry a transfer id and are applied exactly
//    once on each side (buy-ins: hold on the account → seat at the table → release the hold;
//    cash-outs: the room's outbox, delivered by id). An interrupted transfer is finished or
//    refunded the next time the account is loaded.
//  - Passwords are stored only as scrypt hashes. Sign-in attempts and actions are rate limited.
//  - Virtual chips only: there is no way to deposit, withdraw or win money.
import { timingSafeEqual } from 'node:crypto';
import { secureRng, randomId, roomCode, secretKey } from './rng.mjs';
import { hashPassword, checkPassword, makeToken, readToken } from './auth.mjs';
import * as R from '../src/room/room.mjs';
import { viewRoom, lobbyEntry } from '../src/room/view.mjs';
import { redactRecord } from '../src/room/history.mjs';
import { cleanTable, cleanTournament, cleanName, cleanPlayerName, STAKES, TABLE_SIZES } from '../src/room/config.mjs';
import { cleanPresets } from '../src/engine/presets.mjs';
import { BOT_LEVELS } from '../src/bots/bot.mjs';

const DAY = 86400000;
const MIN = 60000;
export const VERSION = '1.0.0';

export const DEFAULT_SETTINGS = Object.freeze({
  formats: { quickPlay: true, cash: true, private: true, tournament: true, practice: true, headsUp: true },
  startingChips: 10000, reloadTo: 10000, reloadBelow: 1000, reloadMinutes: 30,
  guests: true, registration: true, reminderMinutes: 60, maxTables: 4, maxBotsPerPractice: 9,
});

// ---------------- responses ----------------

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const fail = (status, error, extra = {}) => json({ ok: false, error, ...extra }, status);
/** A refusal (not your turn, not enough chips…) is a normal answer, sent with status 200. */
const refuse = (code, error, extra = {}) => json({ ok: false, refused: true, code, error, ...extra }, 200);
class Refusal extends Error { constructor(code, message, status = 200) { super(message); this.code = code; this.status = status; } }
const no = (code, msg, status) => { throw new Refusal(code, msg, status); };

// ---------------- rate limits (per server instance; best effort on Netlify) ----------------

const buckets = new Map();
export function limit(key, max, windowMs, now = Date.now()) {
  let b = buckets.get(key);
  if (!b || now - b.start > windowMs) { b = { start: now, n: 0 }; buckets.set(key, b); }
  b.n += 1;
  if (buckets.size > 50000) for (const [k, v] of buckets) if (now - v.start > 10 * MIN) buckets.delete(k);
  return b.n <= max;
}
export function resetLimits() { buckets.clear(); }

// ---------------- storage helpers ----------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Read–change–write with a condition; retried if someone else wrote first. fn returns the new doc, or undefined for "no change". */
async function mutate(store, key, fn, tries = 12) {
  for (let k = 0; k < tries; k++) {
    const cur = await store.getMeta(key);
    const next = await fn(cur ? cur.data : null);
    if (next === undefined) return { data: cur ? cur.data : null, changed: false };
    const w = cur ? await store.set(key, next, { onlyIfMatch: cur.etag }) : await store.set(key, next, { onlyIfNew: true });
    if (w.modified) return { data: next, changed: true };
    await sleep(5 + Math.floor(Math.random() * 25 * (k + 1)));
  }
  throw new Refusal('busy', 'The table is very busy — please try again', 503);
}

const keys = new WeakMap();
async function signingKey(store) {
  if (keys.has(store)) return keys.get(store);
  let s = await store.get('secrets');
  if (!s) { await store.set('secrets', { key: secretKey() }, { onlyIfNew: true }); s = await store.get('secrets'); }
  keys.set(store, s.key);
  return s.key;
}
async function settingsOf(store) {
  const s = (await store.get('settings')) || {};
  return { ...DEFAULT_SETTINGS, ...s, formats: { ...DEFAULT_SETTINGS.formats, ...(s.formats || {}) } };
}

// ---------------- who is asking ----------------

function tokenFrom(ctx) {
  const h = ctx.request.headers.get('authorization') || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return ctx.request.headers.get('x-alea-token') || ctx.url.searchParams.get('token') || null;
}
async function who(ctx) {
  if (ctx._who !== undefined) return ctx._who;
  const t = tokenFrom(ctx);
  ctx._who = null;
  if (!t) return null;
  const key = await signingKey(ctx.store);
  const tok = readToken(key, t, ctx.now);
  if (!tok) return null;
  if (tok.kind === 'h') {
    const host = await ctx.store.get('host');
    const v = host?.v ?? 0;
    if (tok.id === 'host' && tok.version === v) ctx._who = { host: true };
    return ctx._who;
  }
  if (tok.kind === 'u') {
    const acct = await ctx.store.get(`acct/${tok.id}`);
    if (acct && (acct.tokenVersion || 0) === tok.version) ctx._who = { acct };
  }
  return ctx._who;
}
async function needUser(ctx) { const w = await who(ctx); if (!w?.acct) no('signed-out', 'Please sign in or play as a guest', 401); return w.acct; }
async function needHost(ctx) { const w = await who(ctx); if (!w?.host) no('host-only', 'Event Head sign-in needed', 401); return true; }
function clientIp(request) {
  return request.headers.get('x-nf-client-connection-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
}

// ---------------- accounts ----------------

const AVATAR_GLYPHS = ['eagle', 'globe', 'crown', 'key', 'anchor', 'star', 'compass', 'tower', 'laurel', 'owl', 'lion', 'wave'];
const AVATAR_TONES = ['gold', 'sheen', 'bronze', 'emblem'];
function cleanAvatar(a) {
  return { glyph: AVATAR_GLYPHS.includes(a?.glyph) ? a.glyph : 'eagle', tone: AVATAR_TONES.includes(a?.tone) ? a.tone : 'gold' };
}
const DEFAULT_PREFS = { sound: true, volume: 70, animations: 'normal', cardStyle: 'two', felt: 'green', layout: 'expanded', autoMuck: true, reminderMinutes: 60, confirmFold: true };
function cleanPrefs(x = {}) {
  const p = { ...DEFAULT_PREFS };
  if (typeof x.sound === 'boolean') p.sound = x.sound;
  if (Number.isFinite(Number(x.volume))) p.volume = Math.max(0, Math.min(100, Math.round(Number(x.volume))));
  if (['off', 'fast', 'normal'].includes(x.animations)) p.animations = x.animations;
  if (['two', 'four'].includes(x.cardStyle)) p.cardStyle = x.cardStyle;
  if (['green', 'charcoal'].includes(x.felt)) p.felt = x.felt;
  if (['compact', 'expanded'].includes(x.layout)) p.layout = x.layout;
  if (typeof x.autoMuck === 'boolean') p.autoMuck = x.autoMuck;
  if (typeof x.confirmFold === 'boolean') p.confirmFold = x.confirmFold;
  if (Number.isFinite(Number(x.reminderMinutes))) p.reminderMinutes = Math.max(0, Math.min(600, Math.round(Number(x.reminderMinutes))));
  return p;
}

function newAccount(id, name, guest, avatar, settings, now) {
  return {
    id, name, lname: name.toLowerCase(), guest, avatar: cleanAvatar(avatar), createdAt: now, lastLogin: now,
    bankroll: settings.startingChips,
    ledger: { start: settings.startingChips, reloads: 0, granted: 0, prizes: 0, boughtIn: 0, cashedOut: 0 },
    holds: {}, seen: [], at: {},
    stats: { hands: 0, won: 0, lost: 0, showdowns: 0, wonShowdown: 0, net: 0, biggestPot: 0, practiceHands: 0, tournaments: 0, bestFinish: null, points: 0, cashes: 0 },
    recent: [], tourResults: [], prefs: { ...DEFAULT_PREFS }, presets: cleanPresets(null),
    tokenVersion: 0, failed: { n: 0, until: 0 }, lastReload: 0,
  };
}

async function reserveName(store, name, id) {
  const r = await store.set(`name/${name.toLowerCase()}`, { id }, { onlyIfNew: true });
  return r.modified;
}

function meView(acct, settings, now) {
  const seatedCash = Object.values(acct.at || {}).some((x) => x.kind === 'cash');
  return {
    id: acct.id, name: acct.name, guest: acct.guest, avatar: acct.avatar, bankroll: acct.bankroll,
    inTransit: Object.values(acct.holds || {}).reduce((a, h) => a + h.amount, 0),
    stats: acct.stats, recent: acct.recent.slice(0, 40), tourResults: acct.tourResults, prefs: acct.prefs, presets: acct.presets,
    at: acct.at || {}, ledger: acct.ledger, createdAt: acct.createdAt,
    canReload: acct.bankroll < settings.reloadBelow && !seatedCash && now - (acct.lastReload || 0) >= settings.reloadMinutes * MIN,
    reloadAt: (acct.lastReload || 0) + settings.reloadMinutes * MIN,
    reloadTo: settings.reloadTo, reloadBelow: settings.reloadBelow, reminderMinutes: settings.reminderMinutes,
  };
}

async function issueUserToken(ctx, acct, ttl = 30 * DAY) {
  return makeToken(await signingKey(ctx.store), 'u', acct.id, acct.tokenVersion || 0, ttl, ctx.now);
}

/** Finish or refund buy-ins that were interrupted half way (see the transfer rules at the top). */
async function resolveHolds(ctx, acct) {
  const old = Object.entries(acct.holds || {}).filter(([, h]) => ctx.now - h.at > 30000);
  if (!old.length) return acct;
  const verdict = {};
  for (const [id, h] of old) {
    const room = await ctx.store.get(`room/${h.room}`);
    verdict[id] = room && room.applied.includes(id) ? 'done' : 'refund';
  }
  const { data } = await mutate(ctx.store, `acct/${acct.id}`, (a) => {
    let changed = false;
    for (const [id, v] of Object.entries(verdict)) {
      const h = a.holds[id];
      if (!h) continue;
      if (v === 'done') a.ledger.boughtIn += h.amount; else a.bankroll += h.amount;
      delete a.holds[id];
      changed = true;
    }
    return changed ? a : undefined;
  });
  return data;
}

// ---------------- rooms ----------------

const touched = new Map(); // roomId → last request time (for the Node server's background clock)
const retried = new Map(); // roomId → last outbox retry
export function activeRooms(now = Date.now(), within = 10 * MIN) { return [...touched.entries()].filter(([, t]) => now - t < within).map(([id]) => id); }

async function roomIdFrom(ctx, q) {
  if (q.id) return String(q.id).slice(0, 40);
  if (q.code) {
    const c = await ctx.store.get(`code/${String(q.code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}`);
    if (c) return c.id;
  }
  return no('no-room', 'No table with that code', 200);
}

/**
 * Change a room safely: read, bring its clock up to date, apply fn, write only if nobody else
 * wrote in between (otherwise start again from the fresh copy). Afterwards: tell live viewers,
 * update the lobby and deliver the outbox.
 */
async function withRoom(ctx, id, fn) {
  let result;
  const { data: room, changed } = await mutate(ctx.store, `room/${id}`, async (room) => {
    if (!room) no('no-room', 'That table no longer exists');
    R.tick(room, ctx.now, ctx.rng);
    result = await fn(room);
    return room;
  });
  touched.set(id, ctx.now);
  if (changed) await after(ctx, room);
  return { room, result };
}

async function after(ctx, room) {
  ctx.publish(room.id, room.v);
  const work = Promise.all([syncLobby(ctx, room), room.outbox.length ? deliver(ctx, room.id) : null]).catch((e) => console.error('after-write', e));
  if (ctx.defer) ctx.defer(work); else await work;
}

async function syncLobby(ctx, room) {
  const e = lobbyEntry(room);
  const sig = (x) => (x ? JSON.stringify({ ...x, v: 0 }) : '');
  await mutate(ctx.store, 'lobby', (lob) => {
    const l = lob || { rooms: {} };
    if (room.status === 'closed') { if (!l.rooms[room.id]) return undefined; delete l.rooms[room.id]; return l; }
    if (sig(l.rooms[room.id]) === sig(e)) return undefined;
    l.rooms[room.id] = e;
    return l;
  });
}

/** Deliver a room's outbox: hand records, stats, chips back to accounts. Each item exactly once. */
async function deliver(ctx, roomId) {
  const room = await ctx.store.get(`room/${roomId}`);
  if (!room || !room.outbox.length) return;
  const items = room.outbox.slice(0, 100);
  const done = new Set();
  for (const it of items.filter((x) => x.kind === 'hist')) {
    await ctx.store.set(`hist/${it.record.id}`, it.record, { onlyIfNew: true });
    done.add(it.id);
  }
  for (const it of items.filter((x) => x.kind === 'hist-show')) {
    await mutate(ctx.store, `hist/${it.handId}`, (rec) => {
      if (!rec) return undefined;
      const p = rec.players.find((x) => x.seat === it.seat);
      if (!p || p.shown) return undefined;
      p.shown = true; rec.events.push({ t: 'show', seat: it.seat, cards: p.cards, voluntary: true });
      return rec;
    }).catch(() => null);
    done.add(it.id);
  }
  const byAcct = new Map();
  for (const it of items) if (it.acct && !it.acct.startsWith('bot')) byAcct.set(it.acct, [...(byAcct.get(it.acct) || []), it]);
  for (const it of items) if (it.acct && it.acct.startsWith('bot')) done.add(it.id);
  for (const [acctId, list] of byAcct) {
    try {
      await mutate(ctx.store, `acct/${acctId}`, (a) => {
        if (!a) return undefined;
        let changed = false;
        for (const it of list) {
          if (a.seen.includes(it.id)) continue;
          applyItem(a, it);
          a.seen.push(it.id); changed = true;
        }
        if (a.seen.length > 800) a.seen.splice(0, a.seen.length - 800);
        return changed ? a : undefined;
      });
      for (const it of list) done.add(it.id);
    } catch (e) { console.error('deliver', acctId, e); }
  }
  if (!done.size) return;
  await mutate(ctx.store, `room/${roomId}`, (r) => {
    if (!r) return undefined;
    const before = r.outbox.length;
    r.outbox = r.outbox.filter((o) => !done.has(o.id));
    return r.outbox.length === before ? undefined : r;
  });
}

function applyItem(a, it) {
  const st = a.stats;
  if (it.kind === 'cashout') {
    a.bankroll += it.amount; a.ledger.cashedOut += it.amount;
    if (a.at[it.room]) delete a.at[it.room];
  } else if (it.kind === 'hand') {
    if (it.roomKind === 'practice') st.practiceHands += 1;
    st.hands += 1;
    if (it.won) st.won += 1; else st.lost += 1;
    if (it.showdown) st.showdowns += 1;
    if (it.wonShowdown) st.wonShowdown += 1;
    if (it.roomKind === 'cash') st.net += it.net;
    if (it.won && it.pot > st.biggestPot) st.biggestPot = it.pot;
    a.recent.unshift({ handId: it.handId, room: it.room, roomName: it.roomName, kind: it.roomKind, at: it.at, net: it.net, won: it.won, hand: it.hand });
    if (a.recent.length > 100) a.recent.length = 100;
  } else if (it.kind === 'tour') {
    st.tournaments += 1;
    if (st.bestFinish === null || it.place < st.bestFinish) st.bestFinish = it.place;
    if (it.prize > 0) {
      st.cashes += 1;
      if (it.prizeType === 'chips') { a.bankroll += it.prize; a.ledger.prizes += it.prize; } else st.points += it.prize;
    }
    a.tourResults.unshift({ room: it.room, name: it.roomName, place: it.place, entrants: it.entrants, prize: it.prize, prizeType: it.prizeType, at: it.at });
    if (a.tourResults.length > 50) a.tourResults.length = 50;
    if (a.at[it.room]) delete a.at[it.room];
  }
}

async function newRoom(ctx, spec) {
  const id = randomId(10);
  let code;
  for (let k = 0; k < 20; k++) {
    code = roomCode();
    if ((await ctx.store.set(`code/${code}`, { id }, { onlyIfNew: true })).modified) break;
  }
  const room = R.createRoom({ id, code, ...spec }, ctx.now);
  await ctx.store.set(`room/${id}`, room, { onlyIfNew: true });
  await syncLobby(ctx, room);
  return room;
}

function canManage(w, room) { return !!(w?.host || (w?.acct && room.owner === w.acct.id)); }

// ---------------- buying in (account → table) ----------------

/** Cash tables and tournaments the player is in (practice tables do not count). */
const tablesIn = (acct, except) => Object.entries(acct.at || {}).filter(([r, x]) => r !== except && x.kind !== 'practice').length;

async function buyIn(ctx, acct, roomId, amount, apply) {
  const xferId = `x${randomId(14)}`;
  const settings = await settingsOf(ctx.store);
  const room0 = await ctx.store.get(`room/${roomId}`);
  if (!room0) no('no-room', 'That table no longer exists');
  const free = room0.kind === 'practice';
  if (!free) {
    if (!Number.isInteger(amount) || amount <= 0) no('amount', 'Choose an amount');
    if (tablesIn(acct, roomId) >= settings.maxTables) no('max-tables', `You can play at most ${settings.maxTables} tables at once`);
    await mutate(ctx.store, `acct/${acct.id}`, (a) => {
      if (a.bankroll < amount) no('chips', `You have ${a.bankroll} chips in your account`);
      a.bankroll -= amount;
      a.holds[xferId] = { room: roomId, amount, at: ctx.now };
      return a;
    });
  }
  let out;
  try {
    out = await withRoom(ctx, roomId, (room) => apply(room, xferId));
  } catch (e) {
    if (!free) await mutate(ctx.store, `acct/${acct.id}`, (a) => { const h = a.holds[xferId]; if (!h) return undefined; a.bankroll += h.amount; delete a.holds[xferId]; return a; });
    throw e;
  }
  await mutate(ctx.store, `acct/${acct.id}`, (a) => {
    const h = a.holds[xferId];
    if (h) { a.ledger.boughtIn += h.amount; delete a.holds[xferId]; }
    a.at[roomId] = { name: out.room.name, code: out.room.code, kind: out.room.kind, at: ctx.now };
    return a;
  });
  return out;
}

// ---------------- routes ----------------

const ROUTES = {};
const route = (method, path, fn) => { ROUTES[`${method} ${path}`] = fn; };

route('GET', 'health', async (ctx) => json({ ok: true, app: 'alea', version: VERSION, storage: ctx.store.kind, now: ctx.now, stream: !!ctx.streaming }));

// --- accounts ---
route('POST', 'auth/register', async (ctx, b) => {
  if (!limit(`auth:${ctx.ip}`, 30, 10 * MIN)) no('slow-down', 'Too many attempts — wait a few minutes', 429);
  const s = await settingsOf(ctx.store);
  if (!s.registration) no('closed', 'New accounts are switched off by the Event Head');
  const name = cleanPlayerName(b.name);
  if (name.length < 2) no('name', 'Choose a name of at least 2 letters or numbers');
  const pw = String(b.password || '');
  if (pw.length < 6 || pw.length > 200) no('password', 'Choose a password of at least 6 characters');
  const id = `u${randomId(12)}`;
  if (!(await reserveName(ctx.store, name, id))) no('name-taken', 'That name is taken — choose another');
  const acct = newAccount(id, name, false, b.avatar, s, ctx.now);
  Object.assign(acct, { pass: await hashPassword(pw) });
  await ctx.store.set(`acct/${id}`, acct, { onlyIfNew: true });
  return json({ ok: true, token: await issueUserToken(ctx, acct), me: meView(acct, s, ctx.now) });
});

route('POST', 'auth/guest', async (ctx, b) => {
  if (!limit(`auth:${ctx.ip}`, 30, 10 * MIN)) no('slow-down', 'Too many attempts — wait a few minutes', 429);
  const s = await settingsOf(ctx.store);
  if (!s.guests) no('closed', 'Guest play is switched off: please make an account');
  const base = cleanPlayerName(b.name) || `Guest ${100 + Math.floor(Math.random() * 900)}`;
  if (base.length < 2) no('name', 'Choose a name of at least 2 letters or numbers');
  const id = `u${randomId(12)}`;
  let name = base;
  for (let k = 0; k < 8 && !(await reserveName(ctx.store, name, id)); k++) name = `${base.slice(0, 16)} ${10 + Math.floor(Math.random() * 90)}`;
  if ((await ctx.store.get(`name/${name.toLowerCase()}`))?.id !== id) no('name-taken', 'That name is taken — choose another');
  const acct = newAccount(id, name, true, b.avatar, s, ctx.now);
  await ctx.store.set(`acct/${id}`, acct, { onlyIfNew: true });
  return json({ ok: true, token: await issueUserToken(ctx, acct, 180 * DAY), me: meView(acct, s, ctx.now) });
});

route('POST', 'auth/login', async (ctx, b) => {
  if (!limit(`auth:${ctx.ip}`, 30, 10 * MIN)) no('slow-down', 'Too many attempts — wait a few minutes', 429);
  const s = await settingsOf(ctx.store);
  const name = cleanPlayerName(b.name);
  const ref = name ? await ctx.store.get(`name/${name.toLowerCase()}`) : null;
  const acct = ref ? await ctx.store.get(`acct/${ref.id}`) : null;
  const bad = () => no('bad-login', 'That name and password do not match');
  if (!acct || !acct.pass) { await checkPassword('x', { salt: 'x', hash: 'AAAA' }); return bad(); }
  if (acct.failed?.until > ctx.now) no('locked', 'Too many wrong passwords: try again in a few minutes');
  if (!(await checkPassword(String(b.password || ''), acct.pass))) {
    await mutate(ctx.store, `acct/${acct.id}`, (a) => { a.failed = { n: (a.failed?.n || 0) + 1, until: (a.failed?.n || 0) + 1 >= 8 ? ctx.now + 15 * MIN : 0 }; if (a.failed.until) a.failed.n = 0; return a; });
    return bad();
  }
  const { data } = await mutate(ctx.store, `acct/${acct.id}`, (a) => { a.failed = { n: 0, until: 0 }; a.lastLogin = ctx.now; return a; });
  return json({ ok: true, token: await issueUserToken(ctx, data), me: meView(data, s, ctx.now) });
});

route('POST', 'auth/claim', async (ctx, b) => {
  const acct = await needUser(ctx);
  if (!acct.guest) no('not-guest', 'You already have a password');
  const pw = String(b.password || '');
  if (pw.length < 6 || pw.length > 200) no('password', 'Choose a password of at least 6 characters');
  const pass = await hashPassword(pw);
  const s = await settingsOf(ctx.store);
  const { data } = await mutate(ctx.store, `acct/${acct.id}`, (a) => { a.guest = false; a.pass = pass; return a; });
  return json({ ok: true, me: meView(data, s, ctx.now) });
});

route('POST', 'auth/password', async (ctx, b) => {
  const acct = await needUser(ctx);
  if (!acct.pass || !(await checkPassword(String(b.old || ''), acct.pass))) no('bad-login', 'Your current password is not right');
  const pw = String(b.password || '');
  if (pw.length < 6 || pw.length > 200) no('password', 'Choose a password of at least 6 characters');
  const pass = await hashPassword(pw);
  const { data } = await mutate(ctx.store, `acct/${acct.id}`, (a) => { a.pass = pass; a.tokenVersion = (a.tokenVersion || 0) + 1; return a; });
  return json({ ok: true, token: await issueUserToken(ctx, data) });
});

route('POST', 'auth/logout', async (ctx) => {
  const acct = await needUser(ctx);
  await mutate(ctx.store, `acct/${acct.id}`, (a) => { a.tokenVersion = (a.tokenVersion || 0) + 1; return a; });
  return json({ ok: true });
});

route('GET', 'me', async (ctx) => {
  let acct = await needUser(ctx);
  acct = await resolveHolds(ctx, acct);
  return json({ ok: true, me: meView(acct, await settingsOf(ctx.store), ctx.now), now: ctx.now });
});

route('POST', 'me/settings', async (ctx, b) => {
  const acct = await needUser(ctx);
  const s = await settingsOf(ctx.store);
  const { data } = await mutate(ctx.store, `acct/${acct.id}`, (a) => {
    if (b.prefs) a.prefs = cleanPrefs({ ...a.prefs, ...b.prefs });
    if (b.presets) a.presets = cleanPresets(b.presets);
    if (b.avatar) a.avatar = cleanAvatar(b.avatar);
    return a;
  });
  return json({ ok: true, me: meView(data, s, ctx.now) });
});

route('POST', 'me/reload', async (ctx) => {
  const acct = await needUser(ctx);
  const s = await settingsOf(ctx.store);
  const { data } = await mutate(ctx.store, `acct/${acct.id}`, (a) => {
    if (!meView(a, s, ctx.now).canReload) no('no-reload', `Free chips are for accounts under ${s.reloadBelow} chips, not seated at a table, once every ${s.reloadMinutes} minutes`);
    const add = s.reloadTo - a.bankroll;
    a.bankroll += add; a.ledger.reloads += add; a.lastReload = ctx.now;
    return a;
  });
  return json({ ok: true, me: meView(data, s, ctx.now) });
});

route('GET', 'myhands', async (ctx) => {
  const acct = await needUser(ctx);
  return json({ ok: true, hands: acct.recent });
});

// --- lobby ---
route('GET', 'lobby', async (ctx) => {
  const lob = (await ctx.store.get('lobby')) || { rooms: {} };
  const s = await settingsOf(ctx.store);
  const w = await who(ctx);
  const me = w?.acct?.id;
  const rooms = Object.values(lob.rooms)
    .filter((r) => r.status === 'open' && r.kind !== 'practice' && (!r.private || w?.host))
    .filter((r) => !(r.tour && r.tour.status === 'finished' && ctx.now - r.createdAt > 6 * 3600000))
    .sort((a, b) => (a.kind === b.kind ? b.humans - a.humans || a.bb - b.bb : a.kind === 'tournament' ? -1 : 1));
  const mine = me ? Object.values(lob.rooms).filter((r) => r.status === 'open' && w.acct.at?.[r.id]) : [];
  return json({ ok: true, rooms, mine, stakes: STAKES, sizes: TABLE_SIZES, formats: s.formats, guests: s.guests, registration: s.registration, now: ctx.now });
});

route('POST', 'quickplay', async (ctx, b) => {
  const acct = await needUser(ctx);
  const s = await settingsOf(ctx.store);
  if (!s.formats.quickPlay) no('closed', 'Quick Play is switched off by the Event Head');
  const stakes = STAKES.find((x) => x.id === b.stakes) || STAKES[1];
  const seats = TABLE_SIZES.includes(Number(b.seats)) ? Number(b.seats) : 6;
  if (seats === 2 && !s.formats.headsUp) no('closed', 'Heads-up tables are switched off');
  const lob = (await ctx.store.get('lobby')) || { rooms: {} };
  const fits = Object.values(lob.rooms).filter((r) => r.kind === 'cash' && !r.private && r.status === 'open' && r.sb === stakes.sb && r.bb === stakes.bb && r.seats === seats && r.seated < r.seats);
  const already = fits.find((r) => acct.at?.[r.id]);
  if (already) return json({ ok: true, id: already.id, code: already.code, already: true });
  fits.sort((a, b2) => b2.humans - a.humans);
  if (fits.length) return json({ ok: true, id: fits[0].id, code: fits[0].code });
  const n = Object.values(lob.rooms).filter((r) => r.kind === 'cash' && !r.private).length + 1;
  const room = await newRoom(ctx, {
    kind: 'cash', name: `${seats === 2 ? 'Heads-Up' : 'Quick Play'} ${stakes.label} · ${String(n).padStart(2, '0')}`, isPrivate: false, owner: 'system', ownerName: 'ALEA',
    cfg: { sb: stakes.sb, bb: stakes.bb, seats, minBuyIn: 40 * stakes.bb, maxBuyIn: 200 * stakes.bb },
  });
  return json({ ok: true, id: room.id, code: room.code, created: true });
});

function roomSpecFrom(b, owner, ownerName, isHost) {
  const kind = ['cash', 'tournament', 'practice'].includes(b.kind) ? b.kind : 'cash';
  const cfg = cleanTable(b.cfg || {});
  return {
    kind, name: cleanName(b.name, kind === 'tournament' ? 'Tournament' : kind === 'practice' ? 'Practice' : 'Private Table'),
    isPrivate: isHost ? !!b.private : true, owner, ownerName, cfg, // tables players make are private (invite by code or link)
    tour: kind === 'tournament' ? cleanTournament(b.tour || {}) : undefined,
  };
}

async function addBots(ctx, roomId, n, level) {
  const lvl = BOT_LEVELS.includes(level) ? level : 'medium';
  if (n <= 0) return;
  await withRoom(ctx, roomId, (room) => {
    for (let i = 0; i < n; i++) {
      const free = room.kind === 'tournament' || room.tables[0].seats.some((x) => !x);
      if (!free) break;
      try { R.addBot(room, { level: lvl, id: `bot-${randomId(8)}` }, ctx.now, ctx.rng); } catch (e) { if (e instanceof R.RoomError) break; throw e; }
    }
  });
}

route('POST', 'rooms/create', async (ctx, b) => {
  const acct = await needUser(ctx);
  if (!limit(`create:${acct.id}`, 20, 60 * MIN)) no('slow-down', 'You have made a lot of tables — wait a while', 429);
  const s = await settingsOf(ctx.store);
  const spec = roomSpecFrom(b, acct.id, acct.name, false);
  const f = s.formats;
  if (spec.kind === 'practice' && !f.practice) no('closed', 'Practice is switched off');
  if (spec.kind === 'cash' && !f.private) no('closed', 'Private tables are switched off');
  if (spec.kind === 'tournament' && !f.tournament) no('closed', 'Tournaments are switched off');
  if (spec.cfg.seats === 2 && !f.headsUp) no('closed', 'Heads-up tables are switched off');
  const room = await newRoom(ctx, spec);
  if (spec.kind === 'practice') {
    const stack = room.cfg.maxBuyIn;
    await withRoom(ctx, room.id, (r) => R.sit(r, { acct: acct.id, name: acct.name, avatar: acct.avatar, stack, autoMuck: acct.prefs?.autoMuck }, ctx.now));
    const bots = Math.max(1, Math.min(Number(b.bots?.count) || room.cfg.seats - 1, room.cfg.seats - 1, s.maxBotsPerPractice));
    await addBots(ctx, room.id, bots, b.bots?.level || room.cfg.botLevel);
    await mutate(ctx.store, `acct/${acct.id}`, (a) => { a.at[room.id] = { name: room.name, code: room.code, kind: room.kind, at: ctx.now }; return a; });
  }
  return json({ ok: true, id: room.id, code: room.code });
});

route('GET', 'room', async (ctx, _b, q) => {
  const id = await roomIdFrom(ctx, Object.fromEntries(q));
  const w = await who(ctx);
  const viewer = { acct: w?.acct?.id || null, host: !!w?.host };
  touched.set(id, ctx.now);
  let room;
  try {
    ({ data: room } = await mutate(ctx.store, `room/${id}`, (r) => {
      if (!r) no('no-room', 'That table no longer exists');
      const a = R.tick(r, ctx.now, ctx.rng);
      const b2 = viewer.acct ? R.touch(r, viewer.acct, ctx.now) : false;
      return a || b2 ? r : undefined;
    }, 6));
  } catch (e) {
    if (e instanceof Refusal && e.code === 'busy') room = await ctx.store.get(`room/${id}`); // show the last saved state
    else throw e;
  }
  if (room.outbox.length && ctx.now - (retried.get(id) || 0) > 5000) { retried.set(id, ctx.now); await deliver(ctx, id).catch(() => null); } // finish an interrupted delivery
  const v = Number(q.get('v'));
  if (v && v === room.v) return json({ ok: true, same: true, v: room.v, now: ctx.now });
  return json({ ok: true, view: viewRoom(room, viewer, ctx.now), now: ctx.now });
});

const roomBody = async (ctx, b) => ({ acct: await needUser(ctx), id: await roomIdFrom(ctx, b) });

route('POST', 'room/sit', async (ctx, b) => {
  const { acct, id } = await roomBody(ctx, b);
  const amount = Math.round(Number(b.buyIn));
  const out = await buyIn(ctx, acct, id, amount, (room, xferId) => {
    const stack = room.kind === 'practice' ? (Number.isInteger(amount) && amount > 0 ? Math.min(amount, room.cfg.maxBuyIn) : room.cfg.maxBuyIn) : amount;
    R.sit(room, { acct: acct.id, name: acct.name, avatar: acct.avatar, stack, table: Number(b.table) || 0, seat: b.seat ?? null, xferId, autoMuck: acct.prefs?.autoMuck }, ctx.now);
  });
  return json({ ok: true, view: viewRoom(out.room, { acct: acct.id }, ctx.now), now: ctx.now });
});

route('POST', 'room/topup', async (ctx, b) => {
  const { acct, id } = await roomBody(ctx, b);
  const amount = Math.round(Number(b.amount));
  const out = await buyIn(ctx, acct, id, amount, (room, xferId) => R.topUp(room, acct.id, amount, ctx.now, xferId));
  return json({ ok: true, view: viewRoom(out.room, { acct: acct.id }, ctx.now), now: ctx.now });
});

route('POST', 'room/leave', async (ctx, b) => {
  const { acct, id } = await roomBody(ctx, b);
  const { room, result } = await withRoom(ctx, id, (r) => R.leave(r, acct.id, ctx.now, ctx.rng));
  if (room.kind === 'practice' || (room.kind === 'tournament' && !result.pending)) await mutate(ctx.store, `acct/${acct.id}`, (a) => { if (!a.at[id]) return undefined; delete a.at[id]; return a; });
  return json({ ok: true, ...result, view: viewRoom(room, { acct: acct.id }, ctx.now), now: ctx.now });
});

route('POST', 'room/sitout', async (ctx, b) => {
  const { acct, id } = await roomBody(ctx, b);
  const { room } = await withRoom(ctx, id, (r) => R.sitOut(r, acct.id, !!b.on, ctx.now));
  return json({ ok: true, view: viewRoom(room, { acct: acct.id }, ctx.now), now: ctx.now });
});

route('POST', 'room/automuck', async (ctx, b) => {
  const { acct, id } = await roomBody(ctx, b);
  const { room } = await withRoom(ctx, id, (r) => R.setAutoMuck(r, acct.id, !!b.on));
  return json({ ok: true, view: viewRoom(room, { acct: acct.id }, ctx.now), now: ctx.now });
});

route('POST', 'room/act', async (ctx, b) => {
  const { acct, id } = await roomBody(ctx, b);
  if (!limit(`act:${acct.id}`, 30, 10000)) no('slow-down', 'Too many clicks — slow down a little', 429);
  const type = String(b.type || '');
  if (!['fold', 'check', 'call', 'bet', 'raise', 'allin'].includes(type)) no('illegal', 'Unknown action');
  const to = b.to === undefined || b.to === null ? undefined : Number(b.to);
  const { room } = await withRoom(ctx, id, (r) => R.playerAct(r, acct.id, { handId: String(b.handId || ''), seq: Number(b.seq), type, to }, ctx.now, ctx.rng));
  return json({ ok: true, view: viewRoom(room, { acct: acct.id }, ctx.now), now: ctx.now });
});

route('POST', 'room/show', async (ctx, b) => {
  const { acct, id } = await roomBody(ctx, b);
  const { room } = await withRoom(ctx, id, (r) => R.playerShow(r, acct.id, ctx.now));
  return json({ ok: true, view: viewRoom(room, { acct: acct.id }, ctx.now), now: ctx.now });
});

route('POST', 'room/register', async (ctx, b) => {
  const { acct, id } = await roomBody(ctx, b);
  const s = await settingsOf(ctx.store);
  if (tablesIn(acct, id) >= s.maxTables) no('max-tables', `You can play at most ${s.maxTables} tables at once`);
  const { room } = await withRoom(ctx, id, (r) => R.registerTournament(r, { acct: acct.id, name: acct.name, avatar: acct.avatar }, ctx.now));
  await mutate(ctx.store, `acct/${acct.id}`, (a) => { a.at[id] = { name: room.name, code: room.code, kind: room.kind, at: ctx.now }; return a; });
  return json({ ok: true, view: viewRoom(room, { acct: acct.id }, ctx.now), now: ctx.now });
});

route('POST', 'room/unregister', async (ctx, b) => {
  const { acct, id } = await roomBody(ctx, b);
  const { room, result } = await withRoom(ctx, id, (r) => R.leave(r, acct.id, ctx.now, ctx.rng));
  if (!result.pending) await mutate(ctx.store, `acct/${acct.id}`, (a) => { if (!a.at[id]) return undefined; delete a.at[id]; return a; });
  return json({ ok: true, ...result, view: viewRoom(room, { acct: acct.id }, ctx.now), now: ctx.now });
});

/** Owner of a private table (or the Event Head): settings, bots, players, pause, start. */
route('POST', 'room/manage', async (ctx, b) => {
  const w = await who(ctx);
  if (!w) no('signed-out', 'Please sign in', 401);
  const id = await roomIdFrom(ctx, b);
  const op = String(b.op || '');
  const hostOnly = ['void'];
  let botsToAdd = 0;
  const { room } = await withRoom(ctx, id, (r) => {
    if (!canManage(w, r)) no('not-owner', 'Only the table’s host or the Event Head can do that');
    if (hostOnly.includes(op) && !w.host) no('host-only', 'Only the Event Head can do that');
    switch (op) {
      case 'config': return R.setConfig(r, b.cfg || {}, ctx.now);
      case 'pause': return R.setPaused(r, true, ctx.now);
      case 'resume': return R.setPaused(r, false, ctx.now);
      case 'close': return R.closeRoom(r, ctx.now);
      case 'kick': return R.kick(r, String(b.acct || ''), ctx.now, ctx.rng);
      case 'bot-add': {
        if (r.kind === 'cash' && !w.host) no('host-only', 'Bots can join cash tables only when the Event Head adds them');
        botsToAdd = Math.max(1, Math.min(9, Number(b.count) || 1));
        return null;
      }
      case 'bot-remove': return R.removeBot(r, String(b.acct || ''), ctx.now, ctx.rng);
      case 'start': return R.startTournament(r, ctx.now, ctx.rng);
      case 'tpause': return R.pauseTournament(r, true, ctx.now);
      case 'tresume': return R.pauseTournament(r, false, ctx.now);
      case 'level': return R.advanceLevel(r, ctx.now);
      case 'addtime': return R.advanceLevel(r, ctx.now, { addMinutes: Math.max(1, Math.min(60, Number(b.minutes) || 2)) });
      case 'rename': r.name = cleanName(b.name, r.name); r.v++; return null;
      case 'void': return R.voidHand(r, Number(b.table) || 0, ctx.now);
      default: return no('bad-op', 'Unknown action');
    }
  });
  if (botsToAdd) await addBots(ctx, id, botsToAdd, b.level);
  const fresh = botsToAdd ? await ctx.store.get(`room/${id}`) : room;
  return json({ ok: true, view: viewRoom(fresh, { acct: w.acct?.id, host: !!w.host }, ctx.now), now: ctx.now });
});

route('GET', 'hand', async (ctx, _b, q) => {
  const rec = await ctx.store.get(`hist/${String(q.get('id') || '').slice(0, 80)}`);
  if (!rec) return refuse('no-hand', 'That hand is not in the history (yet)');
  const w = await who(ctx);
  const viewer = { acct: w?.acct?.id || null, host: !!w?.host };
  const wasThere = viewer.acct && rec.players.some((p) => p.id === viewer.acct);
  if (rec.private && !wasThere && !viewer.host) return refuse('private', 'That hand was at a private table');
  return json({ ok: true, hand: redactRecord(rec, viewer) });
});

route('GET', 'stream', async () => refuse('no-stream', 'Live push is not available on this server; the page will poll instead'));

// --- the Event Head ---
route('GET', 'host/status', async (ctx) => {
  const host = await ctx.store.get('host');
  return json({ ok: true, setup: !!(host?.pass || ctx.env.ADMIN_PASSWORD), fromEnv: !!ctx.env.ADMIN_PASSWORD });
});

route('POST', 'host/setup', async (ctx, b) => {
  if (!limit(`auth:${ctx.ip}`, 30, 10 * MIN)) no('slow-down', 'Too many attempts — wait a few minutes', 429);
  if (ctx.env.ADMIN_PASSWORD) no('exists', 'The Event Head password is set on the server');
  const pw = String(b.password || '');
  if (pw.length < 6 || pw.length > 200) no('password', 'Choose a password of at least 6 characters');
  const pass = await hashPassword(pw);
  const r = await ctx.store.set('host', { pass, v: 1, at: ctx.now }, { onlyIfNew: true });
  if (!r.modified) no('exists', 'The Event Head password has already been chosen: sign in');
  return json({ ok: true, token: makeToken(await signingKey(ctx.store), 'h', 'host', 1, 12 * 3600000, ctx.now) });
});

route('POST', 'host/login', async (ctx, b) => {
  if (!limit(`auth:${ctx.ip}`, 30, 10 * MIN) || !limit('hostlogin', 40, 10 * MIN)) no('slow-down', 'Too many attempts — wait a few minutes', 429);
  const host = await ctx.store.get('host');
  const pw = String(b.password || '');
  let ok = false;
  if (ctx.env.ADMIN_PASSWORD) { const a = Buffer.from(pw); const e = Buffer.from(ctx.env.ADMIN_PASSWORD); ok = a.length > 0 && a.length === e.length && timingSafeEqual(a, e); }
  if (!ok && host?.pass) ok = await checkPassword(pw, host.pass);
  if (!ok) no('bad-login', 'That is not the Event Head password');
  let v = host?.v ?? 0;
  if (!host) { await ctx.store.set('host', { v: 0, at: ctx.now }, { onlyIfNew: true }); v = 0; }
  return json({ ok: true, token: makeToken(await signingKey(ctx.store), 'h', 'host', v, 12 * 3600000, ctx.now) });
});

route('POST', 'host/password', async (ctx, b) => {
  await needHost(ctx);
  if (ctx.env.ADMIN_PASSWORD) no('env', 'The password is set on the server (the ALEA_ADMIN_PASSWORD setting): change it there');
  const pw = String(b.password || '');
  if (pw.length < 6 || pw.length > 200) no('password', 'Choose a password of at least 6 characters');
  const pass = await hashPassword(pw);
  const { data } = await mutate(ctx.store, 'host', (h) => ({ ...(h || {}), pass, v: (h?.v || 0) + 1 }));
  return json({ ok: true, token: makeToken(await signingKey(ctx.store), 'h', 'host', data.v, 12 * 3600000, ctx.now) });
});

route('GET', 'host/overview', async (ctx) => {
  await needHost(ctx);
  const lob = (await ctx.store.get('lobby')) || { rooms: {} };
  const accounts = (await ctx.store.list('acct/')).length;
  return json({ ok: true, settings: await settingsOf(ctx.store), rooms: Object.values(lob.rooms).sort((a, b) => b.createdAt - a.createdAt), accounts, now: ctx.now });
});

route('GET', 'host/accounts', async (ctx) => {
  await needHost(ctx);
  const list = [];
  for (const k of await ctx.store.list('acct/')) {
    const a = await ctx.store.get(k);
    if (!a) continue;
    list.push({ id: a.id, name: a.name, guest: a.guest, bankroll: a.bankroll, inTransit: Object.values(a.holds || {}).reduce((x, h) => x + h.amount, 0), hands: a.stats.hands, net: a.stats.net, points: a.stats.points, tournaments: a.stats.tournaments, at: Object.values(a.at || {}).map((x) => x.name), createdAt: a.createdAt, lastLogin: a.lastLogin, ledger: a.ledger });
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  return json({ ok: true, accounts: list });
});

route('POST', 'host/grant', async (ctx, b) => {
  await needHost(ctx);
  const amount = Math.round(Number(b.amount));
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1e9) no('amount', 'Enter a whole number of chips (negative to take chips away)');
  const { data } = await mutate(ctx.store, `acct/${String(b.acct || '')}`, (a) => {
    if (!a) no('no-account', 'No such account');
    const change = Math.max(-a.bankroll, amount);
    a.bankroll += change; a.ledger.granted += change;
    return a;
  });
  return json({ ok: true, bankroll: data.bankroll });
});

route('POST', 'host/settings', async (ctx, b) => {
  await needHost(ctx);
  const cur = await settingsOf(ctx.store);
  const x = b.settings || {};
  const n = (v, d, lo, hi) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : d);
  const next = {
    formats: Object.fromEntries(Object.keys(DEFAULT_SETTINGS.formats).map((k) => [k, typeof x.formats?.[k] === 'boolean' ? x.formats[k] : cur.formats[k]])),
    startingChips: n(x.startingChips, cur.startingChips, 0, 1e9), reloadTo: n(x.reloadTo, cur.reloadTo, 0, 1e9),
    reloadBelow: n(x.reloadBelow, cur.reloadBelow, 0, 1e9), reloadMinutes: n(x.reloadMinutes, cur.reloadMinutes, 0, 100000),
    guests: typeof x.guests === 'boolean' ? x.guests : cur.guests, registration: typeof x.registration === 'boolean' ? x.registration : cur.registration,
    reminderMinutes: n(x.reminderMinutes, cur.reminderMinutes, 0, 600), maxTables: n(x.maxTables, cur.maxTables, 1, 20), maxBotsPerPractice: n(x.maxBotsPerPractice, cur.maxBotsPerPractice, 1, 9),
  };
  await ctx.store.set('settings', next);
  return json({ ok: true, settings: next });
});

route('POST', 'host/room', async (ctx, b) => {
  await needHost(ctx);
  const spec = roomSpecFrom(b, 'host', 'Event Head', true);
  const room = await newRoom(ctx, spec);
  if (b.bots?.count) await addBots(ctx, room.id, Math.min(Number(b.bots.count) || 0, spec.kind === 'tournament' ? 200 : room.cfg.seats), b.bots.level);
  return json({ ok: true, id: room.id, code: room.code });
});

/** The chip audit: every account's books, every table's books, and the transfers between them. */
route('GET', 'host/audit', async (ctx) => {
  await needHost(ctx);
  const rooms = [];
  for (const k of await ctx.store.list('room/')) { const r = await ctx.store.get(k); if (r) rooms.push(r); }
  const accts = [];
  for (const k of await ctx.store.list('acct/')) { const a = await ctx.store.get(k); if (a) accts.push(a); }
  const appliedAll = new Set(rooms.flatMap((r) => r.applied));
  const acctProblems = [];
  let bankrolls = 0; let holds = 0; let holdsApplied = 0; let boughtIn = 0; let cashedOut = 0; let issued = 0;
  for (const a of accts) {
    const h = Object.entries(a.holds || {});
    const held = h.reduce((x, [, v]) => x + v.amount, 0);
    const want = a.ledger.start + a.ledger.reloads + a.ledger.granted + a.ledger.prizes - a.ledger.boughtIn + a.ledger.cashedOut - held;
    if (want !== a.bankroll) acctProblems.push({ name: a.name, bankroll: a.bankroll, books: want });
    bankrolls += a.bankroll; holds += held; boughtIn += a.ledger.boughtIn; cashedOut += a.ledger.cashedOut;
    issued += a.ledger.start + a.ledger.reloads + a.ledger.granted + a.ledger.prizes;
    holdsApplied += h.filter(([id]) => appliedAll.has(id)).reduce((x, [, v]) => x + v.amount, 0);
  }
  const tables = []; let humanIn = 0; let humanOut = 0; let onTables = 0; let pendingCashouts = 0;
  for (const r of rooms.filter((x) => x.kind === 'cash')) {
    let ok = true;
    try { R.checkBooks(r); } catch { ok = false; }
    const on = R.chipsOnTables(r);
    const pend = r.outbox.filter((o) => o.kind === 'cashout').reduce((x, o) => x + o.amount, 0);
    humanIn += r.ledger.in - (r.ledger.botIn || 0); humanOut += r.ledger.out - (r.ledger.botOut || 0); onTables += on; pendingCashouts += pend;
    tables.push({ id: r.id, name: r.name, status: r.status, in: r.ledger.in, out: r.ledger.out, botIn: r.ledger.botIn || 0, botOut: r.ledger.botOut || 0, onTable: on, pendingCashouts: pend, ok });
  }
  const buyInsMatch = boughtIn + holdsApplied === humanIn;
  const cashOutsMatch = cashedOut + pendingCashouts === humanOut;
  return json({
    ok: true,
    summary: { accounts: accts.length, issued, bankrolls, inTransit: holds, onTables, pendingCashouts, boughtIn, cashedOut, humanIn, humanOut, holdsApplied, buyInsMatch, cashOutsMatch, accountsBalanced: acctProblems.length === 0, tablesBalanced: tables.every((t) => t.ok) },
    acctProblems, tables,
  });
});

route('GET', 'host/backup', async (ctx) => {
  await needHost(ctx);
  const out = {};
  for (const k of await ctx.store.list('')) {
    if (k === 'secrets' || k === 'host') continue;
    const d = await ctx.store.get(k);
    if (k.startsWith('acct/') && d) { delete d.pass; delete d.failed; }
    out[k] = d;
  }
  return json({ ok: true, at: ctx.now, docs: out });
});

route('POST', 'host/reset', async (ctx, b) => {
  await needHost(ctx);
  if (b.confirm !== 'RESET') no('confirm', 'Type RESET to confirm');
  const keepAccounts = !!b.keepAccounts;
  if (keepAccounts) {
    // give every player back the chips they have at cash tables before the tables go
    for (const k of await ctx.store.list('room/')) {
      const id = k.slice(5);
      try {
        await withRoom(ctx, id, (r) => {
          if (r.kind !== 'cash' || r.status !== 'open') return;
          for (const t of r.tables) if (R.isLive(t)) R.voidHand(r, t.i, ctx.now);
          R.closeRoom(r, ctx.now);
        });
        await deliver(ctx, id);
      } catch (e) { console.error('reset', id, e); }
    }
  }
  let n = 0;
  for (const k of await ctx.store.list('')) {
    if (k === 'secrets' || k === 'host' || k === 'settings') continue;
    if (keepAccounts && (k.startsWith('acct/') || k.startsWith('name/'))) continue;
    await ctx.store.del(k); n++;
  }
  if (keepAccounts) {
    for (const k of await ctx.store.list('acct/')) await mutate(ctx.store, k, (a) => { if (!a) return undefined; a.at = {}; a.holds = {}; return a; });
  }
  touched.clear();
  return json({ ok: true, deleted: n });
});

// ---------------- entry point ----------------

/**
 * handle(request, store, env, opts)
 *  opts.now()      — clock (tests)
 *  opts.rng        — random source (tests); live play uses crypto
 *  opts.publish    — called with (roomId, version) after every room change (live push)
 *  opts.defer      — run follow-up work after the response (Netlify waitUntil)
 */
export async function handle(request, store, env = {}, opts = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const ctx = { store, env, now: opts.now ? opts.now() : Date.now(), rng: opts.rng || secureRng, url, request, ip: clientIp(request), publish: opts.publish || (() => {}), defer: opts.defer || null, streaming: !!opts.streaming };
  try {
    if (!limit(`ip:${ctx.ip}`, opts.ipLimit || 1200, MIN, ctx.now)) return fail(429, 'Too many requests — slow down a little');
    const fn = ROUTES[`${request.method} ${path}`];
    if (!fn) return fail(404, 'Not found');
    let body = {};
    if (request.method === 'POST') {
      const text = await request.text();
      if (text.length > 32000) return fail(413, 'Request too large');
      body = text ? JSON.parse(text) : {};
      if (typeof body !== 'object' || body === null || Array.isArray(body)) return fail(400, 'Bad request');
    }
    return await fn(ctx, body, url.searchParams);
  } catch (e) {
    if (e instanceof R.RoomError) return refuse(e.code, e.message);
    if (e instanceof Refusal) return e.status === 200 ? refuse(e.code, e.message) : json({ ok: false, refused: true, code: e.code, error: e.message }, e.status);
    if (e instanceof SyntaxError) return fail(400, 'Bad request');
    console.error(e);
    return fail(500, 'Something went wrong on the server');
  }
}

/** The Node server's background clock: bring a room up to date even when nobody is polling. */
export async function tickRoom(store, id, opts = {}) {
  const now = opts.now ? opts.now() : Date.now();
  const ctx = { store, env: {}, now, rng: opts.rng || secureRng, publish: opts.publish || (() => {}), defer: null, url: new URL('http://x/'), request: new Request('http://x/') };
  const { data: room, changed } = await mutate(store, `room/${id}`, (r) => (r && R.tick(r, now, ctx.rng) ? r : undefined), 4);
  if (changed && room) await after(ctx, room);
  return changed;
}
