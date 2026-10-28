// One hand of No-Limit Texas Hold'em, as a pure state machine.
//
//   startHand(opts)          → hand (blinds posted, cards dealt, first player to act)
//   legalActions(hand, seat) → what that player may do now (null if it is not their turn)
//   act(hand, seat, action)  → the next hand state (throws HandError on anything illegal)
//   showCards(hand, seat)    → after the hand, a player may show their cards
//
// Every function returns a new object; inputs are never changed. There is no clock and no
// randomness in here: the shuffled deck is passed in. Chips are whole numbers.
//
// Betting rules (standard no-limit, as in the Robert's Rules / TDA conventions):
//  - The minimum opening bet is the big blind. A raise must add at least the last full bet
//    or raise ("minRaise"); the current bet and that increment are tracked separately.
//  - Anyone may bet or call all-in for less. An all-in raise smaller than a full raise does
//    not reopen the betting for players who have already acted: they may raise again only
//    if, since their last action, the bet has gone up by at least a full raise (several
//    short all-ins can add up to one).
//  - Posting a blind is not acting, so the big blind keeps the option to raise preflop.
//    A short all-in big blind still makes the others call the full big blind.
//  - Heads-up, the button posts the small blind and acts first before the flop, last after.
//  - Uncalled chips go back to the bettor at the end of each betting round.
//  - When at most one player can still bet, the remaining cards are dealt with no more
//    betting, and the hands are turned face up.
import { evaluate } from './evaluator.mjs';
import { buildPots, awardPots } from './pots.mjs';
import { isCard } from './cards.mjs';

export const STREETS = ['preflop', 'flop', 'turn', 'river'];

export class HandError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const err = (code, msg) => new HandError(code, msg);
const clone = (x) => structuredClone(x);

// ---------------- seats and positions ----------------

/** Button, small blind and big blind seats for the dealt-in seats (ascending = clockwise). */
export function positions(seats, button) {
  const s = [...seats].sort((a, b) => a - b);
  const bi = s.indexOf(button);
  if (bi < 0) throw err('bad-button', 'The button must be on a dealt-in seat');
  if (s.length === 2) return { button, sb: button, bb: s[(bi + 1) % 2] };
  return { button, sb: s[(bi + 1) % s.length], bb: s[(bi + 2) % s.length] };
}

/** Players clockwise starting with the first seat after `seat`. */
export function after(h, seat) {
  const i = h.players.findIndex((p) => p.seat > seat);
  const k = i === -1 ? 0 : i;
  return [...h.players.slice(k), ...h.players.slice(0, k)];
}
export const playerAt = (h, seat) => h.players.find((p) => p.seat === seat) || null;
const canAct = (p) => !p.folded && !p.allIn;
const live = (h) => h.players.filter((p) => !p.folded);
const needsAction = (h, p) => canAct(p) && (p.actedAt === null || p.bet < h.currentBet);
export const potTotal = (h) => h.players.reduce((a, p) => a + p.committed, 0);

function pay(p, amount) {
  const x = Math.min(amount, p.stack);
  p.stack -= x; p.bet += x; p.committed += x;
  if (p.stack === 0) p.allIn = true;
  return x;
}

// ---------------- starting a hand ----------------

/**
 * opts: { id, no, players: [{ seat, id, name, stack, bot?, autoMuck? }], button,
 *         sb, bb, ante?, deck: shuffled 52 cards, revealAll? }
 */
