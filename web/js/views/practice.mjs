// Guided practice: two made-up rounds on this device only, against three practice bots.
import { h, mount, toast, sstore } from '../ui.mjs';
import { createDesk } from './deskcore.mjs';
import { PRACTICE } from '../../src/practice/scenario.mjs';
import { newGame, openQuarter, fireStage, settleQuarter, finalRelease, stagesFor, checkOrder, deskNow } from '../../src/engine/game.mjs';
import { carryRates, rupeePrice } from '../../src/engine/market.mjs';
import { ruleText, smoothingText } from '../../src/engine/macro.mjs';
import { ECON_ORDER } from '../../src/config/economies.mjs';
import { INST_IDS } from '../../src/config/instruments.mjs';
import { BOTS, rng, ordersFor } from '../../src/bots/bots.mjs';

const ME = 'you';
const BOT_TEAMS = [['p1', 'Practice Fund Alpha', 'reader'], ['p2', 'Practice Fund Beta', 'cautious'], ['p3', 'Practice Fund Gamma', 'random']];
const WINDOW_MS = 120000; // practice windows are short; the real game's are ten minutes

const TIPS = [
  { phase: 'data', target: 'data', text: 'This is the data release. Every round starts here: growth, inflation, unemployment, the policy rate, the budget and the current account for all six economies. Small “exp” numbers show what forecasters expected — the gap is the surprise. Tap any figure to see exactly how it was worked out.' },
  { phase: 'data', target: 'rules', text: 'These are the central bank rules. At settlement each bank plugs this release into its rule. If you work it out first, you know what rates will do before the market does.' },
  { phase: 'open', target: 'markets', text: 'The window is open: two minutes to trade in practice (ten in the real game). Tap any instrument to see its price, what holding it earns or costs, a worked example, and the trade ticket. Try buying something now.' },
  { phase: 'open', target: 'notes', text: 'Trading notes are compulsory: every order needs a sentence on why you are making it, now. They collect here, round by round, so you can check your reasoning after the bell. Only your fund and the Event Head can read them.', tab: 'trade' },
  { phase: 'open', target: 'forecast', text: 'Each round has one forecast. Up to 10 points; you lose 1 point for every 0.1 you are off. Hint: a policy-rate question is answered by the rule you just read.', tab: 'trade' },
  { phase: 'open', target: 'fund', text: 'Your fund: value, spare cash, exposure (limit 3×) and Risk Used (limit 100%). Tap Risk Used to see the full working. Above 100% at the bell means forced liquidation.', tab: 'fund' },
  { phase: 'results', target: 'results', text: 'The bell rang and the market settled. Every line of your profit and loss opens into a sum you can check with a calculator: price change, currency effect, carry, trading cost and crowd impact.', tab: 'results' },
  { phase: 'results', target: 'why', text: '“Why did prices move?” links each big move to its cause — a rate decision, a growth surprise, oil, a crisis or the crowd. Tap a central bank decision above to see its rule worked step by step.', tab: 'results' },
  { phase: 'crisis', target: 'fund', text: 'A crisis! Prices moved at once and the crisis multiplier raised everyone’s Risk Used. Check yours before the bell — you can still trade.', tab: 'fund' },
  { phase: 'final', target: 'score', text: 'Practice over. The SPECULA Score: 60 for risk-adjusted return, 25 for forecasts, 15 for risk discipline. In the real game there is no leaderboard: you see only your own fund, and the Event Head reveals the standings at the end. Tap “Show the full working” to see every step. You are ready for the real thing.', tab: 'score' },
];

