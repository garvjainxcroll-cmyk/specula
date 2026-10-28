// The Big Screen (#/screen/CODE), for a projector at 1920×1080: the featured table with its
// board and stacks, the tournament clock and blinds, chip leaders, prizes and table news.
// Public information only — hole cards appear only when they are turned face up.
import { h, mount, fmt, fmtClock, ordinal } from '../ui.mjs';
import { remoteRoom, left } from '../net.mjs';
import { Felt } from '../felt.mjs';

export default async function screen(app, { args, query }) {
  const code = args[0];
  const felt = new Felt({ big: true });
  let view = null;
  const top = h('div', { class: 'top' });
  const side = h('div', { class: 'side2' });
  const main = h('div', { style: { minWidth: 0, display: 'grid', alignContent: 'center' } }, felt.el);
  mount(app, h('div', { class: 'bigscreen' }, top, h('div', { class: 'body' }, main, side)),
    h('a', { class: 'btn sm ghost exit', href: '#/' }, 'Exit'));
  const pick = () => {
    const tables = view.tables;
    const want = Number(query.get('t'));
    if (Number.isInteger(want) && tables.find((t) => t.i === want - 1)) return tables.find((t) => t.i === want - 1);
    // the featured table: the one with the most chips in the middle right now
    return tables.slice().sort((a, b) => (b.hand?.pot || 0) - (a.hand?.pot || 0))[0];
  };
  const conn = remoteRoom({ code }, (v) => {
    view = v;
    const t = pick();
    if (t) felt.update(v, t);
    draw();
  }, { screen: true });
  const clock = setInterval(() => view && draw(), 500);

  function draw() {
    const v = view;
    const tr = v.tour;
    const blinds = tr ? tr.blinds : v.cfg;
    const ms = tr ? (tr.status === 'paused' ? tr.pausedLeft : left(tr.levelEndsAt)) : null;
    const t = pick();
    mount(top,
      h('img', { src: 'img/crest.png', alt: '' }),
      h('div', {}, h('div', { class: 'ttl' }, v.name), h('div', { class: 'sub' }, tr ? `Tournament · level ${String(tr.level).padStart(2, '0')} · ${fmt(blinds.sb)}/${fmt(blinds.bb)}${blinds.ante ? ` · ante ${fmt(blinds.ante)}` : ''}` : `No-Limit Hold’em · blinds ${fmt(blinds.sb)}/${fmt(blinds.bb)}${t?.handNo ? ` · hand #${t.handNo}` : ''}`)),
      tr && ['running', 'paused'].includes(tr.status) ? h('div', { class: 'clockbox' }, h('div', { class: 't' }, tr.status === 'paused' ? 'PAUSED' : fmtClock(ms)), h('div', { class: 'l' }, tr.next ? `Next: ${fmt(tr.next.sb)}/${fmt(tr.next.bb)}${tr.next.ante ? ` · ${fmt(tr.next.ante)}` : ''}` : 'Final level')) : null);
    const kids = [];
    const joinBox = h('div', { class: 'box' }, h('h3', {}, tr && tr.status !== 'registering' ? 'Watch or register late' : 'Join this game'), h('div', { class: 'lead2' }, `${location.host}/#/t/`), h('div', { class: 'code' }, v.code));
    if (tr) {
      if (tr.status === 'registering') {
        kids.push(joinBox, h('div', { class: 'box' }, h('h3', {}, `${tr.entrants} registered`), h('div', { class: 'lead2' }, `Starting stack ${fmt(tr.startingStack)} · ${tr.levels} levels · ${tr.schedule[0].minutes} minutes each`), h('p', { class: 'lead2', style: { marginTop: '1vh' } }, tr.registered.slice(0, 40).map((e) => e.name).join(' · '))));
      } else if (tr.status === 'finished') {
        kids.push(h('div', { class: 'box' }, h('h3', {}, 'Final results'), h('table', { class: 'tbl' }, tr.results.slice(0, 10).map((r) => h('tr', {}, h('td', {}, ordinal(r.place)), h('td', {}, r.name), h('td', { class: 'r num' }, r.prize ? `${fmt(r.prize)} ${tr.prize === 'chips' ? 'chips' : 'pts'}` : ''))))));
      } else {
        kids.push(h('div', { class: 'box' }, h('h3', {}, `${tr.left} of ${tr.entrants} players left`), h('div', { class: 'lead2' }, `Average stack ${fmt(tr.avgStack)} · ${tr.tables} table${tr.tables === 1 ? '' : 's'}${tr.lateRegOpen ? ' · late registration open' : ''}`)),
          h('div', { class: 'box' }, h('h3', {}, 'Chip leaders'), h('table', { class: 'tbl' }, tr.standings.slice(0, 8).map((s, i) => h('tr', {}, h('td', { class: 'num' }, i + 1), h('td', {}, s.name), h('td', { class: 'r num' }, fmt(s.chips)))))),
          h('div', { class: 'box' }, h('h3', {}, 'Prizes'), h('div', { class: 'lead2' }, tr.prizes.slice(0, 6).map((p, i) => `${ordinal(i + 1)} ${fmt(p)}`).join(' · '), ` ${tr.prize === 'chips' ? 'chips' : 'points'}`)));
        if (tr.lateRegOpen) kids.push(joinBox);
      }
    } else {
      const seated = t ? t.seats.filter(Boolean).length : 0;
      kids.push(joinBox, h('div', { class: 'box' }, h('h3', {}, 'At the table'), h('table', { class: 'tbl' }, (t?.seats || []).filter(Boolean).sort((a, b) => b.stack - a.stack).map((s) => h('tr', {}, h('td', {}, s.name, s.bot ? ' (bot)' : ''), h('td', { class: 'r num' }, fmt(s.stack))))), seated < 2 ? h('p', { class: 'lead2' }, 'Waiting for players…') : null));
    }
    if (v.notes?.length) kids.push(h('div', { class: 'box' }, h('h3', {}, 'Table news'), h('ul', { class: 'notes' }, v.notes.slice(0, 5).map((n) => h('li', {}, n.text)))));
    kids.push(h('div', { class: 'muted', style: { fontSize: 'clamp(11px,0.85vw,16px)' } }, 'Virtual chips only · no real money'));
    mount(side, kids);
  }

  return () => { conn.stop(); felt.destroy(); clearInterval(clock); };
}
