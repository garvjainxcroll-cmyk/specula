// The Team Desk, shared by the live game and practice mode.
// The adapter supplies data and actions; the desk computes positions, Risk Used and
// exposure with exactly the same engine code the server uses.
import { h, mount, sheet, toast, money, pct, fmtCr, fmtNum, fmtSigned, fmtPrice, fmtRupees, fmtClock, calc, steps, postEl, sstore, sparkline } from '../ui.mjs';
import { ECONOMIES, ECON_ORDER } from '../../src/config/economies.mjs';
import { INSTRUMENTS, INST, FAMILIES } from '../../src/config/instruments.mjs';
import { RULES, FORECAST_VARS, roundName } from '../../src/config/rules.mjs';
import { deskNow, checkOrder } from '../../src/engine/game.mjs';
import { riskUsed, grossExposure } from '../../src/engine/risk.mjs';
import { rupeePrice } from '../../src/engine/market.mjs';
import { explainInstrument } from '../../src/config/explain.mjs';
import { r2 } from '../../src/engine/num.mjs';
import {
  releaseTable, figureSheet, ruleCard, decisionsRow, decisionSheet, whyPanel, quarterMoves, moveExplain, pnlTable, pnlSheet, riskSheet,
  scoreSheet, myRecord, forecastQuestion, forecastBlock, lineTot, modText,
} from '../explain.mjs';

const CR = 1e9;
const TABS = [['market', 'Market'], ['trade', 'Trade'], ['fund', 'Fund'], ['results', 'Results'], ['score', 'My score']];

