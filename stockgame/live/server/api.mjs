// The live stock game server. Runs in the Netlify function (live/netlify/functions/api.mjs)
// and, for tests and the local dev server, against an in-memory store with the same interface.
//
// Rules (tested in tests/stockgame-live.test.mjs):
//  - The game (every headline, story and price move) ships sealed in game-sealed.mjs. The
//    Event Head unlocks it once with the game key; that key is also the Event Head's sign-in.
//  - Public reads (poll, news) hold only what has been released: stories up to the latest
//    news, price moves up to the latest price step. Nothing about other teams' money, except
//    the standings the Event Head chooses to reveal on the big screen.
//  - A team joins with the join PIN and a name, and gets a team code to sign in on more devices.
//  - Orders are accepted only while the trading window is open and only at the prices the
//    team is looking at (state.p); a price move closes the window.
//  - Only the Event Head (game key) releases news, moves prices, runs the timer, removes teams
//    and reveals standings.
import { pricePaths, newBook, placeOrder, cancelOrder, onPriceStep, bookValue, DEFAULT_MARGIN, ALPHABET } from '../../src/engine.mjs';
import SEALED from './game-sealed.mjs';
import { openSealed, normaliseKey } from './sealing.mjs';

const enc = new TextEncoder();
const GRACE_MS = 1500;
const MAX_TEAMS = 80;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
const fail = (status, error) => json({ ok: false, error }, status);
// A refusal (closed market, wrong PIN, not enough cash…) is a normal answer, sent with 200.
const refuse = (code, error, extra = {}) => json({ ok: false, refused: true, code, error, ...extra });

const b64u = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64url');
async function sha256(s) { return b64u(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
function randomId(n = 10, alphabet = 'abcdefghijkmnpqrstuvwxyz23456789') {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(a, (x) => alphabet[x % alphabet.length]).join('');
}
const newPin = () => String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000));
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const nowSec = () => Math.floor(Date.now() / 1000);

// ---------- the sealed game ----------
let SEALED_GAME = SEALED;
export function useSealed(s) { SEALED_GAME = s; gameCache = null; cfgCache = null; } // tests only

// ---------- storage ----------
async function getJ(store, key) { return (await store.get(key)) ?? null; }
async function update(store, key, fn, { tries = 10 } = {}) {
  for (let k = 0; k < tries; k++) {
    const cur = await store.getMeta(key);
    const next = await fn(cur ? structuredClone(cur.data) : null);
    if (next === undefined) return cur ? cur.data : null;
    const res = cur ? await store.set(key, next, { onlyIfMatch: cur.etag }) : await store.set(key, next, { onlyIfNew: true });
    if (res.modified) return next;
    await new Promise((r) => setTimeout(r, 10 + Math.random() * 30 * (k + 1)));
  }
  throw new Error('The server is busy. Try again.');
}
let gameCache = null;
async function getGame(store) {
  if (!gameCache) gameCache = await getJ(store, 'game');
  return gameCache;
}

function freshState(game) {
  return {
    v: 1, a: 0, p: 0, log: [], mode: 'update', autoTimer: true,
    timer: { dur: 240000, endsAt: null, left: 240000 },
    joinOpen: true, pin: newPin(), teams: [], show: 'market', reveal: 0, board: null,
    stocks: game.stocks.map(({ t, name, sector, start }) => ({ t, name, sector, start })),
    moves: [], capital: game.capital, margin: game.margin ?? DEFAULT_MARGIN,
  };
}
const isOpen = (s) => !!s.timer.endsAt && Date.now() <= s.timer.endsAt + GRACE_MS;
const pathsOf = (s) => pricePaths(s.stocks, s.moves);

