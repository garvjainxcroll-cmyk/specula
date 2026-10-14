// The Big Screen (#/display), for a 1920×1080 projector in the hall. It shows only what
// is public: prices, the host's updates, the team names and how many have signed in.
// No team's money appears here until the host reveals the results at the end.
import { h, set, swap, tickText } from '../dom.mjs';
import { get, net, loop } from '../net.mjs';
import { amt, pct, dir, arrow, rs, signedRs, when } from '../fmt.mjs';
import { STOCKS } from '../../src/stocks.mjs';
import { ensure, series, tick } from '../series.mjs';
import { spark } from '../chart.mjs';
import { setGame, gameName, fmtLeft } from '../site.mjs';

const pad = (n) => String(n).padStart(2, '0');
const ord = (n) => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1) && n % 10] || 'th'}`;

export default function display(app) {
  document.documentElement.dataset.theme = 'dark';
  const D = { board: null, prev: null, updates: [], uv: -1 };
  const title = h('div', { class: 'bs-title', text: gameName() });
  const sub = h('div', { class: 'bs-sub', text: 'Live market' });
  const bigclock = h('div', { class: 'bigclock word', text: '—' });
  const body = h('div', { class: 'bs-body' });
  app.replaceChildren(h('div', { class: 'bigscreen' }, h('div', { class: 'bs-top' }, h('div', {}, title, sub), bigclock), body));

  // the stock board, built once and updated in place
  const rows = {};
  const board = h('table', { class: 'board' }, h('tbody', {}, STOCKS.map((s) => {
    const px = h('td', { class: 'px' }); const ch = h('td', { class: 'ch' }); const c = h('canvas', { 'aria-hidden': 'true' });
    rows[s.t] = { px, ch, c };
    return h('tr', {}, h('td', { class: 'tk', text: s.t }), h('td', { class: 'nm', text: s.name }), h('td', {}, c), px, ch);
  })));
  const boardCard = h('div', { class: 'dcard' }, h('h2', { text: 'The market' }), board);
  const newsList = h('ul', { class: 'ticker' });
  const newsCard = h('div', { class: 'dcard' }, h('h2', { text: 'Updates' }), newsList);
  const teamsLive = h('div', { class: 'teams' });
  const teamsCard = h('div', { class: 'dcard' }, h('h2', { class: 'teams-live-title', text: 'Teams' }), teamsLive);

  let mode = ''; let revealShown = 0; let revealTimer = null;

  function drawBoard() {
    const b = D.board; const sp = series('30m');
    for (const s of STOCKS) {
      const p = b.mk.p[s.t]; const o = b.mk.o[s.t]; const c = ((p - o) / o) * 100;
      tickText(rows[s.t].px, `₹${amt(p)}`, D.prev ? p - D.prev.mk.p[s.t] : 0);
      rows[s.t].px.classList.add('px');
      set(rows[s.t].ch, `${arrow(c)} ${pct(c)}`); rows[s.t].ch.className = `ch ${dir(c)}`;
      if (sp) spark(rows[s.t].c, sp.p[s.t], dir(sp.p[s.t].at(-1) - sp.p[s.t][0]));
    }
  }
  function drawNews() {
    const list = D.updates.slice(-3).reverse();
    swap(newsList, list.length ? list.map((u) => h('li', {}, h('b', { text: `Update ${pad(u.n)} · ${when(u.at)}` }), u.text.length > 220 ? `${u.text.slice(0, 220)}…` : u.text))
      : h('li', { class: 'muted', text: 'No updates yet. News from the host appears here.' }));
  }

  function render() {
    const b = D.board; if (!b) return;
    const g = b.game;
    setGame(g); set(title, gameName());
    set(sub, g.phase === 'lobby' ? `Paper trading · ${b.teams.length} team${b.teams.length === 1 ? '' : 's'}` : g.phase === 'ended' ? 'The game is over' : `Live market · ${b.teams.length} teams`);
    const m = g.phase === 'lobby' ? 'lobby' : g.phase === 'ended' ? (g.revealed && b.standings ? 'reveal' : 'sealed') : 'live';
    if (m !== mode) {
      mode = m;
      clearInterval(revealTimer); revealShown = 0;
      if (m === 'lobby') {
        swap(body, h('div', { class: 'cols' },
          h('div', { class: 'dcard' }, h('h2', { text: 'Join your team' }),
            h('p', { class: 'join', text: 'On your phone or laptop open' }), h('p', { class: 'codebox', text: `${location.host}/#/desk` }),
            h('p', { class: 'join', text: 'and type your team’s private code and your name.' }),
            h('p', { class: 'muted', style: { fontSize: '24px' }, text: 'Every team starts with ₹10,00,000 of paper money. Read How to Play while you wait.' })),
          h('div', { class: 'dcard teams-card' }, h('h2', { class: 'teams-title' }), h('div', { class: 'teams' }))),
          boardCard);
      } else if (m === 'live') {
        swap(body, h('div', { class: 'cols' }, boardCard, h('div', { style: { display: 'grid', gap: '26px' } }, newsCard, teamsCard)));
      } else if (m === 'sealed') {
        swap(body, h('div', { class: 'dcard', style: { textAlign: 'center' } }, h('div', { class: 'huge', text: 'Market closed' }),
          h('p', { class: 'join', text: 'The game is over. Every team’s result is calculated and sealed until the host reveals the standings.' })),
        h('div', { class: 'cols' }, boardCard, newsCard));
      } else {
        const st = b.standings.slice().reverse(); // last place first, the winner last
        const tbody = h('tbody', {}, st.map((x) => h('tr', { class: `reveal${x.rank === 1 ? ' first' : ''}` },
          h('td', { class: 'rk', text: ord(x.rank) }), h('td', { text: x.name }),
          h('td', { class: 'num', style: { textAlign: 'right' }, text: rs(x.nw) }),
          h('td', { class: dir(x.pnl), style: { textAlign: 'right' }, text: `${arrow(x.pnl)} ${signedRs(x.pnl)} (${pct(x.pct)})` }))));
        swap(body, h('div', { class: 'dcard' }, h('h2', { text: 'Final standings' }), h('table', { class: 'standings' }, tbody)));
        const trs = [...tbody.children];
        revealTimer = setInterval(() => {
          if (revealShown >= trs.length) { clearInterval(revealTimer); return; }
          trs[revealShown++].classList.add('in');
        }, trs.length > 12 ? 600 : 1400);
      }
    }
    if (m === 'lobby') {
      const card = body.querySelector('.teams-card');
      set(card.querySelector('.teams-title'), `Teams · ${b.teams.length}`);
      const key = JSON.stringify(b.teams);
      if (card.dataset.key !== key) {
        card.dataset.key = key;
        swap(card.querySelector('.teams'), b.teams.length ? b.teams.map((t) => h('div', {}, h('span', { text: t.name }), h('span', { class: t.members ? 'up' : 'muted', text: t.members ? `${t.members} in` : '—' })))
          : h('p', { class: 'muted', text: 'The host is creating the teams.' }));
      }
    }
    if (m !== 'reveal') { drawBoard(); drawNews(); }
    if (m === 'live') {
      const key = JSON.stringify(b.teams);
      if (teamsCard.dataset.key !== key) {
        teamsCard.dataset.key = key;
        set(teamsCard.querySelector('.teams-live-title'), `Teams · ${b.teams.length}`);
        swap(teamsLive, b.teams.map((t) => h('div', {}, h('span', { text: t.name }), h('span', { class: 'muted', text: t.members ? `${t.members} trading` : '—' }))));
      }
    }
    drawClock();
  }

  function drawClock() {
    const b = D.board; if (!b) return;
    const g = b.game;
    if (g.phase === 'live' && b.mk.open && g.endsAt) {
      const left = g.endsAt - net.now();
      set(bigclock, fmtLeft(left));
      bigclock.className = `bigclock${left < 60000 ? ' closing' : ''}`;
    } else {
      set(bigclock, g.phase === 'lobby' ? 'JOIN' : g.phase === 'ended' ? 'FINAL' : b.mk.open ? 'OPEN' : 'CLOSED');
      bigclock.className = 'bigclock word';
    }
  }

  const poller = loop(async () => {
    const r = await get(`board?uv=${D.uv}`);
    if (!r.ok) return;
    D.prev = D.board; D.board = r;
    if (r.updates) { D.updates = r.updates; D.uv = r.uv; }
    if (tick(r.mk, r.now)) ensure('30m').then(render);
    render();
  }, 1500, 5000);
  ensure('30m').then(render);
  const t = setInterval(drawClock, 500);
  return () => { poller.stop(); clearInterval(t); clearInterval(revealTimer); };
}