export function createDesk(root, adapter, { band, practice = false, onRender = null } = {}) {
  let tab = sstore('specula-tab') || 'market';
  let lastKey = '';
  let clockEl = null; let clockTimer = null;
  let seenResultQ = sstore('specula-seen-result') || 0;
  const seenStages = new Set(sstore('specula-seen-stages') || []);
  const openFams = new Set(sstore('specula-fams') || ['govt', 'futures', 'shares']);

  function world(v) {
    const q = v.qdoc;
    if (!q?.run) return null;
    return { run: q.run, teams: { [v.teamId]: v.team }, sigma: q.sigma, round: q.round, mkt: q.mkt };
  }
  function now(v) {
    if (!v.team || !v.qdoc) return null;
    const w = world(v);
    if (!w) {
      // between quarters: the fund as it stands after settlement
      const st = { cash: v.team.cash, pos: { ...v.team.pos }, open: { ...(v.team.open || {}) } };
      const nav = st.cash + Object.entries(st.pos).filter(([id]) => INST[id].funded).reduce((a, [, x]) => a + x, 0);
      const gross = grossExposure(st.pos);
      const risk = riskUsed(st.pos, nav, v.qdoc.sigma, v.qdoc.round?.M || 1);
      return { w: null, orders: [], st, led: null, nav, gross, exposure: nav > 0 ? r2(gross / nav) : null, risk, pnlSoFar: 0 };
    }
    const orders = (v.orders || []).map((o) => ({ inst: o.inst, delta: o.delta, epoch: o.epoch }));
    return { w, orders, ...deskNow(w, v.teamId, orders) };
  }

  function render() {
    const v = adapter.view();
    const key = JSON.stringify([v.phase, v.q, v.v, v.ordersRev, v.docKey, tab, v.forecastSaved, v.bidSaved, v.team?.navHist?.length, v.teamName, !!v.final]);
    if (key === lastKey) return;
    lastKey = key;
    const keep = keepInputs(root);
    const n = now(v);
    const isOpen = v.phase === 'open' && (v.clock ?? 1) > 0 && !v.paused;
    // results arrive: jump to them once
    if (v.final && !sstore('specula-seen-final')) { sstore('specula-seen-final', 1); tab = 'score'; sstore('specula-tab', tab); }
    if (v.phase === 'results' && v.result?.q && v.result.q > seenResultQ) { seenResultQ = v.result.q; sstore('specula-seen-result', seenResultQ); tab = 'results'; sstore('specula-tab', tab); }
    mount(root,
      band ? band('desk', { minimal: practice }) : null,
      topBar(v, n, isOpen),
      h('main', { class: 'desk-main' },
        practice ? h('div', { class: 'single', style: { borderRadius: '8px', marginBottom: '12px' } }, 'PRACTICE — a made-up scenario on this device only. Nothing here is the real game.') : null,
        phaseNote(v),
        crisisBanners(v),
        h('div', { class: 'desk-cols' },
          h('div', {},
            pane('market', marketPane(v, n, isOpen)),
            pane('results', resultsPane(v, n), true)),
          h('div', {},
            pane('trade', tradePane(v, n, isOpen)),
            pane('fund', fundPane(v, n)),
            pane('score', scorePane(v))))),
      tabBar(v));
    restoreInputs(root, keep);
    showTakeover(v);
    onRender && onRender(v, n);
  }

  function pane(id, content, desktopBelow = false) {
    return h('section', { class: `pane ${tab === id ? 'on' : ''}`, 'data-pane': id, style: desktopBelow ? { marginTop: '16px' } : null }, content);
  }
  function tabBar(v) {
    return h('nav', { class: 'tabbar', 'aria-label': 'Desk sections' }, TABS.map(([id, label]) => h('button', {
      class: `tab ${tab === id ? 'on' : ''}`, 'data-tab': id,
      onclick: () => { tab = id; sstore('specula-tab', tab); lastKey = ''; render(); window.scrollTo(0, 0); },
    }, label, id === 'results' && v.phase === 'results' && v.result?.q === v.q ? h('span', { class: 'dot' }) : null)));
  }

  // ---------------- top bar ----------------
  function topBar(v, n, isOpen) {
    const ru = n?.risk?.pct ?? 0;
    clockEl = h('div', { class: 'clock', 'data-clock': '1' }, '—');
    updateClock(v);
    return h('div', { class: 'desk-top' }, h('div', { class: 'inner' },
      h('div', { style: { minWidth: '0', flex: '1 1 160px' } },
        h('div', { class: 'eyebrow' }, v.q ? (practice ? `Practice round ${v.q} of 2` : `Round 0${v.round || v.q} of 06 · ${roundName(v.q)}`) : 'SPECULA'),
        h('div', { style: { fontWeight: 600, fontSize: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, v.teamName || 'Your fund')),
      clockEl,
      n ? h('button', { class: 'kpi click', style: { padding: '4px 10px', minWidth: '120px' }, onclick: () => { tab = 'fund'; lastKey = ''; render(); } },
        h('div', { class: 'k' }, 'Fund value'), h('div', { class: 'v num', style: { fontSize: '19px' } }, fmtCr(n.nav))) : null,
      n ? h('button', { class: 'kpi click', style: { padding: '4px 10px', minWidth: '130px' }, 'data-risk': String(ru), onclick: () => riskSheet(n.risk) },
        h('div', { class: 'k' }, 'Risk Used'), h('div', { class: `v num ${ru > 100 ? 'down' : ru > 85 ? 'warn' : ''}`, style: { fontSize: '19px' } }, `${fmtNum(ru, 0)}%`),
        h('div', { class: `meter ${ru > 100 ? 'over' : ru > 85 ? 'hot' : ''}`, style: { marginTop: '2px' } }, h('i', { style: { width: `${Math.min(100, ru / 1.2)}%` } }), h('span', { class: 'mark', style: { left: `${100 / 1.2}%` } }))) : null,
      n ? h('div', { class: 'kpi hide-sm', style: { padding: '4px 10px' } }, h('div', { class: 'k' }, 'Exposure'), h('div', { class: `v num ${n.exposure > 2.8 ? 'warn' : ''}`, style: { fontSize: '19px' } }, `${fmtNum(n.exposure ?? 0, 2)}× / 3×`)) : null));
  }
  function updateClock(v0) {
    const v = v0 || adapter.view();
    if (!clockEl) return;
    const left = v.clock;
    let txt; let cls = 'clock';
    if (v.phase === 'open' && v.paused) { txt = `${fmtClock(left)} ‖`; cls += ' closing'; }
    else if (v.phase === 'open' && left !== null) { txt = left > 0 ? fmtClock(left) : 'BELL'; if (left < 20000) cls += ' closing'; }
    else { txt = { lobby: 'WAIT', data: 'DATA', settling: 'BELL', results: 'SETTLED', final: 'FINAL', setup: 'WAIT' }[v.phase] || '—'; cls += ' shut'; }
    clockEl.textContent = txt; clockEl.className = cls;
  }
  clockTimer = setInterval(() => {
    const v = adapter.view();
    updateClock(v);
    // the window just closed: re-render to lock the desk
    if (v.phase === 'open' && v.clock !== null && v.clock <= 0 && !v.paused && !root.dataset.locked) { root.dataset.locked = '1'; lastKey = ''; render(); }
    if (v.phase !== 'open' || (v.clock ?? 1) > 0) delete root.dataset.locked;
  }, 250);

  function phaseNote(v) {
    const map = {
      setup: ['Waiting', 'The Event Head has not set up the game yet.'],
      lobby: ['Waiting for the start', `You are in. ${v.members?.length ? `On this fund: ${v.members.map((m) => m.name).join(', ')}.` : ''} Read How to Play while you wait — the first data drop appears here.`],
      data: ['The data has dropped', 'Read the figures and the central bank rules. The desk unlocks when the Event Head starts the clock.'],
      settling: ['The bell has rung', 'The desk is locked. Central banks are acting and prices are resetting…'],
      final: ['The game is over', v.final ? 'The results have been revealed: your SPECULA Score and place are on the My score tab.' : 'Your fund’s final record is on the My score tab. The Event Head will reveal the standings.'],
    };
    if (v.phase === 'open' && v.paused) return h('div', { class: 'crisis-banner' }, h('div', { class: 'eyebrow' }, 'Paused'), 'The Event Head has paused the market. Orders are not accepted until the clock restarts.');
    if (v.phase === 'open' && (v.clock ?? 1) <= 0) return h('div', { class: 'panel', style: { marginBottom: '12px' } }, h('div', { class: 'eyebrow' }, 'The bell has rung'), 'The desk is locked. Late orders are refused.');
    const m = map[v.phase];
    if (!m) return null;
    return h('div', { class: 'panel', style: { marginBottom: '12px' }, 'data-phase': v.phase }, h('div', { class: 'eyebrow' }, m[0]), h('div', {}, m[1]));
  }

  function crisisBanners(v) {
    const st = v.qdoc?.run?.stages || [];
    if (!st.length) return null;
    return st.slice().reverse().map((s) => h('div', { class: 'crisis-banner', 'data-stage': s.id },
      h('div', { class: 'eyebrow' }, `Crisis · ${s.crisisTitle}${s.of > 1 ? ` · stage ${s.stageNo} of ${s.of}` : ''}`),
      h('div', { style: { fontWeight: 600 } }, s.headline),
      h('div', { class: 'row small', style: { marginTop: '6px' } },
        s.M ? h('span', { class: 'badge alert' }, `Crisis multiplier ×${fmtNum(s.M)}`) : null,
        s.spreadMult ? h('span', { class: 'badge alert' }, 'Trading costs up') : null,
        (s.rules || []).length ? h('span', { class: 'badge alert' }, 'Rule change') : null,
        s.revisions?.length ? h('span', { class: 'badge alert' }, 'Data revised') : null,
        h('button', { class: 'why', onclick: () => takeover(s, true) }, 'read the posts'))));
  }
  function showTakeover(v) {
    const st = v.qdoc?.run?.stages || [];
    for (const s of st) {
      const k = `${v.q}:${s.id}`;
      if (!seenStages.has(k)) { seenStages.add(k); sstore('specula-seen-stages', [...seenStages]); if (v.phase === 'open' || v.phase === 'data') takeover(s); }
    }
  }
  function takeover(s, manual = false) {
    document.querySelector('.takeover')?.remove();
    const el = h('div', { class: 'takeover', role: 'alertdialog', 'aria-label': 'Crisis' }, h('div', { class: 'box' },
      h('div', { class: 'eyebrow' }, `Crisis${s.of > 1 ? ` · stage ${s.stageNo} of ${s.of}` : ''} · ${s.crisisTitle}`),
      h('h2', {}, s.headline),
      (s.posts || []).map((p, i) => postEl(p, 300 + i * 700)),
      (s.revisions || []).length ? h('p', { class: 'small', style: { marginTop: '12px', color: '#f2c46b' } }, 'Data revised: ', s.revisions.map((r) => `${ECONOMIES[r.econ].name} ${labelOf(r.key)} ${fmtNum(r.from, 1)} → ${fmtNum(r.to, 1)}`).join('; '), '.') : null,
      (s.rules || []).length ? h('p', { class: 'small', style: { color: '#f2c46b' } }, 'Rule change for the rest of the round: ', s.rules.map((r) => `${ECONOMIES[r.econ].name}: ${modText(r)}`).join('; '), '.') : null,
      h('p', { class: 'small', style: { color: '#b3a48b', marginTop: '12px' } }, manual ? '' : 'Prices have already moved. Check your Risk Used before the bell.'),
      h('button', { class: 'btn block', onclick: () => el.remove() }, 'Back to the desk')));
    document.body.appendChild(el);
    if (!manual) setTimeout(() => el.querySelector('.btn')?.focus(), 50);
  }

  // ---------------- market ----------------
  function marketPane(v, n, isOpen) {
    const q = v.qdoc;
    if (!q) return h('div', { class: 'card' }, h('p', {}, 'The first data drop will appear here.'));
    const rel = q.release;
    const lastMoves = v.result ? quarterMoves(v.result) : null;
    return h('div', { class: 'stack' },
      h('div', { class: 'card', 'data-tip': 'data' },
        h('div', { class: 'row between' }, h('div', {}, h('div', { class: 'eyebrow' }, `Data release · Round ${q.q}`), h('h3', { style: { margin: 0 } }, q.run?.roundName || '')), h('span', { class: 'badge' }, 'tap a figure for its working')),
        h('div', { style: { marginTop: '10px' } }, releaseTable(rel, { onFigure: (e, k) => figureSheet(e, k, rel) })),
        (q.run?.headlines || []).length ? h('div', { class: 'panel', style: { marginTop: '12px' } }, h('div', { class: 'eyebrow' }, 'Headlines'), h('ul', { style: { margin: '6px 0 0', paddingLeft: '20px' } }, q.run.headlines.map((t) => h('li', {}, t)))) : null),
      h('div', { class: 'card', 'data-tip': 'rules' },
        h('div', { class: 'eyebrow' }, 'Central bank rules'),
        h('p', { class: 'small muted' }, 'At settlement each central bank applies its rule to this release. Work it out — you will want a calculator. The full working appears on the Results tab after the bell.'),
        h('div', { class: 'grid g2' }, ECON_ORDER.map((e) => ruleCard(e, q)))),
      h('div', { class: 'card', 'data-tip': 'markets' },
        h('div', { class: 'row between' }, h('div', { class: 'eyebrow' }, 'The markets · 44 instruments'), h('span', { class: 'tiny muted' }, `rupee cash rate ${fmtNum(RULES.cashRatePct)}% a year`)),
        FAMILIES.map((f) => h('details', { class: 'fam', open: openFams.has(f.id), 'data-fam': f.id, ontoggle: (e) => { if (e.target.open) openFams.add(f.id); else openFams.delete(f.id); sstore('specula-fams', [...openFams]); } },
          h('summary', {}, f.name, h('span', { class: 'tiny' }, `${f.count}`)),
          INSTRUMENTS.filter((x) => x.family === f.id).map((x) => instRow(x, v, n, q, lastMoves))))));
  }

  function instRow(x, v, n, q, lastMoves) {
    const p = q.prices[x.id];
    const prev = q.lastPx ? pxOf(x, q.lastPx) : null;
    const ch = prev ? (x.kind === 'future' || x.kind === 'cds' ? r2(p - prev) : r2((p / prev - 1) * 100)) : 0;
    const carry = q.carry[x.id];
    const held = n?.st?.pos?.[x.id];
    return h('div', { class: 'inst', 'data-inst': x.id, onclick: () => instSheet(x.id) },
      h('div', {}, h('div', { class: 'nm' }, x.name),
        h('div', { class: 'meta' }, carry.rate ? `${carry.rate > 0 ? 'earns' : 'costs'} ${fmtNum(Math.abs(carry.rate))}% a year` : 'pays nothing', ` · cost ${fmtNum(q.run?.spreads?.[x.id] ?? x.spread)}%`),
        held ? h('div', { class: 'held' }, `${held > 0 ? 'You hold' : 'You are short'} ${fmtCr(Math.abs(held))}`) : null),
      h('div', {}, h('div', { class: 'px num' }, x.kind === 'future' || x.kind === 'cds' ? fmtNum(p, 2) : fmtPrice(p)),
        h('div', { class: 'ch' }, x.kind === 'future' || x.kind === 'cds' ? h('span', { class: `num ${ch > 0 ? 'up' : ch < 0 ? 'down' : 'muted'}` }, `${fmtSigned(ch)} pts`) : pct(ch))));
  }

  function instSheet(id) {
    const v = adapter.view(); const n = now(v); const q = v.qdoc;
    const x = INST[id];
    const ex = explainInstrument(id, q.mkt);
    const p = q.prices[id];
    const carry = q.carry[id];
    const held = n?.st?.pos?.[id] || 0;
    const openPnl = n?.st?.open?.[id] || 0;
    const lastMove = v.result ? quarterMoves(v.result)[id] : null;
    const isOpen = v.phase === 'open' && (v.clock ?? 1) > 0 && !v.paused;
    sheet(x.name, (close) => h('div', { class: 'stack' },
      h('div', { class: 'kpis' },
        h('div', { class: 'kpi' }, h('div', { class: 'k' }, x.kind === 'future' ? 'Price (100 − rate)' : x.kind === 'cds' ? 'Price per ₹100 protected' : 'Price'), h('div', { class: 'v num' }, x.kind === 'future' || x.kind === 'cds' ? fmtNum(p, x.kind === 'cds' ? 4 : 2) : fmtPrice(p)),
          x.kind === 'future' ? h('div', { class: 's' }, `market expects ${fmtNum(100 - p)}%`) : null, x.ccy ? h('div', { class: 's' }, `${fmtNum(q.mkt.px.lp[id], 4)} in ${ECONOMIES[x.ccy].currencyPlural} × ₹${fmtNum(q.mkt.px.fx[x.ccy], 4)}`) : null),
        h('div', { class: 'kpi' }, h('div', { class: 'k' }, 'Holding it'), h('div', { class: `v num ${carry.rate > 0 ? 'up' : carry.rate < 0 ? 'down' : ''}` }, carry.rate ? `${fmtSigned(carry.rate)}%` : '0%'), h('div', { class: 's' }, carry.label)),
        h('div', { class: 'kpi' }, h('div', { class: 'k' }, 'Trading cost now'), h('div', { class: 'v num' }, `${fmtNum(q.run?.spreads?.[id] ?? x.spread)}%`), h('div', { class: 's' }, x.funded ? 'uses cash' : 'no cash needed; counts towards 3×'))),
      held ? h('div', { class: 'panel' }, h('div', { class: 'eyebrow' }, 'Your position'), h('div', { class: 'row between' }, h('span', {}, `${held > 0 ? 'Long' : 'Short'} ${fmtCr(Math.abs(held))}`), h('span', {}, 'open profit or loss ', money(openPnl)))) : null,
      isOpen && n ? ticket(id, n, v, close) : h('p', { class: 'muted small' }, v.phase === 'data' ? 'Trading opens when the clock starts.' : 'Trading is closed right now.'),
      h('div', { class: 'explain-box' }, h('div', { class: 'eyebrow' }, 'What it is'), h('p', { class: 'small' }, ex.line), ex.examples.map((t) => h('p', { class: 'small' }, t))),
      lastMove && lastMove.segs.length ? h('div', {}, h('h4', {}, `Why it moved last round (${lastMove.points ? `${fmtSigned(lastMove.total)} points` : `${fmtSigned(lastMove.total)}%`})`), moveExplain(lastMove)) : null,
      v.history?.length > 1 ? h('div', { class: 'row' }, h('span', { class: 'small muted' }, 'Price history'), sparkline(v.history.map((r) => r.prices[id]), { w: 220, h: 40 })) : null),
    { eyebrow: familyLabel(x.family) });
  }

  function ticket(id, n, v, close) {
    const x = INST[id];
    const held = n.st.pos[id] || 0;
    let side = 'buy';
    const amount = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: '0.01', placeholder: 'Amount in ₹ Cr', 'aria-label': 'Amount in rupees crore', 'data-amount': id });
    const preview = h('div', { class: 'small' });
    const btnBuy = h('button', { class: 'btn buy on', type: 'button', onclick: () => { side = 'buy'; btnBuy.classList.add('on'); btnSell.classList.remove('on'); upd(); } }, 'Buy');
    const btnSell = h('button', { class: 'btn sell', type: 'button', onclick: () => { side = 'sell'; btnSell.classList.add('on'); btnBuy.classList.remove('on'); upd(); } }, held > 0 ? 'Sell' : 'Sell short');
    const go = h('button', { class: 'btn block', type: 'button', 'data-go': id, onclick: async () => {
      const a = Number(amount.value);
      go.disabled = true;
      const r = await adapter.placeOrder({ inst: id, side, amountCr: a });
      go.disabled = false;
      if (r.ok) { toast(`${side === 'buy' ? 'Bought' : 'Sold'} ${fmtCr(a * CR)} of ${x.short}.`, 'good'); close(); } else toast(r.reason, 'bad', 6000);
    } }, 'Place order');
    const closeBtn = held ? h('button', { class: 'btn ghost block', type: 'button', 'data-close': id, onclick: async () => {
      closeBtn.disabled = true;
      const r = await adapter.placeOrder({ inst: id, side: 'close' });
      closeBtn.disabled = false;
      if (r.ok) { toast(`Closed your ${x.short} position.`, 'good'); close(); } else toast(r.reason, 'bad', 6000);
    } }, `Close the whole position (${fmtCr(Math.abs(held))})`) : null;
    const chips = h('div', { class: 'row' }, [10, 50, 100, 250, 500].map((c) => h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { amount.value = c; upd(); } }, `₹${c} Cr`)));
    function upd() {
      const a = Number(amount.value);
      if (!(a > 0)) { mount(preview, h('span', { class: 'muted' }, 'Enter an amount to see the cost, your exposure and your Risk Used after the trade.')); go.disabled = true; return; }
      const chk = checkOrder(n.w, adapter.view().teamId, n.orders, { inst: id, side, amountCr: a });
      if (!chk.ok) { mount(preview, h('span', { class: 'down' }, chk.reason)); go.disabled = true; return; }
      const after = { ...n.st.pos, [id]: (n.st.pos[id] || 0) + chk.delta };
      if (!after[id]) delete after[id];
      const navAfter = n.nav - chk.cost;
      const ruAfter = riskUsed(after, navAfter, n.w.sigma, n.w.round.M).pct;
      mount(preview, calc(
        `Trading cost: ${fmtCr(Math.abs(chk.delta))} × ${fmtNum(n.w.run.spreads[id])}% = ${fmtRupees(chk.cost)}`,
        `Exposure after: ${fmtNum(grossExposure(after) / navAfter, 2)}× of 3×   ·   Risk Used after: ${fmtNum(ruAfter, 0)}%${ruAfter > 100 ? ' — above the limit: forced liquidation at the bell unless you cut back' : ''}`));
      go.disabled = false;
    }
    amount.addEventListener('input', upd);
    upd();
    return h('div', { class: 'card tight', 'data-ticket': id }, h('div', { class: 'eyebrow' }, 'Trade'),
      h('div', { class: 'row', style: { margin: '8px 0' } }, btnBuy, btnSell), amount, h('div', { style: { margin: '8px 0' } }, chips), preview, h('div', { style: { marginTop: '8px' } }, go), closeBtn ? h('div', { style: { marginTop: '8px' } }, closeBtn) : null);
  }

  // ---------------- trade pane: forecast, auction, positions ----------------
  function tradePane(v, n, isOpen) {
    const q = v.qdoc;
    return h('div', { class: 'stack' },
      q?.run?.forecast ? forecastCard(v, isOpen) : null,
      q?.run?.auction ? auctionCard(v, n, isOpen) : null,
      h('div', { class: 'card', 'data-tip': 'positions' },
        h('div', { class: 'eyebrow' }, 'Your positions'),
        n && Object.keys(n.st.pos).length ? h('div', {}, Object.entries(n.st.pos).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([id, val]) => h('div', { class: 'inst', onclick: () => instSheet(id) },
          h('div', {}, h('div', { class: 'nm' }, INST[id].name), h('div', { class: 'meta' }, `${val > 0 ? 'Long' : 'Short'} ${fmtCr(Math.abs(val))}${INST[id].funded ? '' : ' (no cash)'}`)),
          h('div', { class: 'px' }, money(n.st.open[id] || 0)))))
          : h('p', { class: 'muted small' }, 'No positions yet. Tap any instrument on the Market tab to trade it.'),
        h('p', { class: 'tiny muted' }, 'The amount on the right is each position’s open profit or loss.')),
      h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'This round’s orders'),
        (v.orders || []).length ? h('table', { class: 'tbl' }, h('tbody', {}, v.orders.slice().reverse().map((o) => h('tr', {},
          h('td', {}, INST[o.inst].short), h('td', {}, o.side === 'close' ? 'close' : o.side), h('td', { class: 'r num' }, fmtCr(Math.abs(o.delta))),
          h('td', { class: 'r tiny muted' }, o.epoch ? `after crisis ${o.epoch}` : '', v.memberName && o.by ? '' : ''))))) : h('p', { class: 'muted small' }, 'None yet.')));
  }

  function forecastCard(v, isOpen) {
    const spec = v.qdoc.run.forecast;
    const rel = v.qdoc.release.econ[spec.econ];
    const cur = spec.v === 'i' ? rel.i : rel[spec.v];
    const input = h('input', { type: 'number', step: '0.01', inputmode: 'decimal', placeholder: 'e.g. 4.25', id: 'forecast-input', 'data-keep': 'forecast', value: v.forecastSaved ?? '' });
    const save = h('button', { class: 'btn', disabled: !isOpen, 'data-save-forecast': '1', onclick: async () => {
      save.disabled = true;
      const r = await adapter.setForecast(input.value === '' ? null : Number(input.value));
      save.disabled = false;
      if (r.ok) toast('Forecast saved.', 'good'); else toast(r.reason, 'bad', 6000);
    } }, 'Save forecast');
    return h('div', { class: 'card', 'data-tip': 'forecast' },
      h('div', { class: 'eyebrow' }, `Forecast · Round ${v.q}`),
      h('h3', { style: { marginTop: '4px' } }, forecastQuestion(spec)),
      h('p', { class: 'small muted' }, `It is ${fmtNum(cur, spec.v === 'i' ? 2 : 1)}% in this release. Up to 10 points; you lose 1 point for every 0.1 off. A blank scores zero.`),
      h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, input, save),
      h('p', { class: 'small', style: { marginTop: '8px' } }, v.forecastSaved !== null && v.forecastSaved !== undefined ? `Saved: ${fmtNum(v.forecastSaved)}%` : 'Not saved yet.'));
  }

  function auctionCard(v, n, isOpen) {
    const a = v.qdoc.run.auction;
    const p = v.qdoc.prices[a.inst];
    const price = h('input', { type: 'number', step: '0.01', placeholder: `price, e.g. ${fmtNum(p * 0.98)}`, 'data-keep': 'bid-price', value: v.bidSaved?.price ?? '' });
    const amt = h('input', { type: 'number', step: '0.01', placeholder: 'amount in ₹ Cr', 'data-keep': 'bid-amount', value: v.bidSaved?.amountCr ?? '' });
    const maxCr = n ? Math.floor((v.team.navHist.at(-1) / CR) * a.maxPctOfFund) / 100 : 0;
    return h('div', { class: 'card', style: { borderColor: 'var(--gold-bright)' }, 'data-tip': 'auction' },
      h('div', { class: 'eyebrow' }, 'Round decision'), h('h3', { style: { marginTop: '4px' } }, a.title),
      h('ul', { class: 'small' }, a.rules.map((t) => h('li', {}, t))),
      h('p', { class: 'small' }, `${INST[a.inst].name} on the desk now: ${fmtPrice(p)}. Most you may bid for: ${fmtCr(maxCr * CR)}.`),
      h('div', { class: 'grid g2' }, h('label', { class: 'field' }, h('span', {}, 'Price you bid (₹)'), price), h('label', { class: 'field' }, h('span', {}, 'Amount (₹ Cr)'), amt)),
      h('div', { class: 'row', style: { marginTop: '8px' } },
        h('button', { class: 'btn', disabled: !isOpen, onclick: async () => { const r = await adapter.setBid({ price: Number(price.value), amountCr: Number(amt.value) }); toast(r.ok ? 'Bid saved.' : r.reason, r.ok ? 'good' : 'bad', 6000); } }, 'Save bid'),
        v.bidSaved ? h('button', { class: 'btn ghost', disabled: !isOpen, onclick: async () => { const r = await adapter.setBid({ cancel: true }); toast(r.ok ? 'Bid withdrawn.' : r.reason); } }, 'Withdraw') : null),
      h('p', { class: 'small', style: { marginTop: '8px' } }, v.bidSaved ? `Saved: ${fmtCr(v.bidSaved.amountCr * CR)} at ${fmtPrice(v.bidSaved.price)}` : 'No bid saved.'));
  }

  // ---------------- fund pane ----------------
  function fundPane(v, n) {
    if (!n) return h('div', { class: 'card' }, h('p', {}, 'Your fund appears here once the game starts.'));
    const longs = Object.entries(n.st.pos).filter(([id, x]) => INST[id].funded && x > 0).reduce((a, [, x]) => a + x, 0);
    const spare = n.nav - longs;
    const start = v.team.navHist[0];
    return h('div', { class: 'card', 'data-tip': 'fund' },
      h('div', { class: 'eyebrow' }, 'Your fund'),
      h('div', { class: 'kpis', style: { marginTop: '8px' } },
        h('div', { class: 'kpi' }, h('div', { class: 'k' }, 'Fund value'), h('div', { class: 'v num', 'data-nav': String(n.nav) }, fmtCr(n.nav)), h('div', { class: 's' }, 'since the start ', pct((n.nav / start - 1) * 100, { dp: 1 }))),
        h('div', { class: 'kpi' }, h('div', { class: 'k' }, spare >= 0 ? 'Spare cash' : 'Borrowed'), h('div', { class: 'v num' }, fmtCr(Math.abs(spare))), h('div', { class: 's' }, spare >= 0 ? `earns ${fmtNum(RULES.cashRatePct)}% a year` : `costs ${fmtNum(RULES.cashRatePct + 1)}% a year`)),
        h('button', { class: 'kpi click', onclick: () => riskSheet(n.risk) }, h('div', { class: 'k' }, 'Risk Used'), h('div', { class: `v num ${n.risk.pct > 100 ? 'down' : n.risk.pct > 85 ? 'warn' : ''}` }, `${fmtNum(n.risk.pct)}%`), h('div', { class: 's' }, `limit 100% · multiplier ×${fmtNum(n.risk.M)} · show working`)),
        h('div', { class: 'kpi' }, h('div', { class: 'k' }, 'Exposure'), h('div', { class: 'v num' }, `${fmtNum(n.exposure ?? 0)}×`), h('div', { class: 's' }, `${fmtCr(n.gross)} of ${fmtCr(n.nav * 3)} allowed`))),
      n.risk.pct > 100 ? h('div', { class: 'crisis-banner', style: { marginTop: '12px' } }, h('div', { class: 'eyebrow' }, 'Above the risk limit'), 'If Risk Used is still above 100% at the bell, the system will close your largest positions until it falls to 80%, at a price 2% worse than the market, and record a forced liquidation (−5 points).') : null,
      n.pnlSoFar ? h('div', { class: 'panel', style: { marginTop: '12px' } }, h('div', { class: 'eyebrow' }, 'Moves so far this round'), h('p', { class: 'small' }, 'Crises and trading costs since the window opened: ', money(n.pnlSoFar)), pnlTable(n.led)) : null,
      v.team.navHist.length > 1 ? h('div', { style: { marginTop: '12px' } }, h('div', { class: 'eyebrow' }, 'Fund value by round'), sparkline(v.team.navHist.map((x) => x / CR), { w: 320, h: 60 })) : null);
  }

  // ---------------- results pane ----------------
  function resultsPane(v, n) {
    const r = v.result; const mine = v.myResult;
    if (!r) return h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Results'), h('p', {}, 'After the bell, your full profit and loss, every central bank decision and why prices moved appear here.'));
    const fq = v.team?.forecasts?.[r.q - 1];
    return h('div', { class: 'stack' },
      h('div', { class: 'card', 'data-tip': 'results' },
        h('div', { class: 'row between' }, h('div', {}, h('div', { class: 'eyebrow' }, `Results · Round ${r.q}`), h('h3', { style: { margin: 0 } }, 'Profit and loss')), mine ? h('div', { class: 'right' }, h('div', { class: 'small muted' }, `${fmtCr(mine.navOpen)} → ${fmtCr(mine.navEnd)}`), h('b', {}, money(mine.pnl))) : null),
        mine ? h('div', { style: { marginTop: '10px' } },
          mine.forced ? h('div', { class: 'crisis-banner' }, h('div', { class: 'eyebrow' }, 'Forced liquidation'),
            h('p', { class: 'small' }, `Risk Used was ${fmtNum(mine.forced.before)}% at the bell, so the system closed ${mine.forced.closed.map((c) => `${fmtCr(Math.abs(c.amount))} of ${INST[c.id].short}`).join(', ')} at 2% worse than the market, bringing it to ${fmtNum(mine.forced.after)}%. Penalty ${fmtRupees(mine.forced.penalty)}; Risk Discipline −5.`),
            h('button', { class: 'why', onclick: () => riskSheet(mine.riskBell, { title: 'Risk Used at the bell' }) }, 'show working')) : null,
          pnlTable(mine.ledger, { onLine: (id, l) => pnlSheet(id, l) }),
          h('p', { class: 'tiny muted' }, 'Tap any line for the full sum. Price + currency + carry − costs + crowd − forced-sale penalty, exact to the paisa.'))
          : h('p', { class: 'muted' }, 'Loading your results…')),
      h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Central bank decisions'), h('p', { class: 'small muted' }, 'Tap one to see its rule with this round’s numbers filled in, step by step.'), decisionsRow(r.decisions)),
      h('div', { class: 'card', 'data-tip': 'why' }, h('div', { class: 'eyebrow' }, 'Why did prices move?'), whyPanel(r)),
      fq?.points !== undefined ? h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, `Forecast marked · Round ${r.q - 1}`), forecastBlock(fq)) : null,
      h('p', { class: 'small muted' }, `Your Round ${r.q} forecast is marked ${r.q >= (practice ? 2 : RULES.rounds) ? 'by the final release' : 'when the next data drops'}.`));
  }

  // ---------------- score pane: your own fund only ----------------
  // There is no leaderboard on the desk. Other funds' values and scores are never sent
  // to a team; the final standings appear only after the Event Head reveals them.
  function scorePane(v) {
    const t = v.team;
    const mine = v.final?.standings?.rows?.find((r) => r.id === v.teamId) || null;
    const n = v.final?.standings?.rows?.length || 0;
    return h('div', { class: 'stack' },
      mine ? h('div', { class: 'card', style: { borderColor: 'var(--gold-bright)' }, 'data-my-final': '1' },
        h('div', { class: 'eyebrow' }, 'Results revealed'),
        h('div', { class: 'row between' }, h('div', {}, h('div', { class: 'num', style: { fontSize: '44px', fontFamily: 'var(--font-display)', fontWeight: 600 } }, fmtNum(mine.total, 1)), h('div', { class: 'small muted' }, 'SPECULA Score out of 100')),
          h('div', { style: { textAlign: 'right' } }, h('div', { class: 'num', style: { fontSize: '44px', fontFamily: 'var(--font-display)', fontWeight: 600, textAlign: 'right' }, 'data-my-rank': String(mine.rank) }, ordinal(mine.rank)), h('div', { class: 'small muted' }, `of ${n} funds`))),
        h('button', { class: 'btn sm', style: { marginTop: '8px' }, onclick: () => scoreSheet(mine) }, 'Show the full working')) : null,
      h('div', { class: 'card', 'data-tip': 'score' },
        h('div', { class: 'row between' }, h('div', { class: 'eyebrow' }, 'Your fund’s record'), h('span', { class: 'badge' }, 'only your fund')),
        t && t.navHist?.length > 1 ? myRecord(t, { final: mine }) : h('p', { class: 'muted' }, 'Your record appears after the first round settles. You will only ever see your own fund here: results are sealed until the end.')),
      newsCard(v));
  }
  function newsCard(v) {
    const st = v.qdoc?.run?.stages || [];
    if (!st.length && !(v.qdoc?.run?.headlines || []).length) return null;
    return h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'News this round'),
      st.slice().reverse().map((s) => h('div', { style: { margin: '10px 0' } }, h('b', {}, s.headline), (s.posts || []).map((p) => postEl(p)))),
      (v.qdoc?.run?.headlines || []).map((t) => h('p', { class: 'small' }, t)));
  }

  const unsub = adapter.subscribe(() => render());
  render();
  return () => { unsub && unsub(); clearInterval(clockTimer); document.querySelector('.takeover')?.remove(); };
}