function publicState(s) {
  const last = s.log[s.log.length - 1] || null;
  const batch = last ? s.log.filter((e) => e.batch === last.batch && e.kind === last.kind).map((e) => e.i) : [];
  return {
    v: s.v, a: s.a, p: s.p, timer: s.timer, open: isOpen(s), joinOpen: s.joinOpen, pin: s.pin,
    teams: s.teams.length, stocks: s.stocks, moves: s.moves, capital: s.capital, margin: s.margin,
    show: s.show, last: last ? { kind: last.kind, at: last.at, from: Math.min(...batch), to: Math.max(...batch) } : null,
    board: s.show === 'leaders' && s.board ? hideUnrevealed(s.board, s.reveal) : null,
  };
}
// Standings on the big screen are revealed from last place up; unrevealed rows carry no name or value.
function hideUnrevealed(board, reveal) {
  const n = board.length;
  return board.map((r, j) => (j >= n - reveal ? r : { rank: r.rank, hidden: true }));
}

// ---------- teams ----------
let cfgCache = null; // the config never changes once made, so each server instance reads it once
async function getConfig(store) {
  if (!cfgCache) cfgCache = await getJ(store, 'config');
  return cfgCache;
}
async function teamFromToken(store, token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [id, sig] = token.split('.');
  const cfg = await getConfig(store);
  if (!cfg?.hmacKey || !safeEqual(sig, await hmac(cfg.hmacKey, id))) return null;
  return id;
}
async function tokenFor(store, id) {
  const cfg = await getConfig(store);
  return `${id}.${await hmac(cfg.hmacKey, id)}`;
}
// Bring a team's book up to the latest price step: open orders fill at each step's price.
function catchUp(team, state, paths) {
  let changed = false;
  while (team.pDone < state.p) {
    const q = ++team.pDone;
    onPriceStep(team.book, (k) => paths[k][q], q, nowSec());
    changed = true;
  }
  return changed;
}
async function loadTeam(store, id, state) {
  const paths = pathsOf(state);
  let t = await getJ(store, `team/${id}`);
  if (t && t.pDone < state.p) t = await update(store, `team/${id}`, (cur) => (cur && catchUp(cur, state, paths) ? cur : undefined));
  return t;
}
const teamView = (t) => ({ id: t.id, name: t.name, code: t.code, book: t.book });

// ---------- handler ----------
export async function handle(request, store) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/^\.netlify\/functions\/api\/?/, '');
  try {
    if (request.method === 'GET') {
      if (path === 'health') return json({ ok: true, storage: store.kind || 'blobs', now: Date.now(), unlocked: !!(await getJ(store, 'config')) });
      if (path === 'poll') return await poll(store, url);
      if (path === 'news') return await news(store, url);
      return fail(404, 'Not found');
    }
    if (request.method !== 'POST') return fail(405, 'Method not allowed');
    let body;
    try { body = await request.json(); } catch { return fail(400, 'Bad request'); }
    if (path === 'join') return await join(store, body);
    if (path === 'signin') return await signin(store, body);
    if (path === 'order') return await order(store, body);
    if (path === 'cancel') return await cancel(store, body);
    if (path === 'admin') return await admin(store, body);
    return fail(404, 'Not found');
  } catch (e) {
    return fail(500, e.message || 'Server error');
  }
}

async function poll(store, url) {
  const state = await getJ(store, 'state');
  if (!state) return json({ ok: true, now: Date.now(), state: null });
  const out = { ok: true, now: Date.now(), state: publicState(state) };
  const token = url.searchParams.get('token');
  if (token) {
    const id = await teamFromToken(store, token);
    const t = id && (await loadTeam(store, id, state));
    if (!t) return refuse(401, 'This device is not signed in to a team any more. Join again, or sign in with your team code.', { now: out.now, state: out.state });
    out.me = teamView(t);
  }
  return json(out);
}

async function news(store, url) {
  const from = Math.max(0, Number(url.searchParams.get('from')) || 0);
  const all = (await getJ(store, 'pub/news')) || [];
  return json({ ok: true, news: all.filter((n) => n.i > from) });
}

