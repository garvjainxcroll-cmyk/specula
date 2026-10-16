// The server: the game, teams and their codes, prices, trades, loans, updates and the
// host's controls. It runs inside the Netlify function (netlify/functions/api.mjs) and,
// for tests and the local server, against an in-memory store with the same interface.
//
// The game, as in SPECULA: the host creates the game (an optional name and the teams),
// every team gets a private code, members join a team's desk with the code and their
// name, and any member's trade is the team's trade. Phases: lobby → live → ended.
//
// Who may see what (tests/api.test.mjs checks every rule):
//  - A team member sees prices, their own team's account, their own team's loans (with
//    the other team's name) and the host's updates. Never another team's money, holdings,
//    members or code, never the host's price moves, levels or the price seed.
//  - The Big Screen (public) sees prices, updates and the team names; standings only once
//    the host reveals the results at the end.
//  - The host (password) sees everything.
//  - Prices are worked out here only, from the time and a secret seed, so nobody can
//    read a future price from the website.

import { STOCKS, TICKERS, BY_T, START_CASH } from '../src/stocks.mjs';
import { priceAt, pricesAt, levelsAt, levelAt, moveStart, moveEnd, movePlan, marketTime, isRunning, setRunning, wallTimeOf, LEVEL_MIN, LEVEL_MAX } from './model.mjs';

const KEY = 'state';
const TOKEN_MS = 30 * 864e5;
const MAX_TRADES = 5000;
const MAX_TEAMS = 120;
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const enc = new TextEncoder();

// ---------------- responses ----------------

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
const ok = (body = {}) => json({ ok: true, ...body });
// A refusal (not enough cash, market closed, wrong code…) is an ordinary answer.
const refuse = (error, extra = {}) => json({ ok: false, refused: true, error, ...extra });
const denied = (error = 'Please join your team again.') => json({ ok: false, auth: true, error }, 401);
class Refusal { constructor(msg) { this.msg = msg; } }
const no = (msg) => { throw new Refusal(msg); };

// ---------------- crypto ----------------

const b64 = (buf) => Buffer.from(buf).toString('base64url');
async function pbkdf2(pass, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return b64(new Uint8Array(bits));
}
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg))));
}
function randomId(n = 16, abc = 'abcdefghijkmnpqrstuvwxyz23456789') {
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => abc[x % abc.length]).join('');
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function makeToken(s, sub, now) {
  const body = b64(enc.encode(JSON.stringify({ s: sub, x: now + TOKEN_MS })));
  return `${body}.${await hmac(s.secret, body)}`;
}
async function readToken(s, tok, now) {
  if (typeof tok !== 'string' || tok.length > 400) return null;
  const [body, sig] = tok.split('.');
  if (!body || !sig || !safeEqual(sig, await hmac(s.secret, body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.x > now ? p.s : null;
  } catch { return null; }
}

// ---------------- the stored game ----------------

function freshState(now, keep = {}) {
  return {
    v: 1,
    created: now,
    secret: keep.secret || randomId(32),
    seed: randomId(16),
    host: keep.host || null, // { salt, hash, hv }
    game: { name: keep.name || '', phase: 'lobby', revealed: false, startedAt: null, endedAt: null },
    clock: [[now, 0, 0]],
    timer: { endsAt: null },
    moves: {}, // ticker -> [[marketTime, fromLevel, toLevel, durationMs, wallTime, label]]
    teams: keep.teams || [],
    gone: keep.gone || [], // people whose team was removed, kept for the Dataset
    loans: [],
    updates: [],
    n: { team: keep.n?.team || 0, member: keep.n?.member || 0, loan: 0, update: 0 },
    uv: keep.uv || 0, // never repeats across resets
  };
}
function freshFund(t, now) {
  t.cash = START_CASH; t.h = {}; t.rz = 0; t.tr = []; t.ntr = 0; t.base = null; t.reset = now; delete t.done;
  return t;
}
/** A code no team has: neither the saved teams nor `more` (teams made in the same save). */
function newCode(s, more = []) {
  for (;;) {
    const c = randomId(6, CODE_ABC);
    if (!s.teams.some((t) => t.code === c) && !more.some((t) => t?.code === c)) return c;
  }
}
function newTeam(s, name, now, more = []) {
  s.n.team += 1;
  return freshFund({ id: `t${s.n.team}${randomId(4)}`, n: s.n.team, name, code: newCode(s, more), members: [], created: now }, now);
}

async function load(store, now) {
  let r = await store.getMeta(KEY);
  if (!r) {
    await store.set(KEY, freshState(now), { onlyIfNew: true });
    r = await store.getMeta(KEY);
  }
  return r;
}

const timerDue = (s, now) => !!(s.timer.endsAt && s.timer.endsAt <= now && isRunning(s.clock));
const hasDue = (s, now) => timerDue(s, now) || s.loans.some((L) => L.status === 'ongoing' && L.due <= now);

const RECENT = 64; // how many recent write stamps the state remembers
const BUDGET_MS = 8000; // keep trying for up to 8 s (Netlify allows 10)

function stamp(s, prev) {
  s.v = (prev.v || 0) + 1;
  s.wid = randomId(10); // this write's own stamp
  s.recent = [...(prev.recent || []).slice(-(RECENT - 1)), s.wid];
}

/**
 * Read, change and save the game, safely even when many people act at once: a save only
 * lands on the version it was made from, and a lost race is retried on the new version.
 * Every save carries a stamp; if a save landed but its reply was lost, the retry finds the
 * stamp in the state and returns the first result instead of applying the change twice.
 */
async function mutate(store, now, fn) {
  const started = Date.now();
  const mine = new Map();
  for (let k = 0; ; k++) {
    const cur = await load(store, now);
    for (const w of cur.data.recent || []) if (mine.has(w)) return mine.get(w);
    const s = structuredClone(cur.data);
    const settled = settleDue(s, now);
    let out;
    try { out = await fn(s); } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      if (settled) { stamp(s, cur.data); await store.set(KEY, s, { onlyIfMatch: cur.etag }).catch(() => null); } // keep what fell due
      throw e;
    }
    if (out === NOCHANGE && !settled) return { s: cur.data, out };
    stamp(s, cur.data);
    mine.set(s.wid, { s, out });
    let res = null;
    try { res = await store.set(KEY, s, { onlyIfMatch: cur.etag }); } catch { res = null; } // unknown: the next read tells
    if (res?.modified && (res.etag || (await store.getMeta(KEY))?.data?.wid === s.wid)) return { s, out };
    if (Date.now() - started > BUDGET_MS) {
      // out of time: a write whose answer was lost may still have landed, so look once more
      const last = await load(store, now).catch(() => null);
      for (const w of last?.data?.recent || []) if (mine.has(w)) return mine.get(w);
      throw new Error('busy');
    }
    await new Promise((r) => setTimeout(r, Math.random() * Math.min(600, 20 * 2 ** k)));
  }
}
const NOCHANGE = Symbol('nochange');

// ---------------- a repeated press is not a second action ----------------
// The desk and the console send an id with each order, loan and update, and the same id
// again when someone presses the button again after an answer was lost. A team's order
// keeps its id on its row in the trade log, so a repeat within ORDER_KEEP_MS gets the first
// result back however many orders the team makes meanwhile (the desk offers the repeat for
// 10 minutes). The host keeps the ids of its last DONE_KEEP loans and updates.
const DONE_KEEP = 40;
const ORDER_KEEP_MS = 15 * 60000;
const ridTag = (rid) => rid.slice(-12);
/** The fill of this team's order sent with this id, if it was placed in the last 15 minutes. */
function orderBefore(t, rid, now) {
  if (!rid || !t) return null;
  const tag = ridTag(rid);
  for (let i = t.tr.length - 1; i >= 0 && t.tr[i][0] > now - ORDER_KEEP_MS; i--) {
    const r = t.tr[i];
    if (r[6] === tag) return { t: TICKERS[r[2]], side: r[3] < 0 ? 'sell' : 'buy', q: Math.abs(r[3]), p: r[4], value: Math.abs(r[3]) * r[4], at: r[0] };
  }
  return (t.done || []).find((x) => x[0] === rid)?.[1] || null; // saved by the previous version
}
const SESSIONS = 10; // devices signed in to one member record at once (the oldest is signed out)
const ridOf = (body) => (typeof body.rid === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(body.rid) ? body.rid : '');
const doneBefore = (list, rid) => (rid ? (list || []).find((x) => x[0] === rid)?.[1] : undefined);
const remember = (list, rid, out) => (rid ? [...(list || []), [rid, out]].slice(-DONE_KEEP) : list || []);

// ---------------- the host login lock ----------------
// Kept apart from the game, so wrong passwords never slow down trades. Each internet
// connection has its own count (an IPv6 connection is its whole /48 block), so a player
// on another network cannot lock the host out; every device on one Wi-Fi shares a count.
// Every try is counted before its password is checked, so guesses sent at the same moment
// cannot slip past: at most ten tries in any ten minutes. A right password clears the count.
const LOCK_KEY = 'hostlock';
const LOCK_TRIES = 10;
const LOCK_WINDOW_MS = 10 * 60000;
const LOCK_CLIENTS = 2000;
const OVERFLOW = '*'; // shared by new connections while the table is full
// The shared count allows far more tries, so filling the table cannot lock the host out of
// every new connection: someone would need thousands of addresses, and then a thousand
// wrong passwords every ten minutes, to keep it full.
const OVERFLOW_TRIES = 1000;

/** The part of an internet address that names one connection. */
export function connectionOf(ip) {
  let a = String(ip || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const v4 = a.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/); // IPv4, or IPv4 written as IPv6
  if (v4) return v4[1];
  if (!a.includes(':')) return a;
  const [head, tail = ''] = a.split('::');
  const hs = head ? head.split(':') : []; const ts = tail ? tail.split(':') : [];
  const groups = a.includes('::') ? [...hs, ...Array(Math.max(0, 8 - hs.length - ts.length)).fill('0'), ...ts] : hs;
  return groups.slice(0, 3).map((g) => (parseInt(g, 16) || 0).toString(16)).join(':') + '::/48';
}

/** Change the lock record safely when tries arrive together (a conditional write). */
async function editLock(store, fn) {
  const started = Date.now();
  for (let k = 0; ; k++) {
    const cur = await store.getMeta(LOCK_KEY);
    const c = { ...(cur?.data?.c || {}) };
    fn(c);
    const next = { c, id: randomId(8) };
    let res = null;
    try { res = await store.set(LOCK_KEY, next, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true }); } catch { res = null; }
    if (res?.modified && (res.etag || (await store.getMeta(LOCK_KEY))?.data?.id === next.id)) return;
    if (Date.now() - started > BUDGET_MS) throw new Error('busy');
    await new Promise((r) => setTimeout(r, Math.random() * Math.min(600, 20 * 2 ** k)));
  }
}
async function takeTry(store, now, who) {
  await editLock(store, (c) => {
    const live = (k) => {
      const e = c[k];
      // an entry saved by the previous version is { t: [...], until }
      const t = Array.isArray(e) ? e : e && e.until > now ? Array(LOCK_TRIES).fill(e.until - LOCK_WINDOW_MS) : Array.isArray(e?.t) ? e.t : [];
      return t.filter((x) => typeof x === 'number' && x > now - LOCK_WINDOW_MS);
    };
    for (const k of Object.keys(c)) { const t = live(k); if (t.length) c[k] = t; else delete c[k]; }
    // a full table never forgets a live count: new connections share one count instead
    const key = c[who] || Object.keys(c).length < LOCK_CLIENTS ? who : OVERFLOW;
    const t = c[key] || [];
    if (t.length >= (key === OVERFLOW ? OVERFLOW_TRIES : LOCK_TRIES)) {
      const mins = Math.max(1, Math.ceil((t[0] + LOCK_WINDOW_MS - now) / 60000));
      no(`Too many wrong passwords. Try again in ${mins} minute${mins > 1 ? 's' : ''}.`);
    }
    c[key] = [...t, now];
  });
}