function ordinal(n) { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; }

function pxOf(x, px) {
  if (x.kind === 'fx') return px.fx[x.econ];
  if (x.kind === 'future') return px.fut[x.econ];
  if (x.kind === 'cds') return px.cds[x.id];
  const lp = px.lp[x.id];
  return x.ccy ? lp * px.fx[x.ccy] : lp;
}
function familyLabel(f) { return FAMILIES.find((x) => x.id === f)?.name || ''; }
function labelOf(k) { return { g: 'growth', pi: 'inflation', u: 'unemployment', b: 'budget', ca: 'current account', debt: 'debt', reserves: 'reserves', oilOutput: 'oil output', harvest: 'harvest', bankShare: 'banks’ share of bonds', badLoans: 'bad loans' }[k] || k; }

function keepInputs(root) {
  const out = {};
  const a = document.activeElement;
  root.querySelectorAll('[data-keep]').forEach((el) => { out[el.dataset.keep] = { value: el.value, focus: el === a, s: el.selectionStart }; });
  return out;
}
function restoreInputs(root, keep) {
  root.querySelectorAll('[data-keep]').forEach((el) => {
    const k = keep[el.dataset.keep];
    if (!k) return;
    el.value = k.value;
    if (k.focus) { el.focus(); try { el.setSelectionRange(k.s, k.s); } catch { /* number inputs */ } }
  });
}