async function join(store, body) {
  const name = String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const pin = String(body.pin || '').replace(/\D/g, '');
  const state = await getJ(store, 'state');
  if (!state) return refuse(409, 'The market is not open yet. Wait for the Event Head to start it.');
  if (!state.joinOpen) return refuse(403, 'Joining is closed. Ask the Event Head.');
  if (!safeEqual(pin, state.pin)) return refuse(403, 'That join PIN is wrong. Check the big screen.');
  if (name.length < 2) return refuse(400, 'Type a team name of at least two characters.');
  const id = randomId(10);
  const code = randomId(6, ALPHABET);
  let why = null;
  await update(store, 'state', (s) => {
    why = null;
    if (s.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) { why = 'That team name is taken. If it is your team, use "I have a team code".'; return undefined; }
    if (s.teams.length >= MAX_TEAMS) { why = 'The market is full.'; return undefined; }
    s.teams.push({ id, name, at: Date.now() });
    s.v++;
    return s;
  });
  if (why) return refuse(409, why);
  const book = newBook(state.capital, state.margin);
  const team = { id, name, code, book, pDone: state.p, at: Date.now() };
  await store.set(`team/${id}`, team);
  await store.set(`code/${code}`, { id });
  return json({ ok: true, token: await tokenFor(store, id), me: teamView(team) });
}

async function signin(store, body) {
  const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ref = code.length === 6 ? await getJ(store, `code/${code}`) : null;
  const t = ref && (await getJ(store, `team/${ref.id}`));
  if (!t) return refuse(403, 'That team code is not recognised. It is on the Funds page of a device already signed in.');
  return json({ ok: true, token: await tokenFor(store, t.id), me: teamView(t) });
}

async function order(store, body) {
  const id = await teamFromToken(store, body.token);
  if (!id) return refuse(401, 'Sign in to your team first.');
  const state = await getJ(store, 'state');
  if (!isOpen(state)) return refuse(423, 'The market is closed. Orders open when the Event Head starts the trading window.');
  if (Number(body.p) !== state.p) return refuse(409, 'Prices have just moved. Check the new price and place the order again.', { state: publicState(state) });
  const k = Number(body.k);
  if (!(k >= 0 && k < state.stocks.length)) return refuse(400, 'Pick a stock.');
  const paths = pathsOf(state);
  const ltpOf = (j) => paths[j][state.p];
  let res = null;
  const t = await update(store, `team/${id}`, (cur) => {
    if (!cur) return undefined;
    catchUp(cur, state, paths);
    res = placeOrder(cur.book, { k, side: body.side, type: body.type, qty: body.qty, limit: body.limit, trigger: body.trigger }, ltpOf, state.p, nowSec());
    return res.ok ? cur : undefined;
  });
  if (!t) return refuse(401, 'Your team was removed by the Event Head.');
  if (!res.ok) return refuse(400, res.msg);
  return json({ ok: true, order: res.order, me: teamView(t) });
}

async function cancel(store, body) {
  const id = await teamFromToken(store, body.token);
  if (!id) return refuse(401, 'Sign in to your team first.');
  let done = false;
  const t = await update(store, `team/${id}`, (cur) => {
    done = !!cur && cancelOrder(cur.book, Number(body.id));
    return done ? cur : undefined;
  });
  if (!done) return refuse(400, 'That order is no longer open.', t ? { me: teamView(t) } : {});
  return json({ ok: true, me: teamView(t) });
}

// ---------- the Event Head ----------
async function adminOk(store, key) {
  const cfg = await getConfig(store);
  if (!cfg) return null;
  return safeEqual(await sha256(cfg.salt + normaliseKey(key)), cfg.adminHash) ? cfg : null;
}