export function startHand(opts) {
  const { id = 'h1', no = 1, players, button, sb, bb, ante = 0, deck, revealAll = false } = opts;
  if (!Array.isArray(players) || players.length < 2) throw err('players', 'A hand needs at least two players');
  if (players.length > 10) throw err('players', 'At most ten players can be dealt in');
  const seats = players.map((p) => p.seat);
  if (new Set(seats).size !== seats.length) throw err('players', 'Two players on one seat');
  for (const p of players) if (!Number.isInteger(p.stack) || p.stack <= 0) throw err('players', `Seat ${p.seat} has no chips`);
  for (const [k, v] of Object.entries({ sb, bb, ante })) if (!Number.isInteger(v) || v < 0) throw err('blinds', `Bad ${k}`);
  if (!(sb > 0 && bb >= sb)) throw err('blinds', 'The big blind must be at least the small blind');
  if (!Array.isArray(deck) || deck.length !== 52 || new Set(deck).size !== 52 || !deck.every(isCard)) throw err('deck', 'The deck must be 52 different cards');

  const pos = positions(seats, button);
  const h = {
    id, no, button: pos.button, sbSeat: pos.sb, bbSeat: pos.bb,
    blinds: { sb, bb, ante },
    players: players.map((p) => ({
      seat: p.seat, id: p.id, name: p.name, bot: !!p.bot, autoMuck: p.autoMuck !== false,
      start: p.stack, stack: p.stack, bet: 0, committed: 0, folded: false, allIn: false,
      actedAt: null, cards: [], shown: false, last: null, hand: null,
    })).sort((a, b) => a.seat - b.seat),
    board: [], deck: deck.slice(), burned: [],
    street: 'preflop', currentBet: 0, minRaise: bb, aggressor: null, riverAggressor: null,
    toAct: null, seq: 0, events: [], status: 'betting', result: null, revealAll: !!revealAll, runout: false,
  };
  h.events.push({ t: 'start', id, no, button: h.button, sbSeat: h.sbSeat, bbSeat: h.bbSeat, blinds: { sb, bb, ante },
    players: h.players.map((p) => ({ seat: p.seat, id: p.id, name: p.name, stack: p.stack, bot: p.bot })) });

  if (ante > 0) {
    for (const p of h.players) {
      const x = Math.min(ante, p.stack);
      p.stack -= x; p.committed += x; if (p.stack === 0) p.allIn = true;
      h.events.push({ t: 'post', seat: p.seat, kind: 'ante', amount: x, allIn: p.allIn });
    }
  }
  for (const [seat, amount, kind] of [[h.sbSeat, sb, 'sb'], [h.bbSeat, bb, 'bb']]) {
    const p = playerAt(h, seat);
    const x = p.allIn ? 0 : pay(p, amount);
    h.events.push({ t: 'post', seat, kind, amount: x, allIn: p.allIn });
  }
  h.currentBet = bb; // the full big blind, even if the big blind is short
  h.minRaise = bb;

  const order = after(h, h.button);
  for (let k = 0; k < 2; k++) for (const p of order) p.cards.push(h.deck.shift());
  for (const p of order) h.events.push({ t: 'deal', seat: p.seat, cards: p.cards.slice() });

  advance(h, h.bbSeat);
  return h;
}

// ---------------- what a player may do ----------------

export function legalActions(h, seat) {
  if (h.status !== 'betting' || h.toAct !== seat) return null;
  const p = playerAt(h, seat);
  const toCall = Math.max(0, h.currentBet - p.bet);
  const maxTo = p.bet + p.stack;
  const reopened = p.actedAt === null || h.currentBet - p.actedAt >= h.minRaise;
  const opponentCanAct = h.players.some((q) => q !== p && canAct(q));
  const mayRaise = p.stack > toCall && reopened && opponentCanAct;
  const fullTo = h.currentBet + h.minRaise;
  return {
    seat, street: h.street, handId: h.id, seq: h.seq,
    toCall: Math.min(toCall, p.stack), callIsAllIn: toCall > 0 && toCall >= p.stack,
    canFold: true, canCheck: toCall === 0, canCall: toCall > 0,
    canBet: mayRaise && h.currentBet === 0, canRaise: mayRaise && h.currentBet > 0,
    minTo: Math.min(fullTo, maxTo), maxTo, fullTo,
    currentBet: h.currentBet, minRaise: h.minRaise, stack: p.stack, bet: p.bet, committed: p.committed,
    pot: potTotal(h), bb: h.blinds.bb, sb: h.blinds.sb,
  };
}

// ---------------- acting ----------------