async function readState(store, now) {
  const cur = await load(store, now);
  if (hasDue(cur.data, now)) return (await mutate(store, now, () => NOCHANGE)).s;
  return cur.data;
}

const teamById = (s, id) => s.teams.find((t) => t.id === id) || null;
const tIndex = (t) => TICKERS.indexOf(t);
/** Only the ten tickers: never '__proto__', 'constructor' or anything else. */
const isTicker = (k) => typeof k === 'string' && Object.hasOwn(BY_T, k);
const own = (table, key, fallback) => (typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : table[fallback]);

// ---------------- money ----------------

function accrued(L, w) {
  const f = Math.min(1, Math.max(0, (w - L.start) / Math.max(1, L.due - L.start)));
  return L.amount + Math.round((L.final - L.amount) * f);
}

/** A team's money. Liquidable = cash + what its shares would sell for now. */
function summary(s, t, now, prices) {
  let hv = 0; let inv = 0;
  for (const [k, [q, c]] of Object.entries(t.h)) { hv += q * prices[k]; inv += c; }
  let rec = 0; let pay = 0;
  for (const L of s.loans) {
    if (L.status !== 'ongoing') continue;
    if (L.lender === t.id) rec += accrued(L, now);
    if (L.borrower === t.id) pay += accrued(L, now);
  }
  const liq = t.cash + hv;
  const nw = liq + rec - pay;
  const pnl = nw - START_CASH;
  return { cash: t.cash, hv, inv, upl: hv - inv, rpl: t.rz, liq, rec, pay, nw, pnl, pct: Math.round((pnl / START_CASH) * 1e6) / 1e4 };
}

function buy(t, k, q, p, w, m, tag) {
  const cost = q * p;
  if (cost > t.cash) {
    const max = Math.max(0, Math.floor(t.cash / p));
    no(t.cash <= 0 ? 'Your team has no cash to buy with.' : `Not enough cash: ${q} × ₹${(p / 100).toFixed(2)} costs ₹${(cost / 100).toFixed(2)}. You can buy up to ${max}.`);
  }
  t.cash -= cost;
  const h = (t.h[k] ||= [0, 0]);
  h[0] += q; h[1] += cost;
  logTrade(t, tag ? [w, m, tIndex(k), q, p, 0, tag] : [w, m, tIndex(k), q, p]);
}

