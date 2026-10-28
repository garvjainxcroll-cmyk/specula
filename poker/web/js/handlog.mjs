// Turning a hand's events into plain sentences, for the table log and the history viewer.
import { h, fmt } from './ui.mjs';
import { miniCards } from './cards.mjs';

const STREET = { flop: 'Flop', turn: 'Turn', river: 'River' };

/** names: seat → name; youSeat: the viewer's seat (or null). Returns [{ cls, nodes }]. */
export function logLines(events, { youSeat = null } = {}) {
  const names = {};
  const out = [];
  const nm = (s) => (s === youSeat ? 'You' : names[s] ?? `Seat ${s + 1}`);
  const verb = (s, you, other) => (s === youSeat ? you : other);
  for (const e of events || []) {
    switch (e.t) {
      case 'start':
        for (const p of e.players) names[p.seat] = p.name;
        out.push({ cls: 'st', nodes: [`Hand #${e.no} · blinds ${fmt(e.blinds.sb)}/${fmt(e.blinds.bb)}${e.blinds.ante ? ` · ante ${fmt(e.blinds.ante)}` : ''}`] });
        out.push({ cls: '', nodes: [`${nm(e.button)} ${verb(e.button, 'have', 'has')} the button`] });
        break;
      case 'post':
        out.push({ cls: '', nodes: [`${nm(e.seat)} ${verb(e.seat, 'post', 'posts')} ${e.kind === 'ante' ? 'an ante' : e.kind === 'sb' ? 'the small blind' : 'the big blind'} ${fmt(e.amount)}${e.allIn ? ' and ' + verb(e.seat, 'are', 'is') + ' all-in' : ''}`] });
        break;
      case 'deal':
        if (e.cards && e.seat === youSeat) out.push({ cls: 'me', nodes: ['Your cards ', miniCards(e.cards)] });
        break;
      case 'act': {
        const who = nm(e.seat);
        let text;
        if (e.type === 'fold') text = `${who} ${verb(e.seat, 'fold', 'folds')}`;
        else if (e.type === 'check') text = `${who} ${verb(e.seat, 'check', 'checks')}`;
        else if (e.type === 'call') text = `${who} ${verb(e.seat, 'call', 'calls')} ${fmt(e.amount)}${e.allIn ? ' (all-in)' : ''}`;
        else if (e.type === 'bet') text = `${who} ${verb(e.seat, 'bet', 'bets')} ${fmt(e.to)}${e.allIn ? ' (all-in)' : ''}`;
        else text = `${who} ${verb(e.seat, 'raise', 'raises')} to ${fmt(e.to)}${e.allIn ? ' (all-in)' : ''}`;
        if (e.auto === 'timeout') text += ' — out of time';
        if (e.auto === 'away' || e.auto === 'leave') text += ' — away';
        out.push({ cls: e.seat === youSeat ? 'me' : '', nodes: [text] });
        break;
      }
      case 'return': out.push({ cls: '', nodes: [`${fmt(e.amount)} not called — back to ${nm(e.seat)}`] }); break;
      case 'street': out.push({ cls: 'st', nodes: [STREET[e.street]] }, { cls: '', nodes: [miniCards(e.cards)] }); break;
      case 'reveal': out.push({ cls: '', nodes: [`${nm(e.seat)} ${verb(e.seat, 'show', 'shows')} `, miniCards(e.cards), ' (all-in)'] }); break;
      case 'show': out.push({ cls: '', nodes: [`${nm(e.seat)} ${verb(e.seat, 'show', 'shows')} `, miniCards(e.cards), e.hand ? ` — ${e.hand}` : ''] }); break;
      case 'muck': out.push({ cls: '', nodes: [`${nm(e.seat)} ${verb(e.seat, 'muck', 'mucks')} (cards not shown)`] }); break;
      case 'pot': out.push({ cls: '', nodes: [`${e.i === 0 ? 'Main pot' : `Side pot ${e.i}`} ${fmt(e.amount)} — ${e.eligible.map(nm).join(', ')}`] }); break;
      case 'award': out.push({ cls: 'win', nodes: [`${nm(e.seat)} ${verb(e.seat, 'win', 'wins')} ${fmt(e.amount)}${e.i === 0 ? '' : ` (side pot ${e.i})`}${e.hand ? ` with ${e.hand}` : ''}`] }); break;
      case 'win': out.push({ cls: 'win', nodes: [`${nm(e.seat)} ${verb(e.seat, 'win', 'wins')} ${fmt(e.amount)} — everyone else folded`] }); break;
      case 'void': out.push({ cls: 'st', nodes: ['Hand cancelled by the Event Head — chips returned'] }); break;
      default: break;
    }
  }
  return out;
}

export function logEl(events, opts) {
  return h('div', { class: 'log' }, logLines(events, opts).map((l) => h('div', { class: `l ${l.cls}` }, l.nodes)));
}
