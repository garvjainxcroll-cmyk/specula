// The Big Screen (#display), for a 1920×1080 projector in the hall.
import { h, mount, fmtClock, fmtNum, fmtSigned, fmtCr, pct, postEl, lineChart, sstore } from '../ui.mjs';
import { live, subscribe, startPolling, stopPolling, clockLeft, setToken } from '../net.mjs';
import { ECONOMIES, ECON_ORDER } from '../../src/config/economies.mjs';
import { INST } from '../../src/config/instruments.mjs';
import { roundName } from '../../src/config/rules.mjs';
import { releaseTable, quarterMoves, forecastQuestion, standingsTable } from '../explain.mjs';

// No standings appear here during the game: results are sealed until the Event Head
// presses "Reveal the results" after the final release.

export default function display(app) {
  setToken(null);
  startPolling(() => 1500);
  document.documentElement.dataset.theme = 'dark';
  let lastKey = ''; let clockEl = null;
  const seen = new Set(sstore('specula-display-seen') || []);
  let takeoverUntil = 0; let takeoverStage = null;
  let revealAt = 0; // when this screen first showed the revealed standings

  function render() {
    const s = live.state;
    if (!s) { mount(app, h('div', { class: 'bigscreen' }, h('div', { class: 'body' }, h('p', { class: 'huge center' }, 'SPECULA')))); return; }
    const q = live.docs.quarter;
    const stages = q?.run?.stages || [];
    for (const st of stages) { const k = `${s.q}:${st.id}`; if (!seen.has(k)) { seen.add(k); sstore('specula-display-seen', [...seen]); takeoverStage = st; takeoverUntil = Date.now() + 25000; } }
    const key = JSON.stringify([s.v, s.docs, takeoverStage?.id, Date.now() < takeoverUntil]);
    if (key === lastKey) return;
    lastKey = key;
    clockEl = h('div', { class: 'bigclock' }, '');
    mount(app, h('div', { class: 'bigscreen', 'data-phase': s.phase },
      h('div', { class: 'top' }, h('img', { src: 'img/crest.png', alt: '' }),
        h('div', {}, h('div', { class: 'title' }, 'SPECULA'), h('div', { class: 'sub' }, s.q ? `Round 0${s.round} of 06 · ${roundName(s.q)}` : 'Copia et Inopia · Round 3')),
        s.phase === 'open' || s.phase === 'settling' ? clockEl : h('div', { class: 'bigclock', style: { fontSize: '40px', minWidth: '0' } }, phaseWord(s.phase))),
      h('div', { class: 'body' }, body(s, q)),
      Date.now() < takeoverUntil && takeoverStage && s.phase === 'open' ? takeover(takeoverStage) : null));
    playReveal();
    tick();
  }
  function phaseWord(p) { return { setup: 'SOON', lobby: 'JOIN', data: 'DATA', results: 'RESULTS', final: 'FINAL' }[p] || ''; }

  function body(s, q) {
    if (s.phase === 'setup' || s.phase === 'lobby' || !q) {
      return h('div', { class: 'cols' },
        h('div', { class: 'dcard' }, h('h2', {}, 'Join your fund'),
          h('p', { class: 'join' }, 'On your phone or laptop open'), h('p', { class: 'codebox' }, `${location.host}/#/desk`),
          h('p', { class: 'join' }, 'and enter your private fund code.'), h('p', { class: 'muted', style: { fontSize: '24px' } }, 'New? Read How to Play or try the two practice rounds while you wait.')),
        h('div', { class: 'dcard' }, h('h2', {}, `Funds · ${s.teams.length}`),
          h('table', { class: 'tbl' }, h('tbody', {}, s.teams.map((t) => h('tr', {}, h('td', {}, t.name), h('td', { class: 'r muted' }, t.members.length ? `${t.members.length} signed in` : '—')))))));
    }
    const res = live.docs.result && live.results[s.docs.result];
    if (s.phase === 'data') {
      return [h('div', { class: 'dcard' }, h('h2', {}, `The data drops · Round ${s.q}`), releaseTable(q.release, { compact: false })),
        h('div', { class: 'cols' },
          h('div', { class: 'dcard' }, h('h2', {}, 'Headlines'), h('ul', { class: 'ticker' }, (q.run?.headlines || []).map((t) => h('li', {}, t)))),
          h('div', { class: 'dcard' }, h('h2', {}, 'This round’s forecast'), h('p', { class: 'ticker' }, forecastQuestion(q.run?.forecast)), q.run?.auction ? h('p', { class: 'ticker', style: { color: '#e2bf7b' } }, `Round decision: ${q.run.auction.title}`) : null, h('p', { class: 'muted', style: { fontSize: '24px' } }, `The ${Math.round((s.timer?.seconds || 600) / 60)}-minute window opens soon. Read the rules on your desk.`)))];
    }
    if (s.phase === 'open' || s.phase === 'settling') {
      const stages = q.run?.stages || [];
      return [
        stages.length ? h('div', { class: 'dcard', style: { borderColor: '#f39a8c' } }, h('div', { class: 'eyebrow', style: { color: '#f39a8c', fontSize: '18px' } }, `Crisis · ${stages.at(-1).crisisTitle}`), h('h2', { style: { fontSize: '40px' } }, stages.at(-1).headline)) : null,
        h('div', { class: 'cols' },
          h('div', { class: 'dcard' }, h('h2', {}, s.phase === 'settling' ? 'The bell has rung' : 'The window is open'),
            s.phase === 'settling' ? h('p', { class: 'ticker' }, 'The desk is locked. Central banks are acting and prices are resetting…')
              : h('ul', { class: 'ticker' }, (q.run?.headlines || []).map((t) => h('li', {}, t)))),
          h('div', { class: 'dcard' }, h('h2', {}, 'Forecast'), h('p', { class: 'ticker' }, forecastQuestion(q.run?.forecast)),
            h('h2', { style: { marginTop: '24px' } }, 'Policy rates now'), h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' } }, ECON_ORDER.map((e) => h('div', { class: 'rate' }, h('div', { class: 'n' }, ECONOMIES[e].name), h('div', { class: 'v' }, `${fmtNum(q.release.econ[e].i)}%`))))))];
    }
    if (s.phase === 'results' && res) {
      const moves = Object.values(quarterMoves(res)).filter((m) => !m.points && m.total !== 0).sort((a, b) => Math.abs(b.total) - Math.abs(a.total)).slice(0, 7);
      return [h('div', { class: 'dcard' }, h('h2', {}, `Central banks act · Round ${res.q}`),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '14px' } }, ECON_ORDER.map((e) => {
          const d = res.decisions[e];
          return h('div', { class: 'rate' }, h('div', { class: 'n' }, ECONOMIES[e].name), h('div', { class: 'v' }, `${fmtNum(d.iNew)}%`), h('div', { class: d.change > 0 ? 'up' : d.change < 0 ? 'down' : 'muted', style: { fontSize: '22px' } }, d.change ? fmtSigned(d.change) : 'unchanged'));
        }))),
      h('div', { class: 'cols' },
        h('div', { class: 'dcard' }, h('h2', {}, 'Biggest moves'), h('table', { class: 'tbl' }, h('tbody', {}, moves.map((m) => h('tr', {}, h('td', {}, INST[m.id].name), h('td', { class: 'r' }, pct(m.total, { dp: 1 }))))))),
        h('div', { class: 'dcard' }, h('h2', {}, 'Results are sealed'),
          h('p', { class: 'ticker' }, 'Every fund’s profit and loss, line by line, is on its own desk.'),
          h('p', { class: 'ticker' }, 'No fund can see another’s. The standings are revealed only at the end.'),
          (res.stages || []).length ? h('p', { class: 'muted', style: { fontSize: '24px' } }, `Crises this round: ${res.stages.length}`) : h('p', { class: 'muted', style: { fontSize: '24px' } }, 'No crisis broke this round.')))];
    }
    if (s.phase === 'final' && !(s.revealed && live.docs.final)) {
      return h('div', { class: 'dcard center', style: { padding: '80px 40px' } },
        h('p', { class: 'huge', style: { fontSize: '96px' } }, 'THE BELL HAS RUNG'),
        h('p', { class: 'ticker' }, 'Six rounds are over. Every score has been calculated.'),
        h('p', { class: 'ticker', style: { color: '#e2bf7b' } }, 'The Event Head will now reveal the results.'));
    }
    if (s.phase === 'final') {
      const fin = live.docs.final;
      const rows = fin.standings?.rows || [];
      const paths = fin.navPaths || {};
      const order = rows.slice().reverse(); // the reveal runs from last place to first
      return [h('div', { class: 'cols' },
        h('div', { class: 'dcard' }, h('h2', {}, 'Final standings · SPECULA Score'),
          rows.slice(0, 3).map((r, i) => h('div', { class: 'reveal', 'data-delay': String((order.length - 1 - i) * 0.9 + 1.2), style: { display: 'flex', alignItems: 'baseline', gap: '20px', margin: '10px 0' } }, h('span', { class: 'huge', style: { fontSize: '72px', color: ['#d8b870', '#ead2ae', '#b08d57'][i] } }, `${i + 1}`), h('span', { style: { fontSize: '44px', fontWeight: 600 } }, r.name), h('span', { style: { fontSize: '40px', marginLeft: 'auto' } }, fmtNum(r.total, 1)))),
          h('div', { class: 'reveal', 'data-delay': '0.3' }, standingsTable(rows.slice(3), { big: true, limit: 12 }))),
        h('div', { class: 'dcard reveal', 'data-delay': String(rows.length * 0.9 + 1.5) }, h('h2', {}, 'Every fund, round by round (₹ Cr)'),
          lineChart(rows.slice(0, 10).map((r) => ({ name: r.name, values: (paths[r.id] || []).map((x) => x / 1e9) })), ['Start', ...rows.length ? (paths[rows[0].id] || []).slice(1).map((_, k) => `R${k + 1}`) : []], { height: 420, yFmt: (v) => fmtNum(v, 0) })))];
    }
    return h('div', { class: 'dcard' }, h('p', { class: 'ticker' }, 'Results are on their way…'));
  }

  // The reveal runs on timers, not CSS animation delays, so it always finishes (and a
  // re-render does not start it again).
  function playReveal() {
    const els = app.querySelectorAll('.reveal[data-delay]');
    if (!els.length) return;
    if (!revealAt) revealAt = Date.now();
    for (const el of els) {
      const wait = revealAt + Number(el.dataset.delay) * 1000 - Date.now();
      if (wait <= 0) el.classList.add('in'); else setTimeout(() => el.classList.add('in'), wait);
    }
  }

  function takeover(st) {
    return h('div', { class: 'takeover' }, h('div', { class: 'box', style: { maxWidth: '1500px', padding: '40px' } },
      h('div', { class: 'eyebrow', style: { fontSize: '20px' } }, `Crisis${st.of > 1 ? ` · stage ${st.stageNo} of ${st.of}` : ''} · ${st.crisisTitle}`),
      h('h2', { style: { fontSize: '58px', lineHeight: 1.15 } }, st.headline),
      h('div', { style: { fontSize: '28px' } }, (st.posts || []).map((p, i) => postEl(p, 900 + i * 1600)))));
  }

  function tick() {
    if (!clockEl) return;
    const s = live.state;
    const left = clockLeft();
    if (s?.phase === 'settling') { clockEl.textContent = 'BELL'; return; }
    const paused = s?.timer?.pausedLeft !== null && s?.timer?.pausedLeft !== undefined;
    clockEl.textContent = left === null ? '—' : left <= 0 ? 'BELL' : `${fmtClock(left)}${paused ? ' ‖' : ''}`;
    clockEl.className = `bigclock ${left !== null && left < 20000 ? 'closing' : ''}`;
  }
  const t1 = setInterval(() => { tick(); if (takeoverUntil && Date.now() > takeoverUntil) { takeoverUntil = 0; lastKey = ''; render(); } }, 250);
  const unsub = subscribe(render);
  render();
  return () => { clearInterval(t1); unsub(); stopPolling(); };
}