/** Keep the last MAX_TRADES orders; older ones are folded into a starting point for the history. */
function logTrade(t, row) {
  t.ntr = (t.ntr ?? t.tr.length) + 1;
  t.tr.push(row);
  if (t.tr.length <= MAX_TRADES) return;
  const b = (t.base ||= { cash: START_CASH, q: new Array(TICKERS.length).fill(0), at: 0 });
  for (const r of t.tr.splice(0, t.tr.length - MAX_TRADES)) { b.cash -= r[3] * r[4]; b.q[r[2]] += r[3]; b.at = r[0]; }
}

function sell(t, k, q, p, w, m, forced = 0, tag = '') {
  const h = t.h[k];
  if (!h || h[0] < q) no(h ? `Your team holds only ${h[0]} ${k}.` : `Your team does not hold any ${k}.`);
  const costOut = Math.round((h[1] * q) / h[0]);
  h[0] -= q; h[1] -= costOut;
  if (h[0] === 0) delete t.h[k];
  const proceeds = q * p;
  t.cash += proceeds;
  t.rz += proceeds - costOut;
  logTrade(t, forced ? [w, m, tIndex(k), -q, p, 1] : tag ? [w, m, tIndex(k), -q, p, 0, tag] : [w, m, tIndex(k), -q, p]);
}

// ---------------- what falls due: loan deadlines and the session clock ----------------

/** Settle, in time order, every loan deadline and session end that has passed. */
function settleDue(s, now) {
  let changed = false;
  for (;;) {
    const L = s.loans.filter((x) => x.status === 'ongoing' && x.due <= now).sort((a, b) => a.due - b.due)[0];
    const end = timerDue(s, now) ? s.timer.endsAt : null;
    if (!L && end === null) return changed;
    changed = true;
    if (end !== null && (!L || end <= L.due)) { s.clock = setRunning(s.clock, end, false); s.timer.endsAt = null; continue; }
    settleLoan(s, L, L.due);
  }
}

// At the deadline the borrower repays the loan plus interest to the lender. If the
// borrower's cash is short, its shares are sold (largest holding first, at the price at
// the deadline) until it is covered. If even that is not enough, the borrower's cash goes
// below zero: the lender is always paid in full.
function settleLoan(s, L, at) {
  const b = teamById(s, L.borrower);
  const l = teamById(s, L.lender);
  const sold = b ? cover(s, b, L.final, at) : [];
  if (b) b.cash -= L.final;
  if (l) l.cash += L.final;
  L.status = 'elapsed';
  L.settledAt = at;
  L.sold = sold;
  L.short = b && b.cash < 0 ? -b.cash : 0;
}

/** Sell a team's shares (largest holding first, at the price at `at`) until its cash covers `need`. */
function cover(s, b, need, at) {
  const sold = [];
  if (b.cash >= need) return sold;
  const m = marketTime(s.clock, at);
  const hs = Object.entries(b.h).map(([k, [q]]) => ({ k, q, p: priceAt(s, k, m) })).sort((x, y) => y.q * y.p - x.q * x.p);
  for (const x of hs) {
    const short = need - b.cash;
    if (short <= 0) break;
    const q = Math.min(x.q, Math.ceil(short / x.p));
    sell(b, x.k, q, x.p, at, m, 1);
    sold.push([x.k, q, x.p]);
  }
  return sold;
}

function loanForTeam(L, tid) {
  const role = L.lender === tid ? 'lender' : 'borrower';
  return {
    id: L.id, n: L.n, role, other: role === 'lender' ? L.borrowerName : L.lenderName,
    amount: L.amount, rate: L.rate, final: L.final, start: L.start, due: L.due, mins: L.mins,
    status: L.status, settledAt: L.settledAt || null, cancelledAt: L.cancelledAt || null,
    sold: role === 'borrower' ? (L.sold || []) : [], short: role === 'borrower' ? (L.short || 0) : 0,
  };
}

// ---------------- documents ----------------

function market(s, now) {
  const m = marketTime(s.clock, now);
  return { g: s.created, open: isRunning(s.clock), m, p: pricesAt(s, m), o: pricesAt(s, 0) };
}
const gameDoc = (s) => ({ name: s.game.name, phase: s.game.phase, revealed: !!s.game.revealed, endsAt: s.timer.endsAt, startedAt: s.game.startedAt, endedAt: s.game.endedAt, teams: s.teams.length });
const updatesDoc = (s) => s.updates.slice().sort((a, b) => a.n - b.n).map((x) => ({ id: x.id, n: x.n, text: x.text, at: x.at, ed: x.ed || null }));
const tradeDoc = (r) => ({ w: r[0], t: TICKERS[r[2]], q: r[3], p: r[4], f: r[5] ? 1 : 0 });
const holdingsDoc = (t) => Object.entries(t.h).map(([k, [q, c]]) => ({ t: k, q, cost: c }));

/** Every team ranked by net worth (= total P&L), best first; equal net worth, equal place. */
function standings(s, now, prices) {
  const list = s.teams.map((t) => ({ id: t.id, name: t.name, ...summary(s, t, now, prices) }))
    .sort((a, b) => b.nw - a.nw || a.name.localeCompare(b.name));
  // teams with exactly the same net worth share a place
  return list.map((x) => ({ rank: 1 + list.filter((y) => y.nw > x.nw).length, id: x.id, name: x.name, nw: x.nw, liq: x.liq, pnl: x.pnl, pct: x.pct }));
}

function teamDoc(s, t, member, now, prices) {
  return {
    id: t.id, name: t.name, member: member ? { id: member.id, name: member.name } : null, members: active(t).map((x) => x.name),
    cash: t.cash, h: holdingsDoc(t), sum: summary(s, t, now, prices),
    tr: t.tr.slice(-150).map(tradeDoc).reverse(), ntr: t.ntr ?? t.tr.length,
    loans: s.loans.filter((L) => L.lender === t.id || L.borrower === t.id).map((L) => loanForTeam(L, t.id)),
  };
}

/** A member as the host sees it (without the ids of its devices' sessions). */
const personDoc = ({ ss, ...m }) => m;

function hostTeamRow(s, t, now, prices) {
  const last = t.tr.length ? t.tr[t.tr.length - 1][0] : null;
  return {
    id: t.id, n: t.n, name: t.name, code: t.code, members: t.members.map(personDoc), created: t.created,
    lastTrade: last, ntr: t.ntr ?? t.tr.length, h: holdingsDoc(t), sum: summary(s, t, now, prices),
  };
}

function moveLog(s, limit = 150) {
  const out = [];
  for (const [t, list] of Object.entries(s.moves)) {
    for (const x of list) {
      // bell: for a move made while closed, how long after the opening bell it starts
      out.push({ t, m: x[0], from: x[7] ?? x[1], to: x[2], dur: x[6] ? 0 : x[3], w: x[4], label: x[5] || '', atOpen: !!x[6], queued: !!x[8], bell: x[8] ? Math.max(0, moveStart(x) - marketTime(s.clock, x[4])) : 0 });
    }
  }
  return out.reverse().sort((a, b) => b.w - a.w).slice(0, limit); // newest first
}

