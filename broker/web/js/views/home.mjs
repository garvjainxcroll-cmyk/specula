// Home: the hero, the ten stocks (live), how a team starts and how the game works.
import { h, set } from '../dom.mjs';
import { get } from '../net.mjs';
import { ensure, series, tick } from '../series.mjs';
import { amt, pct, dir, arrow } from '../fmt.mjs';
import { STOCKS } from '../../src/stocks.mjs';
import { spark } from '../chart.mjs';
import { band, gameName, setGame } from '../site.mjs';

export const START_STATS = [
  ['₹10,00,000', 'Every team’s paper money, all in cash'], ['10', 'Listed companies, nothing else'], ['Live', 'Prices move every second'],
  ['₹0', 'Brokerage on every order'], ['₹0.05', 'The smallest price step'], ['1 team', 'Many members, one shared desk'],
];
export const GAME_STEPS = [
  ['Join Your Team', 'The host gives each team a private code. Open Team Desk, type the code and your name. Every member can sign in on their own device.'],
  ['Watch the Market', 'Ten companies, prices moving every second. Charts with the high and low over the time you choose, and how far each stock is from the open.'],
  ['Buy and Sell', 'Market orders in whole shares at the live price. Any member’s order is the team’s order. No brokerage.'],
  ['Read the Updates', 'The host posts news in the Updates tab, numbered in order. News can move the market.'],
  ['Mind the Loans', 'The host may move money between teams as a loan. It comes back with interest at a deadline, automatically.'],
  ['Results', 'Your desk shows only your team’s money. The standings stay sealed until the host reveals them at the end.'],
];

export default function home(app) {
  const cards = {};
  const grid = h('div', { class: 'stock-grid' }, STOCKS.map((s) => {
    const px = h('span', { class: 'px num', text: amt(s.base) }); const ch = h('span', { class: 'ch num' }); const c = h('canvas', { 'aria-hidden': 'true' });
    cards[s.t] = { px, ch, c };
    return h('a', { class: 'stock-card', href: '#/desk' }, h('span', { class: 'tk', text: s.t }), px,
      h('span', { class: 'nm', text: s.name }), c, h('span', { class: 'sector', text: s.sector }), ch);
  }));
  const TAGLINE = 'Ten companies. One live market.';
  const title = h('h1', { text: gameName() || TAGLINE });
  const leadText = () => (gameName() ? `${TAGLINE} Every team starts equal.` : 'Every team starts equal.');
  const lead = h('p', { class: 'lead', style: { fontStyle: 'italic' }, text: leadText() });
  const hostLink = h('a', { href: '#/host', text: 'Host console', hidden: true });
  app.replaceChildren(
    band(''),
    h('section', { class: 'hero' }, h('div', { class: 'art', 'aria-hidden': 'true' }), h('div', { class: 'inner' },
      h('p', { class: 'eyebrow', text: 'Paper trading · a live market' }),
      title,
      lead,
      h('p', { class: 'lead', text: 'Each team runs a trading desk with ₹10,00,000 of paper money. Prices move every second; news from the host can move them further. Buy, sell, read the market, and finish with more than you started with.' }),
      h('div', { class: 'row', style: { marginTop: '24px' } },
        h('a', { class: 'btn lg', href: '#/desk', text: 'Join your team' }),
        h('a', { class: 'btn lg ghost', href: '#/learn', text: 'How to play' })))),
    h('main', { class: 'wrap' },
      h('h2', { class: 'sec-title', text: 'The Ten Stocks' }),
      h('p', { class: 'muted', style: { marginTop: '-6px' }, text: 'Live prices. Nothing else is listed.' }),
      grid,
      h('h2', { class: 'sec-title', text: 'Every Team Starts Equal' }),
      h('div', { class: 'big-stats' }, START_STATS.map(([b, t]) => h('div', { class: 's' }, h('b', { text: b }), h('span', { class: 'muted small', text: t })))),
      h('h2', { class: 'sec-title', text: 'How the Game Works' }),
      h('ol', { class: 'step-list' }, GAME_STEPS.map(([t, d]) => h('li', {}, h('h4', { text: t }), h('span', { class: 'small', text: d })))),
      h('div', { class: 'footer-links' }, h('span', { text: 'For the hall:' }), h('a', { href: '#/display', text: 'Big Screen' }), hostLink)));
  // the console link appears once the host has chosen a password (it is opened directly the first time)
  get('host/status').then((r) => { hostLink.hidden = !r.setup; }).catch(() => {});

  const refresh = async () => {
    try {
      const r = await get('market');
      if (!r.ok) return;
      setGame(r.game); set(title, gameName() || TAGLINE); set(lead, leadText());
      if (tick(r.mk, r.now) || !series('30m')) await ensure('30m');
      const sp = series('30m');
      for (const s of STOCKS) {
        const p = r.mk.p[s.t]; const o = r.mk.o[s.t]; const c = ((p - o) / o) * 100;
        set(cards[s.t].px, `₹${amt(p)}`);
        set(cards[s.t].ch, `${arrow(c)} ${pct(c)}`); cards[s.t].ch.className = `ch num ${dir(c)}`;
        if (sp) spark(cards[s.t].c, sp.p[s.t], dir(sp.p[s.t].at(-1) - sp.p[s.t][0]));
      }
    } catch { /* offline: the cards wait */ }
  };
  refresh();
  const t = setInterval(refresh, 3000);
  return () => clearInterval(t);
}
