// The hand-history viewer: a finished hand, step by step. #/hand/ID, or as a dialog from the
// table. Shows your own cards, any hand that was shown, and folded hands only where the table
// allows it (or for the Event Head's audit).
import { h, mount, fmt, sheet, ago } from '../ui.mjs';
import { get } from '../net.mjs';
import { cardEl, miniCards } from '../cards.mjs';
import { logLines } from '../handlog.mjs';

export default async function handPage(app, { band, args }) {
  const box = h('div', { class: 'narrow page' }, h('p', { class: 'muted' }, 'Loading the hand…'));
  mount(app, band('hand'), box);
  const r = await get(`hand?id=${encodeURIComponent(args[0] || '')}`, { host: !!sessionStorage.getItem('artha-host') }).catch(() => ({ ok: false, error: 'No connection' }));
  if (!r.ok) { mount(box, h('h2', {}, 'Hand not found'), h('p', {}, r.error || ''), h('a', { class: 'btn', href: '#/profile' }, 'Your hands')); return null; }
  mount(box, replayer(r.hand));
  return null;
}

/** As a dialog: { id } (fetched) or { summary } (offline practice: the short summary only). */
export async function handSheet({ id, summary }) {
  if (summary) {
    sheet(`Hand #${summary.no}`, h('div', { class: 'stack' },
      h('div', {}, 'Board ', miniCards(summary.board)),
      h('table', { class: 'tbl' }, summary.players.map((p) => h('tr', {}, h('td', {}, p.name), h('td', {}, p.cards ? miniCards(p.cards) : h('span', { class: 'muted' }, p.folded ? 'folded' : 'not shown')), h('td', { class: `r num ${p.net > 0 ? 'up' : p.net < 0 ? 'down' : ''}` }, p.net > 0 ? `+${fmt(p.net)}` : fmt(p.net)))))), { wide: true });
    return;
  }
  const s = sheet('Hand history', h('p', { class: 'muted' }, 'Loading…'), { wide: true });
  const r = await get(`hand?id=${encodeURIComponent(id)}`, { host: !!sessionStorage.getItem('artha-host') }).catch(() => ({ ok: false, error: 'No connection' }));
  const body = s.box.lastChild;
  if (!r.ok) { mount(body, h('p', {}, r.error || 'This hand is not in the history yet — try again in a moment.')); return; }
  mount(body, replayer(r.hand), h('p', {}, h('a', { href: `#/hand/${encodeURIComponent(id)}`, onclick: () => s.close() }, 'Open on its own page')));
}

/** Rebuild the table step by step from the events. */
function states(rec) {
  const out = [];
  const stacks = {}; const bets = {}; const folded = new Set(); let board = []; let pot = 0;
  for (const p of rec.players) { stacks[p.seat] = p.start; bets[p.seat] = 0; }
  const snap = (label) => out.push({ label, stacks: { ...stacks }, bets: { ...bets }, folded: new Set(folded), board: board.slice(), pot });
  snap('Start');
  for (const e of rec.events) {
    if (e.t === 'post') { stacks[e.seat] -= e.amount; if (e.kind === 'ante') pot += e.amount; else bets[e.seat] += e.amount; snap(null); }
    else if (e.t === 'act') { if (e.type === 'fold') folded.add(e.seat); stacks[e.seat] -= e.amount; bets[e.seat] += e.amount; snap(null); }
    else if (e.t === 'return') { stacks[e.seat] += e.amount; bets[e.seat] -= e.amount; snap(null); }
    else if (e.t === 'street') { for (const s of Object.keys(bets)) { pot += bets[s]; bets[s] = 0; } board = e.board.slice(); snap(null); }
    else if (e.t === 'award' || e.t === 'win') { for (const s of Object.keys(bets)) { pot += bets[s]; bets[s] = 0; } stacks[e.seat] += e.amount; pot -= e.amount; snap(null); }
    else if (e.t === 'void') { for (const p of rec.players) { stacks[p.seat] = p.start; bets[p.seat] = 0; } pot = 0; snap(null); }
  }
  return out;
}

export function replayer(rec) {
  const youSeat = null;
  const lines = logLines(rec.events, { youSeat });
  const steps = states(rec);
  let k = steps.length - 1;
  const stage = h('div', {});
  const draw = () => {
    const st = steps[k];
    mount(stage,
      h('div', { class: 'row', style: { justifyContent: 'center', margin: '8px 0' } }, Array.from({ length: 5 }, (_, i) => (st.board[i] !== undefined ? cardEl(st.board[i]) : h('div', { class: 'pcard back', style: { opacity: 0.15 } })))),
      h('p', { class: 'center' }, 'Pot ', h('b', { class: 'num' }, fmt(st.pot + Object.values(st.bets).reduce((a, b) => a + b, 0)))),
      h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Seat', 'Player', 'Cards', 'Stack', 'Bet', 'Result'].map((x) => h('th', { class: ['Stack', 'Bet', 'Result'].includes(x) ? 'r' : '' }, x)))),
        rec.players.map((p) => h('tr', { style: st.folded.has(p.seat) ? { opacity: 0.5 } : null },
          h('td', { class: 'num muted' }, p.seat + 1 + (p.seat === rec.button ? ' D' : '')),
          h('td', {}, p.name, p.bot ? ' ' : '', p.bot ? h('span', { class: 'badge bot' }, 'Bot') : null),
          h('td', {}, p.cards ? miniCards(p.cards) : h('span', { class: 'muted small' }, p.folded ? 'folded, not shown' : 'not shown')),
          h('td', { class: 'r num' }, fmt(st.stacks[p.seat])),
          h('td', { class: 'r num' }, st.bets[p.seat] ? fmt(st.bets[p.seat]) : ''),
          h('td', { class: `r num ${p.net > 0 ? 'up' : p.net < 0 ? 'down' : ''}` }, k === steps.length - 1 ? (p.net > 0 ? `+${fmt(p.net)}` : fmt(p.net)) : '')))));
  };
  const slider = h('input', { type: 'range', min: 0, max: steps.length - 1, value: k, 'aria-label': 'Step through the hand', oninput: (e) => { k = Number(e.target.value); draw(); } });
  draw();
  return h('div', { class: 'stack' },
    h('div', {}, h('div', { class: 'eyebrow' }, `${rec.roomName} · table ${rec.table + 1} · ${ago(rec.at)}`), h('h3', { style: { margin: '4px 0' } }, `Hand #${rec.no}${rec.voided ? ' (cancelled)' : ''}`),
      h('div', { class: 'muted small' }, `Blinds ${fmt(rec.blinds.sb)}/${fmt(rec.blinds.bb)}${rec.blinds.ante ? `, ante ${fmt(rec.blinds.ante)}` : ''} · hand id ${rec.id}`)),
    stage,
    h('div', { class: 'row tight' },
      h('button', { class: 'btn sm ghost', onclick: () => { k = 0; slider.value = k; draw(); } }, 'Start'),
      h('button', { class: 'btn sm ghost', onclick: () => { k = Math.max(0, k - 1); slider.value = k; draw(); } }, 'Back'),
      h('button', { class: 'btn sm ghost', onclick: () => { k = Math.min(steps.length - 1, k + 1); slider.value = k; draw(); } }, 'Next'),
      h('button', { class: 'btn sm ghost', onclick: () => { k = steps.length - 1; slider.value = k; draw(); } }, 'End')),
    slider,
    h('h4', {}, 'Everything that happened'),
    h('div', { class: 'log', style: { maxHeight: '420px' } }, lines.map((l) => h('div', { class: `l ${l.cls}` }, l.nodes))));
}