/** A move that has not started yet and was made while closed: the host can still cancel it. */
function cancellable(s, x, m) {
  if (x[8] !== 1) return false;
  if (x[0] > m) return true;
  return !isRunning(s.clock) && x[4] >= s.clock.at(-1)[0]; // made in this break
}

/** For the console: per stock, the gradual move playing now and the moves still to come. */
function planDoc(s, m) {
  const closed = !isRunning(s.clock);
  const out = {};
  for (const t of TICKERS) {
    const list = s.moves[t] || [];
    const { now: x, next } = movePlan(list, m);
    const up = next.slice(); let glide = null;
    if (x && x[3] > 1 && m < moveEnd(x)) {
      // while closed, a gradual move that has not taken its first step waits for the bell
      if (closed && Math.floor(m / 1000) * 1000 <= x[0]) up.unshift(x); else glide = { to: x[2], left: moveEnd(x) - m };
    }
    out[t] = { glide, next: up.map((y) => ({ to: y[2], in: Math.max(0, moveStart(y) - m), dur: y[3] > 1 ? y[3] : 0 })), cancel: up.filter((y) => cancellable(s, y, m)).length };
  }
  return out;
}

const RANGES = { '5m': [300e3, 2e3], '30m': [1800e3, 10e3], '1h': [3600e3, 20e3], '1d': [86400e3, 480e3] };

/** Prices over a range of market time (the history every stock already has included). */
function priceHistory(s, tickers, range, now) {
  const [span, step] = own(RANGES, range, '30m');
  const m = marketTime(s.clock, now);
  const xs = [];
  for (let x = Math.ceil((m - span) / step) * step; x < m; x += step) xs.push(x);
  xs.push(m);
  const ws = xs.map((x) => Math.round(wallTimeOf(s.clock, x, now)));
  const p = {};
  for (const t of tickers) p[t] = xs.map((x) => priceAt(s, t, x));
  return { g: s.created, m, xs, ws, p };
}

/** A team's net worth over time, rebuilt from its trades, loans and the prices. */
function teamHistory(s, t, now, range) {
  const spans = { '30m': 1800e3, '1h': 3600e3, '1d': 86400e3 };
  const start0 = Math.max(t.reset || t.created, s.created);
  const from = Math.min(now, Math.max(start0, now - own(spans, range, '1d')));
  const ev = [];
  for (const r of t.tr) ev.push([r[0], 0, -r[3] * r[4], r[2], r[3]]);
  const mine = s.loans.filter((L) => L.lender === t.id || L.borrower === t.id);
  for (const L of mine) {
    const sign = L.lender === t.id ? -1 : 1;
    ev.push([L.start, 1, sign * L.amount]);
    if (L.status === 'elapsed') ev.push([L.settledAt, 2, -sign * L.final]);
    if (L.status === 'cancelled') ev.push([L.cancelledAt, 2, -sign * L.amount]);
  }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const N = 160;
  const ws = [];
  for (let k = 0; k < N; k++) ws.push(Math.round(from + ((now - from) * k) / N));
  ws.push(now);
  let cash = t.base?.cash ?? START_CASH; const q = t.base ? [...t.base.q] : new Array(TICKERS.length).fill(0); let i = 0;
  const nw = []; const lq = [];
  for (const w of ws) {
    while (i < ev.length && ev[i][0] <= w) {
      const e = ev[i++];
      cash += e[2];
      if (e[1] === 0) q[e[3]] += e[4];
    }
    const m = marketTime(s.clock, w);
    let hv = 0;
    for (let k = 0; k < q.length; k++) if (q[k]) hv += q[k] * priceAt(s, TICKERS[k], m);
    let rec = 0; let pay = 0;
    for (const L of mine) {
      const end = L.settledAt || L.cancelledAt || Infinity;
      if (L.start <= w && w < end) { if (L.lender === t.id) rec += accrued(L, w); else pay += accrued(L, w); }
    }
    lq.push(cash + hv);
    nw.push(cash + hv + rec - pay);
  }
  return { ws, nw, lq };
}

