// The Event Head console (#admin).
import { h, mount, toast, sstore, fmtClock, fmtNum, fmtCr, fmtSigned, fmtPrice, calc, lineChart, bidChart, sheet, postEl } from '../ui.mjs';
import { net, live, subscribe, startPolling, stopPolling, clockLeft, post, setToken, pollOnce, fetchResult } from '../net.mjs';
import { ECONOMIES, ECON_ORDER } from '../../src/config/economies.mjs';
import { INST } from '../../src/config/instruments.mjs';
import { ROUNDS, roundName } from '../../src/config/rules.mjs';
import { releaseTable, decisionsRow, whyPanel, standingsTable, scoreSheet, forecastQuestion, modText } from '../explain.mjs';

export default function admin(app, { band }) {
  let pass = sstore('specula-admin');
  let status = null; let lastKey = ''; let busy = false; let autoSettle = sstore('specula-autosettle') ?? true; let autoTried = 0;
  let clockEl = null; let view = sstore('specula-admin-view') || 'control';
  setToken(null);

  async function call(action, extra = {}, { quiet = false } = {}) {
    busy = true;
    try {
      const r = await post('admin', { password: pass, action, ...extra }, { retries: 1 });
      if (r.status === 401) { pass = null; sstore('specula-admin', null); toast('Wrong Event Head password.', 'bad'); login(); return r; }
      if (!r.ok && !quiet) toast(r.data.error || 'Refused', 'bad', 7000);
      await pollOnce();
      await refresh();
      return r;
    } catch (e) {
      toast('No connection to the server. Nothing has changed; try again.', 'bad', 7000);
      return { ok: false, data: {} };
    } finally { busy = false; }
  }
  async function refresh() {
    try { const r = await post('admin', { password: pass, action: 'status' }, { retries: 0 }); if (r.ok) status = r.data; } catch { /* offline */ }
    lastKey = ''; render();
  }

  async function login() {
    stopPolling();
    let has = null;
    try { has = (await post('admin', { action: 'status-public' })).data.hasPassword; } catch { has = null; }
    const pw = h('input', { type: 'password', autocomplete: 'current-password', id: 'admin-pass', placeholder: 'Event Head password' });
    const pw2 = h('input', { type: 'password', autocomplete: 'new-password', id: 'admin-pass2', placeholder: 'Type it again' });
    const err = h('p', { class: 'down small', role: 'alert' });
    const form = h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      if (net.mode === 'single') { err.textContent = 'This copy of the site has no live server (single device mode). See DEPLOY.md.'; return; }
      if (has === false) {
        if (pw.value !== pw2.value) { err.textContent = 'The two passwords do not match.'; return; }
        const r = await post('admin', { action: 'setup', password: pw.value });
        if (!r.ok) { err.textContent = r.data.error; return; }
      }
      const r = await post('admin', { action: 'login', password: pw.value });
      if (!r.ok) { err.textContent = r.data.error || 'Wrong password.'; return; }
      pass = pw.value; sstore('specula-admin', pass); start();
    } }, pw, has === false ? pw2 : null, h('button', { class: 'btn lg block', type: 'submit', id: 'admin-go' }, has === false ? 'Set the password and enter' : 'Enter'), err);
    mount(app, band(''), h('main', { class: 'narrow', style: { padding: '40px 16px' } },
      h('div', { class: 'eyebrow' }, 'Event Head'), h('h1', {}, has === false ? 'Set your password' : 'Event Head console'),
      h('p', {}, has === false ? 'First visit after deploying: choose the Event Head password (at least 6 characters). Only someone with it can run the game. Write it down.' : 'Sign in to run SPECULA.'),
      h('div', { class: 'card' }, form)));
  }

  function start() { startPolling(() => 1000); refresh(); }
  const unsub = subscribe(() => { if (pass) render(); });

  function render() {
    if (!pass) return;
    const s = live.state;
    const key = JSON.stringify([s?.v, s?.docs, status && { c: status.codes, st: status.stages?.map((x) => x.fired), sub: status.subs }, view, busy]);
    if (key === lastKey) return;
    lastKey = key;
    const kept = {};
    app.querySelectorAll('[data-keep]').forEach((el) => { kept[el.dataset.keep] = { v: el.type === 'checkbox' ? el.checked : el.value, f: el === document.activeElement }; });
    clockEl = h('div', { class: 'clock' }, '—');
    mount(app, band(''),
      h('div', { class: 'desk-top' }, h('div', { class: 'inner' },
        h('div', { style: { flex: 1 } }, h('div', { class: 'eyebrow' }, 'Event Head'), h('b', {}, s ? phaseTitle(s) : 'Connecting…')),
        clockEl,
        h('div', { class: 'seg' }, [['control', 'Control'], ['funds', 'Funds'], ['debrief', 'Debrief'], ['tools', 'Tools']].map(([k, l]) => h('button', { class: view === k ? 'on' : '', onclick: () => { view = k; sstore('specula-admin-view', k); lastKey = ''; render(); } }, l))))),
      h('main', { class: 'wrap', style: { padding: '16px 16px 80px' } }, !s ? h('p', {}, 'Connecting…') : ({ control, funds, debrief, tools }[view] || control)(s)));
    app.querySelectorAll('[data-keep]').forEach((el) => { const k = kept[el.dataset.keep]; if (!k) return; if (el.type === 'checkbox') el.checked = k.v; else el.value = k.v; if (k.f) el.focus(); });
    tickClock();
  }
  function phaseTitle(s) {
    if (!s.q) return s.phase === 'lobby' ? 'Lobby · add funds, then start' : 'Setup';
    return `Q${s.q} · Round 0${s.round} · ${roundName(s.q)} · ${({ data: 'data drop', open: 'window open', settling: 'settling', results: 'results', final: 'final' })[s.phase] || s.phase}`;
  }

  // ---------------- control ----------------
  function control(s) {
    if (s.phase === 'lobby' || s.phase === 'setup') return funds(s);
    const q = live.docs.quarter;
    const st = status?.stages || [];
    const unfired = st.filter((x) => !x.fired);
    const res = s.docs?.result ? live.results[s.docs.result] : null;
    if (s.docs?.result && !res) fetchResult(s.docs.result).then(() => { lastKey = ''; render(); });
    const rs = status?.runsheet;
    return h('div', { class: 'admin-grid' },
      h('div', { class: 'stack' },
        h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Now'), h('h3', { style: { marginTop: 4 } }, phaseTitle(s)),
          rs ? h('div', { class: 'panel', style: { margin: '10px 0' } }, h('div', { class: 'eyebrow' }, 'Run sheet · say to the hall'), rs.say.map((t) => h('p', { class: 'small' }, t)), rs.fire ? h('p', { class: 'small warn' }, `Crisis timing: ${rs.fire}`) : null) : null,
          phaseButtons(s, unfired)),
        st.length ? h('div', { class: 'card', style: { borderColor: unfired.length ? 'var(--down)' : 'var(--gold)' } },
          h('div', { class: 'eyebrow' }, `Crises this quarter · ${st.length - unfired.length} of ${st.length} released`),
          h('p', { class: 'small muted' }, 'Only you can see this. Teams see nothing until you press Release. Prices react at once; the desk stays open. Stage 2 can only follow stage 1.'),
          st.map((x, i) => stageCard(x, s, unfired[0]?.id === x.id))) : (s.q ? h('div', { class: 'card quiet' }, h('p', { class: 'small muted' }, 'No crisis is scripted for this quarter.')) : null),
        q ? h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, `Data release · Q${q.q}`), releaseTable(q.release), h('p', { class: 'small', style: { marginTop: 8 } }, `Forecast: ${forecastQuestion(q.run?.forecast)}`)) : null),
      h('div', { class: 'stack' },
        subsCard(s),
        res ? h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, `Results · Q${res.q}`), decisionsRow(res.decisions), h('h4', {}, 'Why prices moved'), whyPanel(res, { limit: 8 })) : null,
        live.docs.standings ? h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Standings'), standingsTable(live.docs.standings.rows, { onRow: scoreSheet })) : null,
        status?.nextQuarter ? h('div', { class: 'card quiet' }, h('div', { class: 'eyebrow' }, `Coming next · Q${status.nextQuarter.q} (only you can see this)`), h('ul', { class: 'small' }, status.nextQuarter.headlines.map((t) => h('li', {}, t))), status.nextQuarter.crises.length ? h('p', { class: 'small warn' }, `Crisis: ${status.nextQuarter.crises.join(', ')}`) : null) : null));
  }

  function phaseButtons(s, unfired) {
    const secs = h('select', { 'aria-label': 'Window length', id: 'win-secs', 'data-keep': 'win-secs', style: { width: 'auto' } }, [60, 90, 120, 150, 180, 240].map((x) => h('option', { value: x, selected: x === (s.timer?.seconds || 120) }, fmtClock(x * 1000))));
    const B = (label, fn, cls = '', attrs = {}) => h('button', { class: `btn ${cls}`, disabled: busy, onclick: fn, ...attrs }, label);
    if (s.phase === 'data') return h('div', { class: 'row' }, secs, B('Open the window', () => call('openWindow', { seconds: Number(secs.value) }), 'lg', { id: 'btn-open' }));
    if (s.phase === 'open') {
      const paused = s.timer.pausedLeft !== null && s.timer.pausedLeft !== undefined;
      return h('div', { class: 'stack' },
        h('div', { class: 'row' },
          paused ? B('Resume', () => call('resume'), '', { id: 'btn-resume' }) : B('Pause', () => call('pause'), 'ghost', { id: 'btn-pause' }),
          B('+30 s', () => call('extend', { seconds: 30 }), 'ghost', { id: 'btn-extend' }),
          B('Ring the bell now', async () => { if (unfired.length) { toast('Release the crisis first.', 'bad'); return; } if (confirm('Ring the bell now and settle the quarter?')) call('settle', { early: true }); }, 'danger', { id: 'btn-bell' })),
        h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: autoSettle, onchange: (e) => { autoSettle = e.target.checked; sstore('specula-autosettle', autoSettle); } }), 'Settle automatically when the clock reaches zero'),
        unfired.length ? h('p', { class: 'small warn' }, 'This quarter cannot settle until its crisis is released. Release it before the clock runs out; if you release it after the bell, the desk reopens for 30 seconds.') : null);
    }
    if (s.phase === 'settling') return h('div', { class: 'stack' }, h('p', {}, 'Settling… if this does not finish in a few seconds (for example the page was reloaded), press:'), B('Finish settlement', () => call('settle', { early: true }), 'lg', { id: 'btn-finish' }));
    if (s.phase === 'results') {
      if (s.q >= 24) return B('Publish the final release and scores', () => call('final'), 'lg', { id: 'btn-final' });
      return h('div', { class: 'row' }, B(`Next: Q${s.q + 1} data drop`, () => call('next'), 'lg', { id: 'btn-next' }), s.q % 4 === 0 ? h('span', { class: 'badge alert' }, `Round 0${Math.ceil((s.q + 1) / 4)} begins: ${ROUNDS[Math.ceil((s.q + 1) / 4) - 1].name}`) : null);
    }
    if (s.phase === 'final') return h('div', {}, h('p', {}, 'The game is over. Open the Debrief tab for charts and the round summaries.'), B('Open debrief', () => { view = 'debrief'; lastKey = ''; render(); }));
    return null;
  }

  function stageCard(x, s, isNext) {
    return h('div', { class: `stage ${x.fired ? 'fired' : ''} ${isNext ? 'next' : ''}`, 'data-stage': x.id },
      h('div', { class: 'row between' }, h('div', { class: 'eyebrow' }, `${x.crisisTitle}${x.of > 1 ? ` · stage ${x.stageNo} of ${x.of}` : ''}`), x.fired ? h('span', { class: 'badge' }, 'released') : null),
      h('b', {}, x.title), h('p', { class: 'small' }, x.headline),
      h('details', {}, h('summary', { class: 'linkish small' }, 'posts and effects'), (x.posts || []).map((p) => postEl(p)),
        h('p', { class: 'tiny muted' }, [x.M ? `crisis multiplier ×${x.M}` : '', x.spreadMult ? 'trading costs up' : '', (x.rules || []).length ? `rules: ${x.rules.map((r) => `${r.econ} ${modText(r)}`).join('; ')}` : '', x.pegBreak ? 'the dinar peg breaks' : '', x.defaultEntity ? `DEFAULT: ${x.defaultEntity}` : ''].filter(Boolean).join(' · '))),
      !x.fired && s.phase === 'open' ? h('button', { class: 'btn danger', style: { marginTop: 8 }, disabled: busy || !isNext, 'data-fire': x.id, onclick: () => { if (confirm(`Release “${x.title}” now?`)) call('fire', { stageId: x.id }); } }, 'Release now') : null,
      !x.fired && s.phase !== 'open' ? h('p', { class: 'tiny muted' }, 'Can be released once the window is open.') : null);
  }

  function subsCard(s) {
    const subs = status?.subs || {};
    return h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Funds this quarter'),
      h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Fund'), h('th', { class: 'r' }, 'Signed in'), h('th', { class: 'r' }, 'Orders'), h('th', { class: 'r' }, 'Forecast'), s.q === 21 ? h('th', { class: 'r' }, 'Bid') : null)),
        h('tbody', {}, s.teams.map((t) => {
          const x = subs[t.id] || {};
          return h('tr', {}, h('td', {}, t.name), h('td', { class: 'r' }, t.members.length), h('td', { class: 'r num' }, x.orders ?? 0), h('td', { class: 'r num' }, x.forecast ?? '—'), s.q === 21 ? h('td', { class: 'r num' }, x.bid ? `${fmtCr(x.bid.amountCr * 1e9, 0)} @ ${fmtPrice(x.bid.price)}` : '—') : null);
        })))));
  }

  // ---------------- funds ----------------
  function funds(s) {
    const codes = status?.codes || {};
    const ta = h('textarea', { id: 'fund-names', 'data-keep': 'fund-names', placeholder: 'One fund name per line, e.g.\nAlpha Capital\nBull Run Partners' }, s.teams.map((t) => t.name).join('\n'));
    return h('div', { class: 'admin-grid' },
      h('div', { class: 'stack' },
        s.phase === 'lobby' ? h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Step 1 · the funds'),
          h('p', { class: 'small' }, 'One line per team. Each fund gets a private code; print or read them out to each team privately.'), ta,
          h('div', { class: 'row', style: { marginTop: 10 } }, h('button', { class: 'btn', id: 'btn-save-funds', disabled: busy, onclick: () => call('teams', { names: ta.value.split('\n').map((x) => x.trim()).filter(Boolean) }) }, 'Save funds and make codes'))) : null,
        s.phase === 'lobby' ? h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Step 2 · start'),
          h('p', { class: 'small' }, 'When teams have signed in, start the game. Q1’s data drops on every screen; then you open the first window.'),
          h('button', { class: 'btn lg', id: 'btn-start', disabled: busy || !s.teams.length, onclick: () => { if (confirm('Start the game? Funds cannot be changed afterwards.')) call('start'); } }, 'Start the game')) : null),
      h('div', { class: 'card' }, h('div', { class: 'row between' }, h('div', { class: 'eyebrow' }, `Fund codes · ${s.teams.length} funds`), h('button', { class: 'btn sm ghost', onclick: () => window.print() }, 'Print')),
        h('table', { class: 'tbl codes' }, h('thead', {}, h('tr', {}, h('th', {}, 'Fund'), h('th', {}, 'Code'), h('th', { class: 'r' }, 'Signed in'))),
          h('tbody', {}, s.teams.map((t) => h('tr', { 'data-fund': t.name }, h('td', {}, t.name), h('td', { class: 'code', 'data-code': codes[t.id] || '' }, codes[t.id] || '—'), h('td', { class: 'r small' }, t.members.map((m) => m.name).join(', ') || '—'))))),
        h('p', { class: 'small muted', style: { marginTop: 10 } }, `Teams join at ${location.host}/#/desk. Big Screen: ${location.host}/#/display`)));
  }

  // ---------------- debrief ----------------
  function debrief(s) {
    const hist = live.docs.history || [];
    if (!hist.length) return h('div', { class: 'card' }, h('p', {}, 'The debrief fills up as quarters settle.'));
    const labels = hist.map((x) => `Q${x.q}`);
    const rows = (live.docs.final?.standings?.rows || live.docs.standings?.rows || []);
    const auctionRes = live.results[21];
    if (s.q >= 21 && !auctionRes) fetchResult(21).then(() => { lastKey = ''; render(); });
    const summaries = status?.rounds || [];
    return h('div', { class: 'stack' },
      h('div', { class: 'grid g2' },
        h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Growth by economy (%)'), lineChart(ECON_ORDER.map((e) => ({ name: ECONOMIES[e].name, values: hist.map((x) => x.econ[e].g) })), labels)),
        h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Inflation by economy (%)'), lineChart(ECON_ORDER.map((e) => ({ name: ECONOMIES[e].name, values: hist.map((x) => x.econ[e].pi) })), labels)),
        h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Policy rates (%)'), lineChart(ECON_ORDER.map((e) => ({ name: ECONOMIES[e].name, values: hist.map((x) => x.econ[e].i) })), labels, { yFmt: (v) => fmtNum(v, 1) })),
        h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Fear Index'), lineChart([{ name: 'Fear Index', values: hist.map((x) => x.fear) }], labels))),
      h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Every fund’s value (₹ Cr)'), lineChart(rows.map((r) => ({ name: r.name, values: [1000, ...hist.map((x) => (x.nav[r.id] ?? null) / 1e9)] })), ['Start', ...labels], { height: 340, yFmt: (v) => fmtNum(v, 0) })),
      auctionRes?.auction ? h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, `Auction · ${INST[auctionRes.auction.spec.inst].name}`),
        h('p', { class: 'small' }, `Fair value (the settlement price): ${fmtPrice(auctionRes.auction.fair)}. Filled dots were allotted; green bought below fair value (an instant gain), red above it (a loss).`),
        bidChart(auctionRes.auction.bids.map((b) => ({ ...b, name: b.name })), auctionRes.auction.fair),
        h('table', { class: 'tbl' }, h('tbody', {}, auctionRes.auction.bids.map((b) => h('tr', {}, h('td', {}, b.name), h('td', { class: 'r num' }, fmtPrice(b.price)), h('td', { class: 'r num' }, fmtCr(b.amount, 0)), h('td', { class: 'r num' }, b.allotted ? `allotted ${fmtCr(b.allotted, 0)}` : 'not filled')))))) : null,
      h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'What happened and why · read these out in the hall'),
        summaries.length ? summaries.map((r) => h('div', { style: { margin: '14px 0' } }, h('h3', {}, `Round 0${r.n} · ${ROUNDS[r.n - 1].name}`), r.text.map((t) => h('p', {}, t)))) : h('p', { class: 'muted' }, 'Loading…')),
      rows.length ? h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Final standings'), standingsTable(rows, { onRow: scoreSheet })) : null);
  }

  // ---------------- tools ----------------
  function tools(s) {
    const conf = h('input', { type: 'text', placeholder: 'Type RESET', id: 'reset-confirm', 'data-keep': 'reset-confirm' });
    const keep = h('input', { type: 'checkbox', id: 'reset-keep', 'data-keep': 'reset-keep' });
    return h('div', { class: 'grid g2' },
      h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Screens'), h('p', {}, h('a', { href: '#/display', target: '_blank' }, 'Open the Big Screen in a new tab'), ' (put it on the projector, press F11 for full screen).'), h('p', {}, h('a', { href: '#/desk', target: '_blank' }, 'Open a Team Desk'))),
      h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Backup'), h('p', { class: 'small' }, 'Download everything (prices, orders, results) as a file. Do this at the end, or any time.'),
        h('button', { class: 'btn ghost', onclick: async () => { const r = await post('admin', { password: pass, action: 'export' }); if (r.ok) { const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 1)], { type: 'application/json' })), download: `specula-backup-${new Date().toISOString().slice(0, 16)}.json` }); a.click(); } } }, 'Download backup')),
      h('div', { class: 'card', style: { borderColor: 'var(--down)' } }, h('div', { class: 'eyebrow' }, 'Reset the game'),
        h('p', { class: 'small' }, 'Wipes every quarter, order and result. Use after a rehearsal. The password stays.'),
        h('label', { class: 'row small' }, keep, 'Keep the same funds and codes (teams sign in again)'), conf,
        h('button', { class: 'btn danger', style: { marginTop: 8 }, id: 'btn-reset', onclick: () => { if (conf.value === 'RESET') call('reset', { confirm: 'RESET', keepTeams: keep.checked }); else toast('Type RESET first.', 'bad'); } }, 'Reset everything')),
      h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Sign out'), h('button', { class: 'btn ghost', onclick: () => { sstore('specula-admin', null); pass = null; login(); } }, 'Sign out of the console')));
  }

  function tickClock() {
    if (!clockEl) return;
    const s = live.state;
    if (!s) return;
    const left = clockLeft();
    const paused = s.timer?.pausedLeft !== null && s.timer?.pausedLeft !== undefined;
    clockEl.textContent = s.phase === 'open' ? (left > 0 ? `${fmtClock(left)}${paused ? ' ‖' : ''}` : 'BELL') : ({ data: 'DATA', results: 'DONE', settling: 'BELL', final: 'END' }[s.phase] || '—');
    clockEl.className = `clock ${s.phase === 'open' && left < 20000 ? 'closing' : ''} ${s.phase !== 'open' ? 'shut' : ''}`;
    // settle automatically at zero (once every few seconds at most)
    if (autoSettle && s.phase === 'open' && !paused && left !== null && left <= 0 && !busy && Date.now() - autoTried > 4000) {
      const unfired = (status?.stages || []).filter((x) => !x.fired);
      if (!unfired.length) { autoTried = Date.now(); call('settle', {}, { quiet: true }); }
    }
  }
  const t = setInterval(tickClock, 250);
  const t2 = setInterval(() => { if (pass && live.state?.q) refresh(); }, 5000);

  if (pass) start(); else login();
  return () => { clearInterval(t); clearInterval(t2); unsub(); stopPolling(); };
}
