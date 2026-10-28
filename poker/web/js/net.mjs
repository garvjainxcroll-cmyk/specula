// Talking to the server: requests (with the sign-in token), server-time sync, offline
// detection, the signed-in player ("session"), and live tables — pushed instantly when the
// server supports it (Server-Sent Events), otherwise polled about once a second.
import { store, sstore } from './ui.mjs';

export const net = { mode: 'unknown', online: true, offset: 0, stream: false, now: () => Date.now() + net.offset };
const netListeners = new Set();
export function onNet(fn) { netListeners.add(fn); return () => netListeners.delete(fn); }
function emitNet() { for (const fn of netListeners) { try { fn(net); } catch (e) { console.warn(e); } } }
function setOnline(v) { if (net.online !== v) { net.online = v; emitNet(); } }

let token = store('artha-token');
let hostToken = sstore('artha-host');
export const auth = {
  get token() { return token; },
  set(t) { token = t; store('artha-token', t); },
  clear() { token = null; store('artha-token', null); session.me = null; emitSession(); },
  get host() { return hostToken; },
  setHost(t) { hostToken = t; sstore('artha-host', t); },
  clearHost() { hostToken = null; sstore('artha-host', null); },
};

async function raw(method, path, body, { timeout = 9000, host = false } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const headers = {};
    if (body) headers['content-type'] = 'application/json';
    const tok = host ? hostToken : token;
    if (tok) headers.authorization = `Bearer ${tok}`;
    const res = await fetch(`/api/${path}`, { method, signal: ctl.signal, cache: 'no-store', headers, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (res.status === 404 && !data) { const e = new Error('not-found'); e.status = 404; throw e; }
    if (res.status >= 500 && !data) { const e = new Error('server'); e.status = res.status; throw e; }
    if (data && typeof data.now === 'number') net.offset = data.now - Date.now();
    setOnline(true);
    if (res.status === 401 && !host && token && data?.code === 'signed-out') auth.clear();
    if (res.status === 401 && host) auth.clearHost();
    return { status: res.status, ...(data || {}) };
  } catch (e) {
    if (e.name === 'AbortError' || e instanceof TypeError || e.message === 'server') setOnline(false);
    throw e;
  } finally { clearTimeout(t); }
}
export const get = (path, opts) => raw('GET', path, null, opts);
export async function post(path, body = {}, { retries = 1, host = false } = {}) {
  let last;
  for (let k = 0; k <= retries; k++) {
    try { return await raw('POST', path, body, { host }); } catch (e) { last = e; if (e.status === 404) throw e; await new Promise((r) => setTimeout(r, 350 * (k + 1))); }
  }
  throw last;
}
/** post() that never throws: network trouble becomes { ok:false, error }. */
export async function send(path, body, opts) {
  try { return await post(path, body, opts); } catch { return { ok: false, error: 'No connection — try again in a moment', offline: true }; }
}

/** Is the live game server here? */
export async function detect() {
  try {
    const r = await raw('GET', 'health', null, { timeout: 6000 });
    net.mode = r.ok && r.app === 'artha' ? 'live' : 'single';
    net.stream = !!r.stream;
  } catch (e) {
    net.mode = e.status === 404 ? 'single' : (net.mode === 'live' ? 'live' : 'unknown');
    if (net.mode === 'unknown') setTimeout(() => { if (net.mode === 'unknown') detect(); }, 4000);
  }
  emitNet();
  return net.mode;
}

// ---------------- the signed-in player ----------------

export const session = { me: null, loaded: false };
const sessListeners = new Set();
export function onSession(fn) { sessListeners.add(fn); return () => sessListeners.delete(fn); }
function emitSession() { for (const fn of sessListeners) { try { fn(session); } catch (e) { console.warn(e); } } }
export async function refreshMe() {
  if (!token) { session.me = null; session.loaded = true; emitSession(); return null; }
  try {
    const r = await get('me');
    session.me = r.ok ? r.me : null;
  } catch { /* offline: keep what we have */ }
  session.loaded = true;
  emitSession();
  return session.me;
}
export function setMe(me) { session.me = me; session.loaded = true; emitSession(); }

// ---------------- live tables ----------------

/**
 * Follow a room. ref: { id } or { code }. onView(view) is called with every new view.
 * Returns a connection with the player's actions on it; each action's reply carries the
 * new view, which is shown at once.
 */
export function remoteRoom(ref, onView, { host = false, screen = false, onError = null } = {}) {
  let stopped = false; let v = 0; let id = ref.id || null; const code = ref.code || null;
  let es = null; let esFails = 0; let timer = null; let inflight = false; let again = false; let last = null;
  let readyResolve; const ready = new Promise((r) => { readyResolve = r; });
  const show = (view) => { if (stopped || !view) return; if (last && view.v < last.v) return; v = view.v; id = view.id; last = view; readyResolve(view); if (net.stream && !es && !stopped) openStream(); onView(view); };
  async function fetchNow() {
    if (stopped) return;
    if (inflight) { again = true; return; }
    inflight = true;
    try {
      const q = id ? `id=${encodeURIComponent(id)}` : `code=${encodeURIComponent(code)}`;
      const r = await get(`room?${q}&v=${last ? v : 0}`, { host });
      if (r.ok && r.view) show(r.view);
      else if (!r.ok && onError) onError(r);
    } catch { /* offline: the banner says so */ } finally {
      inflight = false;
      if (again) { again = false; fetchNow(); }
    }
  }
  function interval() {
    if (document.hidden) return 5000;
    if (es) return 8000;
    if (screen) return 1500;
    const mine = last?.you;
    const live = last?.tables?.some((t) => t.hand && t.hand.status === 'betting');
    return mine && live ? 900 : live ? 1500 : 2500;
  }
  function loop() { clearTimeout(timer); if (stopped) return; timer = setTimeout(async () => { await fetchNow(); loop(); }, interval()); }
  function openStream() {
    if (!window.EventSource || esFails > 3) return;
    es = new EventSource(`/api/stream?id=${encodeURIComponent(id)}`);
    es.onmessage = (e) => { try { const d = JSON.parse(e.data); if (d.v !== v) fetchNow(); } catch { /* ignore */ } };
    es.onerror = () => { esFails++; if (es) es.close(); es = null; if (!stopped) setTimeout(() => { if (!stopped && !es) openStream(); }, 3000); };
  }
  const vis = () => { if (!document.hidden) fetchNow(); };
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('online', vis);
  fetchNow().then(loop);

  const call = async (path, body = {}) => {
    await ready;
    const r = await send(path, { id, ...body }, { host });
    if (r.view) show(r.view);
    return r;
  };
  return {
    local: false,
    get id() { return id; },
    get view() { return last; },
    ready,
    refresh: fetchNow,
    stop() { stopped = true; clearTimeout(timer); if (es) es.close(); es = null; document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', vis); },
    act: (handId, seq, type, to) => call('room/act', { handId, seq, type, to }),
    sit: (seat, buyIn, table = 0) => call('room/sit', { seat, buyIn, table }),
    leave: () => call('room/leave'),
    sitOut: (on) => call('room/sitout', { on }),
    topUp: (amount) => call('room/topup', { amount }),
    show: () => call('room/show'),
    autoMuck: (on) => call('room/automuck', { on }),
    register: () => call('room/register'),
    unregister: () => call('room/unregister'),
    manage: (op, args = {}) => call('room/manage', { op, ...args }),
  };
}

/** Clock left until a server time, in ms. */
export const left = (at) => (at === null || at === undefined ? null : Math.max(0, at - net.now()));