/** action: { type: fold|check|call|bet|raise|allin, to?: total street bet for bet/raise, auto?: 'timeout'|'away' } */
export function act(hand, seat, action) {
  const h = clone(hand);
  const legal = legalActions(h, seat);
  if (!legal) throw err('not-your-turn', h.status === 'betting' ? 'It is not your turn' : 'The hand is over');
  const p = playerAt(h, seat);
  let type = action?.type;
  let to = action?.to ?? action?.amount;
  if (type === 'allin') {
    if (legal.canBet || legal.canRaise) { type = 'raise'; to = legal.maxTo; } else if (legal.callIsAllIn) type = 'call';
    else throw err('illegal', legal.canCall ? 'You cannot raise now: call or fold' : 'All-in is not available: check or fold');
  }
  let paid = 0;
  switch (type) {
    case 'fold':
      p.folded = true;
      break;
    case 'check':
      if (!legal.canCheck) throw err('illegal', `You cannot check: ${legal.toCall} to call`);
      break;
    case 'call':
      if (!legal.canCall) throw err('illegal', 'There is nothing to call: check instead');
      paid = pay(p, legal.toCall);
      break;
    case 'bet':
    case 'raise': {
      if (!(legal.canBet || legal.canRaise)) throw err('illegal', p.stack <= legal.toCall ? 'You do not have enough chips to raise' : 'The betting is not open to you again: you can call or fold');
      to = Number(to);
      if (!Number.isInteger(to)) throw err('amount', 'The amount must be a whole number of chips');
      if (to > legal.maxTo) throw err('amount', `You have only ${legal.maxTo} in total`);
      if (to <= h.currentBet) throw err('amount', `A raise must be more than ${h.currentBet}`);
      if (to < legal.minTo) throw err('amount', `The minimum is ${legal.minTo}${legal.maxTo > legal.minTo ? '' : ' (all-in)'}`);
      type = h.currentBet === 0 ? 'bet' : 'raise';
      paid = pay(p, to - p.bet);
      const inc = to - h.currentBet;
      if (inc >= h.minRaise) h.minRaise = inc; // a full raise sets the new minimum
      h.currentBet = to;
      h.aggressor = seat;
      break;
    }
    default:
      throw err('illegal', `Unknown action "${type}"`);
  }
  p.actedAt = h.currentBet;
  p.last = { type, to: p.bet, amount: paid, allIn: p.allIn };
  h.seq += 1;
  const ev = { t: 'act', seat, type, amount: paid, to: p.bet, allIn: p.allIn, seq: h.seq, street: h.street };
  if (action?.auto) ev.auto = action.auto;
  h.events.push(ev);
  advance(h, seat);
  return h;
}

/** The automatic action when a player's time runs out: check if free, otherwise fold. */
export function autoAction(h, seat, reason = 'timeout') {
  const l = legalActions(h, seat);
  if (!l) throw err('not-your-turn', 'It is not that player’s turn');
  return act(h, seat, { type: l.canCheck ? 'check' : 'fold', auto: reason });
}

/** After the hand, a player who has not shown may turn their cards up. */
export function showCards(hand, seat) {
  if (hand.status !== 'complete') throw err('illegal', 'You can show your cards when the hand is over');
  const h = clone(hand);
  const p = playerAt(h, seat);
  if (!p) throw err('illegal', 'You were not in this hand');
  if (p.shown) return h;
  p.shown = true;
  h.events.push({ t: 'show', seat, cards: p.cards.slice(), voluntary: true });
  return h;
}

// ---------------- the flow of a hand ----------------

function roundClosed(h) {
  const actors = h.players.filter(canAct);
  if (actors.length === 0) return true;
  if (actors.length === 1 && live(h).length > 1) return actors[0].bet >= h.currentBet;
  return !actors.some((p) => needsAction(h, p));
}

function advance(h, fromSeat) {
  if (live(h).length === 1) return winUncontested(h);
  if (roundClosed(h)) return closeRound(h);
  const next = after(h, fromSeat).find((p) => needsAction(h, p));
  h.toAct = next.seat;
}

function returnUncalled(h) {
  const top = Math.max(...h.players.map((p) => p.bet));
  if (top <= 0) return;
  const holders = h.players.filter((p) => p.bet === top);
  if (holders.length !== 1) return;
  const second = Math.max(0, ...h.players.filter((p) => p !== holders[0]).map((p) => p.bet));
  const back = top - second;
  if (back <= 0) return;
  const p = holders[0];
  p.bet -= back; p.committed -= back; p.stack += back; p.allIn = p.stack === 0;
  h.events.push({ t: 'return', seat: p.seat, amount: back });
}

function closeRound(h) {
  returnUncalled(h);
  if (h.street === 'river') return showdown(h);
  for (const p of h.players) { p.bet = 0; p.actedAt = null; }
  h.currentBet = 0; h.minRaise = h.blinds.bb; h.aggressor = null;
  if (!h.runout && h.players.filter(canAct).length < 2) {
    h.runout = true;
    for (const p of live(h)) { p.shown = true; h.events.push({ t: 'reveal', seat: p.seat, cards: p.cards.slice() }); }
  }
  dealStreet(h);
  if (h.runout) return closeRound(h);
  h.toAct = after(h, h.button).find(canAct).seat;
}

