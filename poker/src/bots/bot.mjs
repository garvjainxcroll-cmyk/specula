// Practice opponents ("bots"). Always shown as BOT at the table, never presented as people.
// A bot sees exactly what a player in its seat would see: its own two cards, the board, the
// bets and the pot. It never sees the deck or another player's cards.
//
// Levels:
//  easy   — plays many hands and calls a lot; rarely raises; makes mistakes.
//  medium — estimates its chance of winning and compares it with the price of calling.
//  hard   — a sharper estimate, sizes its bets by street and position, bluffs a little.
import { evaluate } from '../engine/evaluator.mjs';
import { presetAmount, clampTo } from '../engine/presets.mjs';

export const BOT_LEVELS = ['easy', 'medium', 'hard'];
const ITER = { easy: 60, medium: 220, hard: 500 };
export const BOT_NAMES = ['Aurelius', 'Brutus', 'Cassia', 'Decima', 'Flavia', 'Gaius', 'Hadrian', 'Julia', 'Livia', 'Marcus', 'Nero', 'Octavia', 'Portia', 'Quintus', 'Septima', 'Tiberius', 'Valeria'];

/** Chance of winning against `opponents` random hands, by Monte Carlo. */
export function equity(hole, board, opponents, iterations, rng) {
  const known = new Set([...hole, ...board]);
  const rest = [];
  for (let c = 0; c < 52; c++) if (!known.has(c)) rest.push(c);
  const need = 5 - board.length;
  let wins = 0;
  const opp = Math.max(1, Math.min(opponents, 8));
  const d = rest.slice();
  for (let it = 0; it < iterations; it++) {
    const take = need + opp * 2;
    for (let i = 0; i < take; i++) { const j = i + rng.int(d.length - i); const t = d[i]; d[i] = d[j]; d[j] = t; }
    const full = board.concat(d.slice(0, need));
    const mine = evaluate(hole.concat(full)).score;
    let best = 0; let tie = 0;
    for (let o = 0; o < opp; o++) {
      const s = evaluate([d[need + 2 * o], d[need + 2 * o + 1], ...full]).score;
      if (s > best) { best = s; tie = 0; }
      if (s === best) tie++;
    }
    if (mine > best) wins += 1;
    else if (mine === best) wins += 1 / (tie + 1);
  }
  return wins / iterations;
}

/**
 * Choose an action. view: { hole, board, legal, opponents, street, position: 0..1 (1 = button) }
 * Returns { type, to? } — always legal for `legal`.
 */
export function decide(view, level, rng) {
  const { hole, board, legal } = view;
  const lvl = BOT_LEVELS.includes(level) ? level : 'medium';
  const opp = Math.max(1, view.opponents || 1);
  const e = equity(hole, board, opp, ITER[lvl], rng);
  const toCall = legal.toCall;
  const potOdds = toCall > 0 ? toCall / (legal.pot + toCall) : 0;
  const r = rng.float();
  const canAggress = legal.canBet || legal.canRaise;
  const pos = view.position ?? 0.5;
  const sized = (kind) => presetAmount(legal, kind, undefined, legal.sb)?.to ?? legal.minTo;
  const raise = (to) => ({ type: legal.canBet ? 'bet' : 'raise', to: clampTo(legal, to) });
  const passive = () => (legal.canCheck ? { type: 'check' } : { type: 'fold' });
  const call = () => (legal.canCheck ? { type: 'check' } : { type: 'call' });

  if (lvl === 'easy') {
    if (canAggress && e > 0.78 && r < 0.5) return raise(sized('half'));
    if (legal.canCheck) return { type: 'check' };
    if (e > potOdds * 0.7 || r < 0.25) return { type: 'call' };
    return { type: 'fold' };
  }

  // the strength needed to continue rises with more opponents
  const strong = lvl === 'hard' ? 0.62 + 0.03 * (opp - 1) : 0.66 + 0.03 * (opp - 1);
  const margin = lvl === 'hard' ? 0.02 : 0.06;

  if (canAggress && e > Math.min(0.9, strong)) {
    // strong: value bet or raise; hard bots sometimes slow-play a monster on early streets
    if (lvl === 'hard' && e > 0.9 && view.street !== 'river' && r < 0.25) return call();
    const kind = e > 0.85 ? (r < 0.5 ? 'pot' : 'threequarters') : (r < 0.5 ? 'half' : 'twothirds');
    let to = sized(kind);
    if (legal.stack < legal.pot && e > 0.8) to = legal.maxTo; // short: get it in
    return raise(to);
  }
  if (toCall === 0) {
    // checked to us: a stab in position, or a semi-bluff
    const bluff = lvl === 'hard' ? 0.18 + 0.12 * pos : 0.08;
    if (canAggress && (e > 0.5 || r < bluff) && opp <= 2) return raise(sized(r < 0.5 ? 'half' : 'small'));
    return { type: 'check' };
  }
  if (e > potOdds + margin) {
    if (lvl === 'hard' && canAggress && e > 0.55 && r < 0.12) return raise(sized('pot'));
    return { type: 'call' };
  }
  // cheap enough to see the next card with a draw (hard bots only)
  if (lvl === 'hard' && view.street !== 'river' && toCall <= legal.pot * 0.25 && e > potOdds * 0.8) return { type: 'call' };
  return passive();
}

/** How long a bot "thinks" before acting, in milliseconds. */
export const thinkMs = (level, rng) => (level === 'easy' ? 600 : 900) + rng.int(level === 'hard' ? 1800 : 1200);
