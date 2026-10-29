// Talking to the control server. The sign-in token lives in this browser tab only
// (sessionStorage); every request carries it, and the server checks it every time.

const KEY = 'jaco-r4-token';
const SKEY = 'jaco-r4-session';
let token = null;
try { token = sessionStorage.getItem(KEY); } catch { token = null; }
const listeners = new Set();
export const net = { online: true };
export const onNet = (fn) => listeners.add(fn);
const setOnline = (v) => { if (net.online !== v) { net.online = v; for (const fn of listeners) fn(v); } };

export const auth = {
  get token() { return token; },
  set(t) { token = t; try { if (t) sessionStorage.setItem(KEY, t); else sessionStorage.removeItem(KEY); } catch { /* private mode */ } },
  get session() { try { return localStorage.getItem(SKEY); } catch { return null; } },
  setSession(id) { try { if (id) localStorage.setItem(SKEY, id); else localStorage.removeItem(SKEY); } catch { /* ignore */ } },
};

export class Refused extends Error { constructor(data, status) { super(data?.error || 'Refused'); this.code = data?.code; this.details = data?.details; this.status = status; this.data = data; } }
let onSignedOut = () => {};
export const whenSignedOut = (fn) => { onSignedOut = fn; };

async function request(method, path, body, { timeout = 30000, raw = false } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  let res;
  try {
    res = await fetch(`/api/${path}`, { method, signal: ctl.signal, cache: 'no-store', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    setOnline(false);
    throw new Refused({ code: 'OFFLINE', error: 'The control server cannot be reached. Check the connection; nothing was changed.' }, 0);
  } finally { clearTimeout(t); }
  setOnline(true);
  if (raw && res.ok && !(res.headers.get('content-type') || '').includes('application/json')) return res;
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (res.status === 401 && data?.code === 'SIGN_IN') { auth.set(null); onSignedOut(); throw new Refused(data, 401); }
  if (!data) throw new Refused({ code: 'SERVER', error: `The server answered ${res.status}. Nothing was changed.` }, res.status);
  if (!data.ok) throw new Refused(data, res.status);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b || {}),
  act: (sessionId, type, payload) => request('POST', `session/${sessionId}/act`, { type, payload }),
  async download(path) {
    const res = await request('GET', path, null, { raw: true, timeout: 120000 });
    const blob = await res.blob();
    const name = (res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'download';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return name;
  },
};