// ---------------- input checks ----------------

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
const cleanText = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
const normCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
function rupeesToPaise(v) {
  const n = Number(String(v ?? '').replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
function checkNames(raw) {
  const names = (Array.isArray(raw) ? raw : []).map((x) => clean(x, 40)).filter(Boolean);
  if (!names.length) no('Type at least one team name.');
  if (names.length > MAX_TEAMS) no(`At most ${MAX_TEAMS} teams.`);
  const seen = new Set();
  for (const n of names) { const k = n.toLowerCase(); if (seen.has(k)) no(`Two teams are called “${n}”. Each team needs its own name.`); seen.add(k); }
  return names;
}
function renameTeam(s, t, name) {
  t.name = name;
  for (const L of s.loans) { if (L.lender === t.id) L.lenderName = name; if (L.borrower === t.id) L.borrowerName = name; }
}
const active = (t) => t.members.filter((m) => !m.out);
/** Keep the people of a team that is being removed, for the Dataset. */
function keepPeople(s, t, now) {
  s.gone = (s.gone || []).concat(t.members.map(({ ss, ...m }) => ({ ...m, team: t.name, out: m.out || now, why: m.out ? m.why : 'removed' }))).slice(-1000);
}
const hasHistory = (s, t) => t.tr.length > 0 || s.loans.some((L) => L.lender === t.id || L.borrower === t.id);

// ---------------- the handler ----------------

export async function handle(request, store, env = {}) {
  const now = env.now ? env.now() : Date.now();
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  let body = {};
  if (method === 'POST') {
    const text = await request.text();
    if (text.length > 20000) return refuse('That is too long.');
    try { body = text ? JSON.parse(text) : {}; } catch { return refuse('That request could not be read.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) body = {};
  }
  const token = request.headers.get('x-token') || '';
  try {
    return await route({ path, method, body, url, token, store, env, now });
  } catch (e) {
    if (e instanceof Refusal) return refuse(e.msg);
    if (e.message === 'busy') return json({ ok: false, error: 'The server is busy. Please try again.' }, 503);
    console.error(e);
    return json({ ok: false, error: 'Something went wrong on the server. Please try again.' }, 500);
  }
}

async function route(c) {
  const { path, method, body, url, token, store, now } = c;
  const POST = method === 'POST';

  if (path === 'health') return ok({ storage: store.kind, now });

  // ---- public: prices, the Big Screen ----
  if (path === 'market' && !POST) {
    const s = await readState(store, now);
    return ok({ now, game: gameDoc(s), mk: market(s, now) });
  }
  if (path === 'history' && !POST) {
    const s = await readState(store, now);
    const t = url.searchParams.get('t') || 'all';
    const tickers = t === 'all' ? TICKERS : [...new Set(t.split(','))].filter(isTicker);
    if (!tickers.length) return refuse('Unknown stock.');
    return ok({ now, ...priceHistory(s, tickers, url.searchParams.get('r') || '30m', now) });
  }
  if (path === 'board' && !POST) {
    const s = await readState(store, now);
    const mk = market(s, now);
    const uv = Number(url.searchParams.get('uv'));
    return ok({
      now, game: gameDoc(s), mk,
      teams: s.teams.map((t) => ({ name: t.name, members: active(t).length })),
      uv: s.uv, ...(uv !== s.uv ? { updates: updatesDoc(s).slice(-6) } : {}),
      standings: s.game.phase === 'ended' && s.game.revealed ? standings(s, now, mk.p).map(({ rank, name, nw, pnl, pct }) => ({ rank, name, nw, pnl, pct })) : null,
    });
  }

  // ---- teams: join with the code ----
  if (path === 'join' && POST) {
    const code = normCode(body.code);
    const name = clean(body.name, 40);
    const phone = clean(body.phone, 20);
    if (code.length < 4) no('Type your team code (6 letters and numbers).');
    if (name.length < 2) no('Type your name.');
    if (phone && !/^[+\d][\d\s-]{6,19}$/.test(phone)) no('That phone number does not look right. Leave it empty if you prefer.');
    const { s, out } = await mutate(store, now, (s) => {
      const t = s.teams.find((x) => x.code === code);
      if (!t) no('That code does not match any team. Check it with the host.');
      // the same name on the same team is the same person, unless the phone numbers differ
      const digits = (x) => String(x || '').replace(/\D/g, '');
      const same = t.members.filter((x) => x.name.toLowerCase() === name.toLowerCase());
      const phoneIs = (x) => !!x.phone && digits(x.phone).slice(-10) === digits(phone).slice(-10);
      const samePhone = (x) => !phone || !x.phone || phoneIs(x);
      // with a phone number, a person's own record comes first, signed in or not
      let m = (phone && (same.find((x) => !x.out && phoneIs(x)) || same.findLast(phoneIs))) || null;
      if (!m) {
        m = same.find((x) => !x.out) || null;
        if (m && !samePhone(m)) no(`Someone called ${m.name} is already on this team. Add your surname or an initial to your name.`);
        // a signed-out record of the same person comes back; a different person gets their own
        if (!m) m = same.findLast((x) => samePhone(x)) || null;
      }
      if (!m || m.out) { if (active(t).length >= 50) no('This team already has 50 members signed in.'); }
      if (m) {
        if (m.out) m.ss = []; // its old devices were signed out
        m.last = now; m.out = null; m.why = null; if (phone && !m.phone) m.phone = phone;
      } else {
        if (t.members.length >= 200) no('This team has too many members. Ask the host.');
        s.n.member += 1;
        m = { id: `m${s.n.member}${randomId(3)}`, name, phone, joined: now, last: now, out: null, sv: 0, ss: [] };
        t.members.push(m);
      }
      // each device signed in to the record has its own session, so one can leave alone
      const sid = randomId(8);
      m.ss = [...(m.ss || []), sid].slice(-SESSIONS);
      return { tid: t.id, mid: m.id, cv: t.cv || 0, sv: m.sv || 0, sid, team: t.name };
    });
    return ok({ token: await makeToken(s, `m:${out.tid}:${out.mid}:${out.cv}:${out.sv}:${out.sid}`, now), team: out.team, game: gameDoc(s) });
  }

  // ---- the host ----
  if (path.startsWith('host/') || path === 'host') return hostRoute(c);

  // ---- team members: signed in ----
  const s = await readState(store, now);
  const sub = await readToken(s, token, now);
  // a member's sign-in lasts until the host makes a new code for the team or signs them out
  const [kind, tid, mid, cv = '0', sv = '0', sid = ''] = (sub || '').split(':');
  const team = kind === 'm' ? teamById(s, tid) : null;
  const found = team && cv === String(team.cv || 0) ? team.members.find((x) => x.id === mid) : null;
  // a sign-in from before sessions (no sid) lasts as it did
  const member = found && !found.out && sv === String(found.sv || 0) && (!sid || (found.ss || []).includes(sid)) ? found : null;
  if (!team || !member) return denied();

  if (path === 'leave' && POST) {
    // signs out this device only; the person is signed out when no device is left
    await mutate(store, now, (s) => {
      const m = teamById(s, team.id)?.members.find((x) => x.id === member.id);
      if (!m || m.out) return NOCHANGE;
      m.ss = sid ? (m.ss || []).filter((x) => x !== sid) : [];
      if (!m.ss.length) { m.out = now; m.why = 'left'; m.sv = (m.sv || 0) + 1; }
    });
    return ok();
  }
  if (path === 'poll' && !POST) {
    const mk = market(s, now);
    const uv = Number(url.searchParams.get('uv'));
    let place = null;
    if (s.game.phase === 'ended' && s.game.revealed) {
      const st = standings(s, now, mk.p);
      const mine = st.find((x) => x.id === team.id);
      place = { rank: mine.rank, of: st.length };
    }
    return ok({ now, game: gameDoc(s), mk, me: teamDoc(s, team, member, now, mk.p), place, uv: s.uv, ...(uv !== s.uv ? { updates: updatesDoc(s) } : {}) });
  }
  if (path === 'me/history' && !POST) {
    return ok({ now, ...teamHistory(s, team, now, url.searchParams.get('r') || '1d') });
  }
  if (path === 'trade' && POST) {
    const k = String(body.t || ''); const side = body.side === 'sell' ? 'sell' : body.side === 'buy' ? 'buy' : null;
    const q = Number(body.q);
    if (!isTicker(k)) no('Unknown stock.');
    if (!side) no('Choose Buy or Sell.');
    if (!Number.isInteger(q) || q < 1 || q > 10000000) no('Quantity must be a whole number of shares, at least 1.');
    const rid = ridOf(body);
    let again = null;
    const { s: s2, out } = await mutate(store, now, (s) => {
      again = orderBefore(teamById(s, team.id), rid, now);
      if (again) { again = { by: member.name, ...again }; return NOCHANGE; }
      if (s.game.phase === 'lobby') no('The game has not started yet. Orders open when the host starts it.');
      if (s.game.phase === 'ended') no('The game is over. No more orders.');
      if (!isRunning(s.clock)) no('The market is closed. Orders open when the host opens the market.');
      const t = teamById(s, team.id);
      if (!t) no('Your team no longer exists.');
      const m = marketTime(s.clock, now);
      const p = priceAt(s, k, m);
      if (side === 'buy') buy(t, k, q, p, now, m, rid && ridTag(rid)); else sell(t, k, q, p, now, m, 0, rid && ridTag(rid));
      // lists of ids saved by the previous version go once they are too old to matter
      if (t.done) { t.done = t.done.filter((x) => x[1]?.at > now - ORDER_KEEP_MS); if (!t.done.length) delete t.done; }
      delete s.done;
      return { t: k, side, q, p, value: q * p, at: now, by: member.name };
    });
    const mk = market(s2, now);
    const t2 = teamById(s2, team.id);
    return ok({ fill: again || out, again: !!again, now, game: gameDoc(s2), mk, me: teamDoc(s2, t2, t2.members.find((x) => x.id === member.id), now, mk.p) });
  }
  return json({ ok: false, error: 'Not found' }, 404);
}

async function hostRoute(c) {
  const { path, method, body, url, token, store, env, now } = c;
  const POST = method === 'POST';
  const envPass = env.HOST_PASSWORD || '';
  // a host session belongs to the current password: changing it (or HOST_PASSWORD) ends the old sessions
  const hostSub = async (s) => `host:${s.host?.hv || 0}${envPass ? `:${(await hmac(s.secret, `env:${envPass}`)).slice(0, 12)}` : ''}`;

  if (path === 'host/status' && !POST) {
    const s = await readState(store, now);
    return ok({ setup: !!(s.host || envPass), online: store.kind === 'blobs' });
  }
  if (path === 'host/setup' && POST) {
    if (envPass) no('The host password is set on the server. Use it to sign in.');
    const pass = String(body.password ?? '');
    if (pass.length < 6) no('Choose a password of at least 6 characters.');
    if ((await readState(store, now)).host) no('The host password has already been chosen. Sign in with it.');
    const salt = randomId(16); const hash = await pbkdf2(pass, salt);
    const { s } = await mutate(store, now, (s) => {
      if (s.host) no('The host password has already been chosen. Sign in with it.');
      s.host = { salt, hash, hv: 1 };
    });
    return ok({ token: await makeToken(s, await hostSub(s), now) });
  }
  if (path === 'host/login' && POST) {
    const pass = String(body.password ?? '');
    const s = await readState(store, now);
    if (!s.host && !envPass) no('No host password yet: choose one first.');
    const who = env.ip ? (await hmac(s.secret, `ip:${connectionOf(env.ip)}`)).slice(0, 16) : 'any';
    await takeTry(store, now, who);
    const good = envPass ? safeEqual(pass, envPass) : safeEqual(await pbkdf2(pass, s.host.salt), s.host.hash);
    if (!good) no('Wrong host password.');
    await editLock(store, (c) => { delete c[who]; }).catch(() => null);
    let s2 = s;
    if (envPass && !(s.host && safeEqual(await pbkdf2(envPass, s.host.salt), s.host.hash))) {
      // HOST_PASSWORD replaces a stored password for good: if HOST_PASSWORD is removed later,
      // this password still works and the old one (and its sessions) do not come back
      const salt = randomId(16); const hash = await pbkdf2(envPass, salt);
      s2 = (await mutate(store, now, async (x) => {
        if (x.host && safeEqual(await pbkdf2(envPass, x.host.salt), x.host.hash)) return NOCHANGE; // stored a moment ago
        // a different stored password: its sessions end; none stored: sessions made under
        // HOST_PASSWORD (host:0) carry on
        x.host = { salt, hash, hv: x.host ? (x.host.hv || 0) + 1 : 0 };
      })).s;
    }
    return ok({ token: await makeToken(s2, await hostSub(s2), now) });
  }

  const s = await readState(store, now);
  const sub = await readToken(s, token, now);
  if (!sub || sub !== await hostSub(s)) return denied('Please sign in as the host.');

  // ---- reading ----
  if (path === 'host/poll' && !POST) {
    const mk = market(s, now);
    return ok({
      now, game: gameDoc(s), mk: { ...mk, lv: levelsAt(s, mk.m), plan: planDoc(s, mk.m), base: Object.fromEntries(STOCKS.map((x) => [x.t, x.base])) },
      moves: moveLog(s),
      teams: s.teams.map((t) => hostTeamRow(s, t, now, mk.p)),
      standings: standings(s, now, mk.p),
      loans: s.loans.map((L) => ({ ...L, now: L.status === 'ongoing' ? accrued(L, now) : null })),
      updates: updatesDoc(s), uv: s.uv, gone: s.gone || [],
      env: !!envPass, storage: store.kind,
    });
  }
  if (path === 'host/team' && !POST) {
    const t = teamById(s, url.searchParams.get('id'));
    if (!t) no('That team was not found.');
    const mk = market(s, now);
    return ok({
      now, team: { ...hostTeamRow(s, t, now, mk.p), tr: t.tr.map(tradeDoc).reverse() },
      loans: s.loans.filter((L) => L.lender === t.id || L.borrower === t.id).map((L) => ({ ...L, now: L.status === 'ongoing' ? accrued(L, now) : null })),
      hist: teamHistory(s, t, now, url.searchParams.get('r') || '1d'),
    });
  }

  if (!POST) return json({ ok: false, error: 'Not found' }, 404);

  // ---- creating the game: its name and the teams ----
  if (path === 'host/game') {
    const name = clean(body.name, 60);
    await mutate(store, now, (s) => { s.game.name = name; });
    return ok({ name });
  }
  if (path === 'host/teams') {
    // One name per line. A line with a team's name keeps that team (and its code); a line
    // with a new name adds a team with a new code; a team without a line is removed, but
    // never one with members signed in, trades or loans. Renaming (keeping the code) is done
    // with host/team/rename, so no code can move to the wrong team.
    const names = checkNames(body.names);
    const { s: s2 } = await mutate(store, now, (s) => {
      if (s.game.phase === 'ended') no('The game is over. Start a new game (Tools) to change the teams.');
      const byName = new Map(s.teams.map((t) => [t.name.toLowerCase(), t]));
      const next = [];
      for (const n of names) {
        const t = byName.get(n.toLowerCase());
        if (t && t.name !== n) renameTeam(s, t, n); // only the capitals changed
        next.push(t || newTeam(s, n, now, next));
      }
      for (const t of s.teams) {
        if (next.includes(t)) continue;
        if (active(t).length) no(`Nothing was saved: “${t.name}” has members signed in, so the list does not remove it. Keep its line, or remove it with Remove in the list of codes. (To rename a team and keep its code, use Rename.)`);
        if (hasHistory(s, t)) no(`Nothing was saved: “${t.name}” has already traded or has a loan, so it cannot be removed. Keep its line.`);
        keepPeople(s, t, now);
      }
      s.teams = next;
    });
    return ok({ teams: s2.teams.map((t) => ({ id: t.id, name: t.name, code: t.code })) });
  }
  if (path === 'host/team/add') {
    const name = clean(body.name, 40);
    if (!name) no('Type the new team’s name.');
    const { out } = await mutate(store, now, (s) => {
      if (s.game.phase === 'ended') no('The game is over.');
      if (s.teams.length >= MAX_TEAMS) no(`At most ${MAX_TEAMS} teams.`);
      if (s.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) no('A team already has that name.');
      const t = newTeam(s, name, now);
      s.teams.push(t);
      return { id: t.id, name: t.name, code: t.code };
    });
    return ok({ team: out });
  }
  if (path === 'host/team/rename') {
    const name = clean(body.name, 40);
    if (!name) no('Type the team’s name.');
    await mutate(store, now, (s) => {
      const t = teamById(s, body.id);
      if (!t) no('That team was not found.');
      if (s.teams.some((x) => x !== t && x.name.toLowerCase() === name.toLowerCase())) no('Another team already has that name.');
      renameTeam(s, t, name);
    });
    return ok();
  }
  if (path === 'host/team/code') {
    const { out } = await mutate(store, now, (s) => {
      const t = teamById(s, body.id);
      if (!t) no('That team was not found.');
      t.code = newCode(s);
      t.cv = (t.cv || 0) + 1; // everyone signed in with the old code is signed out
      for (const m of active(t)) { m.out = now; m.why = 'code'; m.ss = []; }
      return t.code;
    });
    return ok({ code: out });
  }
  if (path === 'host/member/remove') {
    await mutate(store, now, (s) => {
      const t = teamById(s, body.team);
      if (!t) no('That team was not found.');
      const m = t.members.find((x) => x.id === body.member);
      if (!m) no('That member was not found.');
      if (m.out) return NOCHANGE;
      m.out = now; m.why = 'host'; m.sv = (m.sv || 0) + 1; m.ss = [];
    });
    return ok();
  }
  if (path === 'host/team/remove') {
    await mutate(store, now, (s) => {
      const t = teamById(s, body.id);
      if (!t) no('That team was not found.');
      if (hasHistory(s, t)) no(`“${t.name}” has already traded or has a loan, so it cannot be removed.`);
      keepPeople(s, t, now);
      s.teams = s.teams.filter((x) => x.id !== t.id);
    });
    return ok();
  }

  // ---- running the game ----
  const secsOf = (v) => { const x = Math.round(Number(v) || 0); if (x < 0 || x > 6 * 3600) no('Choose a session of at most 6 hours.'); return x; };
  if (path === 'host/start') {
    const secs = secsOf(body.secs);
    const { s: s2 } = await mutate(store, now, (s) => {
      if (s.game.phase !== 'lobby') no('The game has already started.');
      if (!s.teams.length) no('Create the teams first.');
      s.game.phase = 'live'; s.game.startedAt = now; s.game.revealed = false;
      s.clock = setRunning(s.clock, now, true);
      s.timer.endsAt = secs ? now + secs * 1000 : null;
    });
    return ok({ game: gameDoc(s2) });
  }
  if (path === 'host/market') {
    const open = !!body.open;
    const secs = open ? secsOf(body.secs) : 0;
    const { s: s2 } = await mutate(store, now, (s) => {
      if (s.game.phase !== 'live') no(s.game.phase === 'lobby' ? 'Start the game first.' : 'The game is over.');
      s.clock = setRunning(s.clock, now, open);
      s.timer.endsAt = open && secs ? now + secs * 1000 : null;
    });
    return ok({ open: isRunning(s2.clock), game: gameDoc(s2) });
  }
  if (path === 'host/timer') {
    const add = Math.round(Number(body.add) || 0);
    if (!add || Math.abs(add) > 3 * 3600) no('Choose how much time to add.');
    const { s: s2 } = await mutate(store, now, (s) => {
      if (!isRunning(s.clock)) no('The market is closed. Open it with a session length instead.');
      const base = s.timer.endsAt || now;
      s.timer.endsAt = Math.max(now + 5000, base + add * 1000);
    });
    return ok({ game: gameDoc(s2) });
  }
  if (path === 'host/end') {
    const { s: s2 } = await mutate(store, now, (s) => {
      if (s.game.phase !== 'live') no('The game is not running.');
      s.clock = setRunning(s.clock, now, false);
      s.timer.endsAt = null;
      // every loan still running is repaid now, with its full interest
      for (const L of s.loans.filter((x) => x.status === 'ongoing').sort((a, b) => a.due - b.due)) settleLoan(s, L, now);
      s.game.phase = 'ended'; s.game.endedAt = now; s.game.revealed = false;
    });
    return ok({ game: gameDoc(s2) });
  }
  if (path === 'host/reveal') {
    const show = body.show !== false;
    const { s: s2 } = await mutate(store, now, (s) => {
      if (s.game.phase !== 'ended') no('End the game first. Results are revealed only at the end.');
      s.game.revealed = show;
    });
    return ok({ game: gameDoc(s2) });
  }
  if (path === 'host/resume') {
    const { s: s2 } = await mutate(store, now, (s) => {
      if (s.game.phase !== 'ended') no('The game is not over.');
      s.game.phase = 'live'; s.game.revealed = false; s.game.endedAt = null;
    });
    return ok({ game: gameDoc(s2) });
  }
  if (path === 'host/move') {
    const t = String(body.t || '');
    if (!isTicker(t)) no('Unknown stock.');
    const mode = ['pct', 'price', 'base'].includes(body.mode) ? body.mode : null;
    if (!mode) no('Choose how to move the price.');
    const value = Number(String(body.value ?? '').replace(/[₹,%\s]/g, ''));
    if (mode !== 'base' && !Number.isFinite(value)) no('Type a number.');
    if (mode === 'pct' && (value <= -95 || value > 1000)) no('Choose a change between −95% and +1000%.');
    if (mode === 'price' && value <= 0) no('Type a price above zero.');
    const secs = Math.round(Number(body.secs) || 0);
    if (secs < 0 || secs > 7200) no('Choose a time between instant and 2 hours.');
    const { out } = await mutate(store, now, (s) => {
      if (s.game.phase === 'ended') no('The game is over and its prices are final. Take the game back (Game tab) to move prices again.');
      const m = marketTime(s.clock, now);
      const closed = !isRunning(s.clock);
      const list = (s.moves[t] ||= []);
      let start; let from; let basis; let after = 0;
      if (closed) {
        // Prices stand still while closed. The moves made in this break wait for the opening
        // bell and play one after another from it, each starting where the one before ends
        // (an instant move made just before the market closed, not in effect yet, waits too).
        // Anything left from before the break, such as a gradual move still running or the
        // rest of an earlier break's moves, is replaced, from where the stock stands.
        const closedAt = s.clock.at(-1)[0];
        const waits = (x) => (x[8] === 1 ? x[4] >= closedAt : moveStart(x) > m);
        const pending = []; for (let i = list.length - 1; i >= 0 && waits(list[i]); i--) pending.unshift(list[i]);
        const last = pending.at(-1);
        start = last ? moveEnd(last) : m;
        from = basis = last ? last[2] : levelAt(list, m);
        after = pending.length;
      } else {
        // While open a move starts now and replaces anything still waiting. If the move
        // before it has not changed the price yet (made less than a second ago), the new one
        // builds on it, so quick clicks add up: an instant move then still happens first, and
        // a gradual one starts from it.
        const prev = list.at(-1);
        const fresh = prev && prev[8] !== 1 && (prev[3] === 0 ? moveStart(prev) > m : Math.floor(m / 1000) * 1000 <= prev[0]);
        start = m; from = levelAt(list, m); basis = fresh ? prev[2] : from;
        if (fresh && secs) {
          if (prev[3] === 0) { start = moveStart(prev); from = prev[2]; } else { start = Math.max(m, prev[0]); from = prev[1]; }
        }
      }
      let to = mode === 'pct' ? basis * (1 + value / 100) : mode === 'price' ? (value * 100) / BY_T[t].base : 1;
      to = Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, to));
      const label = mode === 'pct' ? `${value > 0 ? '+' : ''}${value}%` : mode === 'price' ? `to ₹${value}` : 'back to listed price';
      // an instant move while closed takes effect 1 ms after its start (dur 1): at the bell,
      // or right after the move before it
      const dur = closed && !secs ? 1 : secs * 1000;
      // [start (market time), level from, level to, ms, wall time, label, 1 if instant and
      //  made while closed, level it built on, 1 if made while closed]
      const x = [start, from, to, dur, now, label, closed && !secs ? 1 : 0, basis, closed ? 1 : 0];
      list.push(x);
      // wait: how long after the opening bell (while closed) or after now (while open) it starts
      return { t, from: basis, to, secs, label, atOpen: closed, after, wait: Math.max(0, moveStart(x) - m) };
    });
    return ok({ move: out });
  }
  if (path === 'host/move/cancel' && POST) {
    const t = String(body.t || '');
    if (!isTicker(t)) no('Unknown stock.');
    const { out } = await mutate(store, now, (s) => {
      if (s.game.phase === 'ended') no('The game is over and its prices are final.');
      const m = marketTime(s.clock, now);
      const list = s.moves[t] || [];
      const keep = list.filter((x) => !cancellable(s, x, m));
      if (keep.length === list.length) return NOCHANGE;
      s.moves[t] = keep;
      return { n: list.length - keep.length };
    });
    return ok({ t, n: out?.n || 0 });
  }

  // ---- loans between teams ----
  if (path === 'host/loan') {
    const amount = rupeesToPaise(body.amount);
    const rate = Number(body.rate);
    const mins = Number(body.mins);
    if (!Number.isFinite(amount) || amount < 100) no('Type a loan amount of at least ₹1.');
    if (!Number.isFinite(rate) || rate < 0 || rate > 1000) no('Type an interest rate between 0% and 1000%.');
    if (!Number.isFinite(mins) || mins < 0.1 || mins > 30 * 24 * 60) no('Choose a deadline between 6 seconds (0.1 min) and 30 days.');
    const rid = ridOf(body);
    let again = null;
    const { out } = await mutate(store, now, (s) => {
      const id = doneBefore(s.hostDone, rid);
      again = id ? s.loans.find((x) => x.id === id) || null : null;
      if (again) return NOCHANGE;
      if (s.game.phase === 'ended') no('The game is over.');
      const l = teamById(s, body.lender); const b = teamById(s, body.borrower);
      if (!l || !b) no('Choose both the lending team and the borrowing team.');
      if (l.id === b.id) no('The lender and the borrower must be different teams.');
      if (l.cash < amount) no(`${l.name} has only ₹${(l.cash / 100).toFixed(2)} in cash, less than the loan.`);
      s.n.loan += 1;
      const L = {
        id: `L${s.n.loan}`, n: s.n.loan, lender: l.id, borrower: b.id, lenderName: l.name, borrowerName: b.name,
        amount, rate, final: Math.round(amount * (1 + rate / 100)), start: now, due: now + Math.round(mins * 60000), mins,
        status: 'ongoing', settledAt: null, cancelledAt: null, sold: [], short: 0,
      };
      l.cash -= amount; b.cash += amount;
      s.loans.push(L);
      s.hostDone = remember(s.hostDone, rid, L.id);
      return L;
    });
    return ok({ loan: again || out, again: !!again });
  }
  if (path === 'host/loan/cancel') {
    await mutate(store, now, (s) => {
      const L = s.loans.find((x) => x.id === body.id);
      if (!L) no('That loan was not found.');
      if (L.status !== 'ongoing') no('Only an ongoing loan can be cancelled.');
      const l = teamById(s, L.lender); const b = teamById(s, L.borrower);
      // the borrower gives the amount back; if it has spent it, shares are sold to cover it
      L.sold = b ? cover(s, b, L.amount, now) : [];
      if (b) b.cash -= L.amount;
      if (l) l.cash += L.amount;
      L.short = b && b.cash < 0 ? -b.cash : 0;
      L.status = 'cancelled'; L.cancelledAt = now;
    });
    return ok();
  }

  // ---- updates ----
  if (path === 'host/update') {
    const text = cleanText(body.text, 4000);
    if (!text) no('Type the update first.');
    const rid = ridOf(body);
    let again = null;
    const { out } = await mutate(store, now, (s) => {
      const id = doneBefore(s.hostDone, rid);
      again = id ? s.updates.find((x) => x.id === id) || null : null;
      if (again) return NOCHANGE;
      s.n.update += 1;
      const x = { id: `U${s.n.update}`, n: s.n.update, text, at: now };
      s.updates.push(x); s.uv += 1;
      s.hostDone = remember(s.hostDone, rid, x.id);
      return x;
    });
    return ok({ update: again || out, again: !!again });
  }
  if (path === 'host/update/edit') {
    const text = cleanText(body.text, 4000);
    if (!text) no('An update cannot be empty.');
    await mutate(store, now, (s) => {
      const x = s.updates.find((u) => u.id === body.id);
      if (!x) no('That update was not found.');
      x.text = text; x.ed = now; s.uv += 1;
    });
    return ok();
  }
  if (path === 'host/update/delete') {
    await mutate(store, now, (s) => {
      const i = s.updates.findIndex((u) => u.id === body.id);
      if (i < 0) no('That update was not found.');
      s.updates.splice(i, 1); s.uv += 1;
    });
    return ok();
  }

  // ---- tools ----
  if (path === 'host/password') {
    if (envPass) no('The host password is set on the server (HOST_PASSWORD); change it there.');
    const pass = String(body.password ?? '');
    if (pass.length < 6) no('Choose a password of at least 6 characters.');
    if (!s.host || !safeEqual(await pbkdf2(String(body.old ?? ''), s.host.salt), s.host.hash)) no('The current password is wrong.');
    const salt = randomId(16); const hash = await pbkdf2(pass, salt);
    const { s: s2 } = await mutate(store, now, (s) => { s.host = { salt, hash, hv: (s.host?.hv || 1) + 1 }; });
    return ok({ token: await makeToken(s2, await hostSub(s2), now) });
  }
  if (path === 'host/reset') {
    if (body.confirm !== 'RESET') no('Type RESET to confirm.');
    const keepTeams = body.mode !== 'everything';
    const { s: s2 } = await mutate(store, now, (s) => {
      const teams = keepTeams ? s.teams.map((t) => freshFund(t, now)) : null;
      const next = freshState(now, { host: s.host, secret: keepTeams ? s.secret : null, teams, gone: keepTeams ? s.gone : null, n: keepTeams ? s.n : null, name: keepTeams ? s.game.name : '', uv: (s.uv || 0) + 1 });
      next.recent = s.recent || [];
      Object.keys(s).forEach((k) => delete s[k]);
      Object.assign(s, next);
    });
    return ok({ token: await makeToken(s2, await hostSub(s2), now) });
  }
  return json({ ok: false, error: 'Not found' }, 404);
}