function dealStreet(h) {
  const next = STREETS[STREETS.indexOf(h.street) + 1];
  h.burned.push(h.deck.shift());
  const n = next === 'flop' ? 3 : 1;
  const cards = h.deck.splice(0, n);
  h.board.push(...cards);
  h.street = next;
  h.events.push({ t: 'street', street: next, cards, board: h.board.slice() });
}

function winUncontested(h) {
  returnUncalled(h);
  const w = live(h)[0];
  const total = potTotal(h);
  w.stack += total;
  for (const p of h.players) { p.bet = 0; }
  h.events.push({ t: 'win', seat: w.seat, amount: total, uncontested: true });
  h.result = { showdown: false, pots: [{ i: 0, amount: total, eligible: [w.seat], winners: [{ seat: w.seat, amount: total }] }], winners: [w.seat] };
  end(h);
}

function showdown(h) {
  h.street = 'showdown';
  h.riverAggressor = h.aggressor; // bet or raised last on the river: shows first
  for (const p of h.players) p.bet = 0;
  const contenders = live(h);
  const scores = new Map();
  for (const p of contenders) {
    const e = evaluate([...p.cards, ...h.board]);
    p.hand = { score: e.score, cat: e.cat, name: e.name, desc: e.desc, best: e.best };
    scores.set(p.seat, e.score);
  }
  const pots = buildPots(h.players);
  const oddOrder = after(h, h.button).map((p) => p.seat);
  const awards = awardPots(pots, scores, oddOrder);
  const winnerSeats = new Set(awards.flatMap((a) => a.winners.filter((w) => w.amount > 0).map((w) => w.seat)));

  // Who turns their cards up: the last aggressor first, then clockwise.
  const first = h.riverAggressor !== null && contenders.some((p) => p.seat === h.riverAggressor) ? h.riverAggressor : after(h, h.button).find((p) => !p.folded).seat;
  const order = [playerAt(h, first), ...after(h, first).filter((p) => !p.folded && p.seat !== first)];
  for (const p of order) {
    if (p.shown || h.revealAll || winnerSeats.has(p.seat) || !p.autoMuck) {
      p.shown = true;
      h.events.push({ t: 'show', seat: p.seat, cards: p.cards.slice(), hand: p.hand.desc, best: p.hand.best.slice() });
    } else {
      h.events.push({ t: 'muck', seat: p.seat });
    }
  }
  pots.forEach((pot, i) => h.events.push({ t: 'pot', i, amount: pot.amount, eligible: pot.eligible.slice() }));
  for (const a of awards) {
    for (const w of a.winners) {
      playerAt(h, w.seat).stack += w.amount;
      h.events.push({ t: 'award', i: a.i, seat: w.seat, amount: w.amount, hand: playerAt(h, w.seat).hand.desc });
    }
  }
  h.result = {
    showdown: true,
    pots: awards.map((a) => ({ ...a, eligible: pots[a.i].eligible, hand: playerAt(h, a.winners[0].seat).hand.desc })),
    winners: [...winnerSeats],
  };
  end(h);
}

function end(h) {
  h.status = 'complete';
  h.toAct = null;
  h.events.push({ t: 'end', stacks: Object.fromEntries(h.players.map((p) => [p.seat, p.stack])) });
}

// ---------------- checks and summaries ----------------

/** Chips are never created or lost: throws if the books do not balance. */
export function checkChips(h) {
  const start = h.players.reduce((a, p) => a + p.start, 0);
  const now = h.status === 'complete' ? h.players.reduce((a, p) => a + p.stack, 0) : h.players.reduce((a, p) => a + p.stack + p.committed, 0);
  if (start !== now) throw new Error(`Chip mismatch in hand ${h.id}: started with ${start}, now ${now}`);
  for (const p of h.players) if (p.stack < 0 || p.committed < 0 || p.bet < 0) throw new Error(`Negative chips at seat ${p.seat}`);
  return true;
}

/** Pots as they stand in the middle (chips from finished betting rounds), for display. */
export function middlePots(h) {
  if (h.status === 'complete') return h.result.pots.map((p) => ({ amount: p.amount, eligible: p.eligible }));
  return buildPots(h.players.map((p) => ({ seat: p.seat, committed: p.committed - p.bet, folded: p.folded, allIn: p.allIn && p.bet === 0 })));
}