async function standings(store, state) {
  const paths = pathsOf(state);
  const rows = [];
  await Promise.all(state.teams.map(async (tm) => {
    const t = await loadTeam(store, tm.id, state);
    if (!t) return;
    const v = bookValue(t.book, (k) => paths[k][state.p]);
    const shorts = Object.values(t.book.holdings).filter((h) => h.qty < 0).length;
    rows.push({ id: t.id, name: t.name, code: t.code, value: v.total, ret: v.total / t.book.capital - 1, cash: t.book.cash, longValue: v.longValue, shortValue: v.shortValue, trades: t.book.trades.length, shorts, open: t.book.orders.filter((o) => o.status === 'OPEN').length });
  }));
  rows.sort((x, y) => y.value - x.value || x.name.localeCompare(y.name));
  rows.forEach((r, j) => { r.rank = j + 1; });
  return rows;
}

async function admin(store, body) {
  const action = String(body.action || '');
  if (action === 'login') {
    // Whoever can open the sealed game is the Event Head. The opened game is kept on the server;
    // after a redeploy with a newly sealed game, the next sign-in replaces it.
    const sealedId = SEALED_GAME.ct.slice(0, 40);
    let cfg = await getConfig(store);
    if (!cfg || cfg.sealedId !== sealedId || !(await adminOk(store, body.key))) {
      const game = await openSealed(body.key, SEALED_GAME);
      if (!game) return refuse(403, 'That game key is wrong.');
      const salt = cfg?.salt || randomId(16);
      cfg = { salt, adminHash: await sha256(salt + normaliseKey(body.key)), hmacKey: cfg?.hmacKey || randomId(32), sealedId };
      await store.set('game', game);
      gameCache = game;
      await store.set('config', cfg);
      cfgCache = cfg;
      await update(store, 'state', (s) => s || freshState(game));
    }
    const state = await getJ(store, 'state');
    return json({ ok: true, game: await getGame(store), state, now: Date.now() });
  }
  if (!(await adminOk(store, body.key))) return refuse(403, 'Sign in again with the game key.');
  const game = await getGame(store);

  if (action === 'state') {
    const state = await getJ(store, 'state');
    return json({ ok: true, state, now: Date.now(), standings: body.withTeams ? await standings(store, state) : null });
  }
  if (action === 'export') {
    const state = await getJ(store, 'state');
    const teams = await Promise.all(state.teams.map((t) => loadTeam(store, t.id, state)));
    return json({ ok: true, exportedAt: new Date().toISOString(), state, teams });
  }
  if (action === 'reset') {
    if (body.confirm !== 'RESET') return refuse(400, 'Type RESET to confirm.');
    for (const k of [...(await store.list('team/')), ...(await store.list('code/'))]) await store.del(k);
    await store.del('pub/news');
    await update(store, 'state', () => freshState(game));
    return json({ ok: true, state: await getJ(store, 'state'), now: Date.now() });
  }
  if (action === 'remove') {
    const id = String(body.id || '');
    const t = await getJ(store, `team/${id}`);
    await update(store, 'state', (s) => { s.teams = s.teams.filter((x) => x.id !== id); s.v++; return s; });
    if (t) { await store.del(`team/${id}`); await store.del(`code/${t.code}`); }
    return json({ ok: true, state: await getJ(store, 'state'), now: Date.now() });
  }

  let refusal = null;
  let newsAdd = null;
  const state = await update(store, 'state', async (s) => {
    refusal = null; newsAdd = null;
    const at = Date.now();
    if (action === 'step') {
      const kind = body.kind === 'P' ? 'P' : 'N';
      const from = Number(body.from), to = Number(body.to);
      if (kind === 'N') {
        if (from !== s.a + 1 || to < from || to > game.updates.length) { refusal = `The next story to release is update ${s.a + 1}.`; return undefined; }
        for (let i = from; i <= to; i++) s.log.push({ kind, i, at, batch: at });
        s.a = to;
        newsAdd = game.updates.slice(from - 1, to).map((u) => ({ i: u.i, r: u.round, cat: u.cat, head: u.head, body: u.body }));
        if (s.autoTimer) s.timer = { ...s.timer, endsAt: at + s.timer.dur, left: s.timer.dur };
      } else {
        if (from !== s.p + 1 || to < from || to > s.a) { refusal = s.p >= s.a ? 'Release the news first; prices move after their story is out.' : `The next price move is update ${s.p + 1}.`; return undefined; }
        const tk = s.stocks.map((x) => x.t);
        for (let i = from; i <= to; i++) {
          s.log.push({ kind, i, at, batch: at });
          s.moves.push(game.updates[i - 1].moves.map((m) => [tk.indexOf(m.t), m.pct]));
        }
        s.p = to;
        // moving prices closes the trading window, so nobody trades at the old prices afterwards
        if (s.timer.endsAt) s.timer = { ...s.timer, left: Math.max(0, s.timer.endsAt - at), endsAt: null };
      }
    } else if (action === 'undo') {
      const last = s.log[s.log.length - 1];
      if (!last || last.kind !== 'N') { refusal = 'Only a news release can be undone. Price moves stay, because orders have filled at them.'; return undefined; }
      const batch = s.log.filter((e) => e.batch === last.batch && e.kind === 'N');
      s.log = s.log.filter((e) => !(e.batch === last.batch && e.kind === 'N'));
      s.a = Math.min(...batch.map((e) => e.i)) - 1;
      newsAdd = 'trim';
    } else if (action === 'timer') {
      const t = s.timer, op = body.op;
      if (op === 'dur') { t.dur = Math.max(30, Math.min(1800, Number(body.seconds) || 240)) * 1000; if (!t.endsAt) t.left = t.dur; }
      else if (op === 'start') { t.endsAt = at + t.dur; t.left = t.dur; }
      else if (op === 'resume') { if (!t.endsAt && t.left > 0) t.endsAt = at + t.left; }
      else if (op === 'pause') { if (t.endsAt) { t.left = Math.max(0, t.endsAt - at); t.endsAt = null; } }
      else if (op === 'stop') { t.endsAt = null; t.left = 0; }
      else if (op === 'add') { if (t.endsAt) t.endsAt = Math.max(at, t.endsAt) + 30000; else t.left += 30000; }
    } else if (action === 'settings') {
      if ('mode' in body) s.mode = body.mode === 'round' ? 'round' : 'update';
      if ('autoTimer' in body) s.autoTimer = !!body.autoTimer;
      if ('joinOpen' in body) s.joinOpen = !!body.joinOpen;
      if (body.newPin) s.pin = newPin();
      if ('capital' in body || 'margin' in body) {
        if (s.teams.length) { refusal = 'Starting money and margin can only change before any team joins.'; return undefined; }
        if ('capital' in body) s.capital = Math.max(1000, Math.min(1e9, Math.round(Number(body.capital) || s.capital)));
        if ('margin' in body) s.margin = Math.max(0.2, Math.min(3, Number(body.margin) || s.margin));
      }
    } else if (action === 'show') {
      s.show = body.show === 'leaders' ? 'leaders' : 'market';
      if ('reveal' in body) s.reveal = Math.max(0, Number(body.reveal) || 0);
    } else {
      refusal = 'Unknown action.';
      return undefined;
    }
    s.v++;
    return s;
  });
  if (refusal) return refuse(400, refusal);
  if (newsAdd) {
    await update(store, 'pub/news', (cur) => {
      const list = cur || [];
      if (newsAdd === 'trim') return list.filter((n) => n.i <= state.a);
      const have = new Set(list.map((n) => n.i));
      return list.concat(newsAdd.filter((n) => !have.has(n.i)));
    });
  }
  // standings for the big screen are taken when the Event Head shows or reveals them
  if (action === 'show' && state.show === 'leaders') {
    const rows = await standings(store, state);
    const board = rows.map(({ rank, name, value, ret }) => ({ rank, name, value, ret }));
    await update(store, 'state', (s) => { s.board = board; s.reveal = Math.min(s.reveal, board.length); s.v++; return s; });
  }
  return json({ ok: true, state: await getJ(store, 'state'), now: Date.now() });
}