export default function practice(app, { band }) {
  let g = null; let listeners = new Set(); let destroyDesk = null; let ticker = null;
  const tipDone = new Set(sstore('specula-practice-tips') || []);
  const emit = () => { for (const f of listeners) f(); };

  function newPractice() {
    const teams = [{ id: ME, name: 'Your Practice Fund' }, ...BOT_TEAMS.map(([id, name]) => ({ id, name }))];
    let world = newGame(teams, PRACTICE);
    world = openQuarter(world, PRACTICE, 1);
    g = { world, journal: [], phase: 'data', orders: { [ME]: [], p1: [], p2: [], p3: [] }, forecast: null, bid: null, endsAt: null, results: {}, lastResult: null, v: 1, crisisAt: null, rand: rng(7) };
  }

  function qdoc() {
    const w = g.world;
    return {
      q: w.run ? w.run.q : w.q, release: w.release, run: w.run ? { ...w.run, stages: stagesFor(PRACTICE, w.run.q).filter((s) => w.run.fired.includes(s.id)).map((s) => ({ ...s, revisions: [] })) } : null,
      mkt: w.mkt, sigma: w.sigma, round: w.round,
      rules: Object.fromEntries(ECON_ORDER.map((e) => [e, { rule: ruleText(e, w.round.mods), smoothing: smoothingText(e, w.round.mods) }])),
      carry: carryRates(w.mkt), lastPx: w.run ? w.lastPx : (w.prevPx || w.lastPx),
      prices: Object.fromEntries(INST_IDS.map((id) => [id, rupeePrice(w.mkt, id)])),
    };
  }

  const adapter = {
    view: () => {
      const w = g.world;
      const clock = g.phase === 'open' ? Math.max(0, g.endsAt - Date.now()) : null;
      return {
        phase: g.phase, q: w.run ? w.run.q : w.q, round: 1, v: g.v, ordersRev: g.orders[ME].length, docKey: String(g.v),
        clock, paused: false, qdoc: qdoc(), team: w.teams[ME], teamId: ME, teamName: 'Your Practice Fund', members: [],
        orders: g.phase === 'open' || g.phase === 'data' ? g.orders[ME] : [], forecastSaved: g.forecast, bidSaved: g.bid,
        result: g.lastResult, myResult: g.lastResult ? g.results[g.lastResult.q]?.teams[ME] : null,
        final: w.final ? { standings: w.final.standings } : null, history: w.history,
        journal: g.journal, loanRequests: [],
      };
    },
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    placeOrder: async (o) => {
      if (g.phase !== 'open' || Date.now() > g.endsAt) return { ok: false, reason: 'The window is closed. Late orders are refused.' };
      if (String(o.note || '').replace(/\s+/g, ' ').trim().length < 8) return { ok: false, reason: 'A trading note is compulsory: write why you are making this trade, now.' };
      const c = checkOrder(g.world, ME, g.orders[ME], o);
      if (!c.ok) return { ok: false, reason: c.reason };
      g.orders[ME].push({ id: `p${g.v}`, inst: o.inst, side: o.side, delta: c.delta, epoch: c.epoch, by: 'You', at: Date.now(), note: String(o.note).trim() });
      g.v++; emit();
      return { ok: true };
    },
    setForecast: async (value) => { if (g.phase !== 'open') return { ok: false, reason: 'The window is closed.' }; g.forecast = value; g.v++; emit(); return { ok: true }; },
    setBid: async () => ({ ok: false, reason: 'There is no auction in practice.' }),
    requestLoan: async () => ({ ok: false, reason: 'In the real game you can ask the Event Head for a loan here.' }),
    cancelLoan: async () => ({ ok: false, reason: 'Not in practice.' }),
    repayLoan: async () => ({ ok: false, reason: 'Not in practice.' }),
  };

  function botsTrade() {
    const w = g.world;
    for (const [id, , bot] of BOT_TEAMS) {
      const now = deskNow(w, id, g.orders[id]);
      const d = BOTS[bot].decide({ world: w, teamId: id, q: w.run.q, epoch: w.run.epochs.length - 1, nav: now.nav, rand: g.rand, forecastSpec: w.run.forecast });
      if (d) g.orders[id].push(...ordersFor(w, id, g.orders[id], d.targets, w.run.epochs.length - 1, checkOrder));
    }
  }

  const act = {
    open() { g.phase = 'open'; g.endsAt = Date.now() + WINDOW_MS; botsTrade(); if (stagesFor(PRACTICE, g.world.run.q).length) g.crisisAt = Date.now() + 35000; g.v++; emit(); },
    crisis() {
      for (const s of stagesFor(PRACTICE, g.world.run.q)) if (!g.world.run.fired.includes(s.id)) g.world = fireStage(g.world, PRACTICE, s.id).world;
      g.crisisAt = null; botsTrade(); g.v++; emit(); showTip('crisis');
    },
    bell() {
      if (g.crisisAt) act.crisis();
      const w = g.world;
      const forecasts = { [ME]: g.forecast };
      for (const [id, , bot] of BOT_TEAMS) forecasts[id] = BOTS[bot].forecast({ world: w, teamId: id, q: w.run.q, rand: g.rand, forecastSpec: w.run.forecast });
      const res = settleQuarter(w, PRACTICE, { orders: g.orders, forecasts, bids: {} });
      g.world = res.world; g.results[res.result.q] = res.result;
      g.journal = [...g.journal, { q: res.result.q, orders: g.orders[ME].map((x) => ({ ...x })) }];
      g.lastResult = { ...res.result, funds: {} };
      g.phase = 'results'; g.endsAt = null; g.v++; emit();
    },
    next() {
      if (g.world.q >= PRACTICE.quarters.length) { g.world = finalRelease(g.world, PRACTICE); g.phase = 'final'; g.v++; emit(); return; }
      g.world = openQuarter(g.world, PRACTICE, g.world.q + 1);
      g.orders = { [ME]: [], p1: [], p2: [], p3: [] }; g.forecast = null; g.phase = 'data'; g.v++; emit();
    },
  };

  function controls() {
    const p = g.phase;
    const box = h('div', { class: 'card tight no-print', style: { position: 'fixed', right: '12px', top: '72px', zIndex: 40, maxWidth: '260px', borderColor: 'var(--gold-bright)' } },
      h('div', { class: 'eyebrow' }, 'Practice controls'),
      h('p', { class: 'tiny muted', style: { margin: '4px 0 8px' } }, 'In the real game the Event Head does this.'),
      p === 'data' ? h('button', { class: 'btn sm block', 'data-practice': 'open', onclick: act.open }, 'Open the window') : null,
      p === 'open' && g.crisisAt ? h('button', { class: 'btn sm block danger', style: { marginTop: '6px' }, 'data-practice': 'crisis', onclick: act.crisis }, 'Release the practice crisis') : null,
      p === 'open' ? h('button', { class: 'btn sm block ghost', style: { marginTop: '6px' }, 'data-practice': 'bell', onclick: act.bell }, 'Ring the bell now') : null,
      p === 'results' ? h('button', { class: 'btn sm block', 'data-practice': 'next', onclick: act.next }, g.world.q >= PRACTICE.quarters.length ? 'See the final score' : 'Next round') : null,
      p === 'final' ? h('a', { class: 'btn sm block', href: '#/desk' }, 'Join the real game') : null,
      h('button', { class: 'linkish tiny', style: { marginTop: '8px' }, onclick: () => { sstore('specula-practice-tips', []); tipDone.clear(); newPractice(); g.v++; emit(); } }, 'Restart practice'));
    return box;
  }

  let tipEl = null;
  function showTip(phase) {
    const tip = TIPS.find((t, i) => t.phase === phase && !tipDone.has(i));
    if (!tip || tipEl) return;
    const i = TIPS.indexOf(tip);
    if (tip.tab) document.querySelector(`[data-tab="${tip.tab}"]`)?.click();
    const target = document.querySelector(`[data-tip="${tip.target}"]`);
    if (target) { target.classList.add('hl'); target.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    tipEl = h('div', { class: 'tip', role: 'dialog', 'aria-label': 'Tip' },
      h('div', { class: 'eyebrow' }, `Tip ${i + 1} of ${TIPS.length}`), h('p', { style: { margin: '6px 0 10px' } }, tip.text),
      h('div', { class: 'row' }, h('button', { class: 'btn sm', 'data-tip-ok': '1', onclick: () => {
        tipDone.add(i); sstore('specula-practice-tips', [...tipDone]); target?.classList.remove('hl'); tipEl.remove(); tipEl = null; setTimeout(() => showTip(g.phase), 150);
      } }, 'Got it'), h('button', { class: 'linkish tiny', onclick: () => { TIPS.forEach((_, k) => tipDone.add(k)); sstore('specula-practice-tips', [...tipDone]); target?.classList.remove('hl'); tipEl.remove(); tipEl = null; } }, 'Skip all tips')));
    document.body.appendChild(tipEl);
  }

  function intro() {
    mount(app, band('practice'), h('main', { class: 'narrow', style: { padding: '40px 16px 80px' } },
      h('div', { class: 'eyebrow' }, 'Guided practice'), h('h1', {}, 'Two practice rounds'),
      h('p', { class: 'lead' }, 'Learn the desk on a made-up scenario before the real game. It runs on this device only, against three practice funds, with tips explaining each part of the desk.'),
      h('ul', {}, h('li', {}, 'The numbers and news are invented for practice and are not the real game.'), h('li', {}, 'You control the clock: open the window, release the practice crisis, ring the bell.'), h('li', {}, 'Everything is calculated exactly as in the live game.')),
      h('button', { class: 'btn lg', 'data-practice': 'start', onclick: () => { newPractice(); run(); } }, 'Start practice')));
  }

  function run() {
    destroyDesk = createDesk(app, adapter, {
      band, practice: true,
      onRender: () => { document.querySelector('.practice-controls')?.remove(); const c = controls(); c.classList.add('practice-controls'); document.body.appendChild(c); setTimeout(() => showTip(g.phase), 400); },
    });
    ticker = setInterval(() => {
      if (g.phase === 'open' && g.crisisAt && Date.now() > g.crisisAt) act.crisis();
      if (g.phase === 'open' && Date.now() > g.endsAt + 300) act.bell();
    }, 500);
  }

  intro();
  return () => { if (destroyDesk) destroyDesk(); clearInterval(ticker); document.querySelector('.practice-controls')?.remove(); tipEl?.remove(); };
}
