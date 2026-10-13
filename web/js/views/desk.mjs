// The live Team Desk: join with the fund code, then trade.
import { h, mount, toast, store } from '../ui.mjs';
import { net, live, subscribe, startPolling, stopPolling, setToken, pollOnce, post, clockLeft, fetchMyResult } from '../net.mjs';
import { createDesk } from './deskcore.mjs';

const KEY = 'specula-token';

export default function desk(app, { band }) {
  let destroy = null;
  let saved = store(KEY);

  function showJoin(msg = null) {
    if (destroy) { destroy(); destroy = null; }
    stopPolling();
    const code = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'e.g. K7QX4P', maxlength: '10', 'aria-label': 'Fund code', id: 'join-code' });
    const name = h('input', { type: 'text', autocomplete: 'nickname', placeholder: 'Your first name', maxlength: '24', 'aria-label': 'Your name', id: 'join-name' });
    const go = h('button', { class: 'btn lg block', type: 'submit', id: 'join-go' }, 'Join the fund');
    const err = h('p', { class: 'down small', role: 'alert' }, msg || '');
    const form = h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      if (net.mode === 'single') { err.textContent = 'This copy of the site is in single device mode, so funds cannot join. Ask the Event Head.'; return; }
      go.disabled = true; err.textContent = '';
      try {
        const r = await post('join', { code: code.value, name: name.value });
        if (!r.ok || r.data.ok === false) { err.textContent = r.data.error || 'Could not join.'; go.disabled = false; return; }
        saved = { token: r.data.token, teamName: r.data.teamName, name: name.value.trim() };
        store(KEY, saved);
        start();
      } catch { err.textContent = 'No connection. Check the Wi-Fi and try again.'; go.disabled = false; }
    } },
    h('label', { class: 'field' }, h('span', {}, 'Fund code (from the Event Head — keep it private)'), code),
    h('label', { class: 'field' }, h('span', {}, 'Your name'), name), go, err);
    mount(app, band('desk'), h('main', { class: 'narrow', style: { padding: '40px 16px 80px' } },
      h('div', { class: 'eyebrow' }, 'Team Desk'), h('h1', {}, 'Join your fund'),
      h('p', { class: 'lead' }, 'Every member of your team can sign in on their own device. You all see the same desk, and any member’s trade is the fund’s trade.'),
      h('div', { class: 'card' }, form),
      h('p', { class: 'small muted', style: { marginTop: '16px' } }, 'New to SPECULA? ', h('a', { href: '#/learn' }, 'Read How to Play'), ' or ', h('a', { href: '#/practice' }, 'try two practice rounds'), ' first.')));
  }

  function start() {
    setToken(saved.token);
    startPolling();
    const adapter = {
      view: () => {
        const s = live.state || {};
        const q = live.docs.quarter;
        const resQ = s.docs?.result || 0;
        const result = resQ ? live.results[resQ] : null;
        if (resQ && !live.myResults?.[resQ]) fetchMyResult(resQ).then(() => adapter._emit && adapter._emit());
        const team = live.team;
        const me = (s.teams || []).find((t) => t.id === live.me?.teamId);
        return {
          phase: s.phase, q: s.q, round: s.round, v: s.v, ordersRev: live.orders?.rev, docKey: JSON.stringify(s.docs || {}) + (live.myResults?.[resQ] ? 'm' : ''),
          clock: clockLeft(), paused: s.timer?.pausedLeft !== null && s.timer?.pausedLeft !== undefined,
          qdoc: q && q.q === s.q ? q : (q || null), team, teamId: live.me?.teamId, teamName: me?.name || saved.teamName, members: me?.members || [],
          orders: (live.orders?.orders || []).filter(() => q?.run?.q === s.q), forecastSaved: live.orders?.forecast?.value ?? null, bidSaved: live.orders?.bid || null,
          result, myResult: live.myResults?.[resQ] || null, final: s.revealed ? live.docs.final || null : null, history: live.docs.history || [],
        };
      },
      subscribe: (fn) => { adapter._emit = fn; return subscribe(() => { if (live.error === 'signed-out') { store(KEY, null); saved = null; showJoin('You have been signed out (the game may have been reset). Join again with your fund code.'); return; } fn(); }); },
      placeOrder: (o) => send('order', { ...o, q: live.state.q, epoch: live.state.epoch, id: uid() }),
      setForecast: (value) => send('forecast', { value, q: live.state.q }),
      setBid: (b) => send('bid', { ...b, q: live.state.q }),
    };
    async function send(path, body) {
      for (let k = 0; k < 3; k++) {
        try {
          const r = await post(path, { ...body, token: saved.token }, { retries: 0 });
          if (r.ok && r.data.ok !== false) { if (r.data.orders) live.orders = r.data.orders; adapter._emit && adapter._emit(); pollOnce(); return { ok: true }; }
          if (r.data.stale) { await pollOnce(); return { ok: false, reason: r.data.error }; }
          return { ok: false, reason: r.data.error || 'Refused.' };
        } catch {
          await new Promise((res) => setTimeout(res, 700 * (k + 1)));
        }
      }
      return { ok: false, reason: 'Connection lost: the order may not have reached the market. When the connection returns, check “This round’s orders”.' };
    }
    if (destroy) destroy();
    destroy = createDesk(app, adapter, { band });
  }

  if (saved?.token) start(); else showJoin();
  return () => { stopPolling(); if (destroy) destroy(); };
}

function uid() { return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 20); }
