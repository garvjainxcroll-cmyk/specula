// Test helpers: stacked decks and quick hands.
import { parseCards, freshDeck } from '../src/engine/cards.mjs';
import { startHand, after } from '../src/engine/hand.mjs';

/**
 * Build a deck so that the given seats get the given hole cards and the board comes out as given.
 * players: [{ seat }], button: seat, holes: { seat: 'As Kd' }, board: 'Ah Kh Qh Jh Th' (0–5 cards).
 */
export function stackDeck(players, button, holes = {}, board = '') {
  const seats = players.map((p) => p.seat).sort((a, b) => a - b);
  const fake = { players: seats.map((seat) => ({ seat })) };
  const order = after(fake, button).map((p) => p.seat);
  const want = new Array(52).fill(null);
  const fixed = new Set();
  const put = (i, c) => { if (c === undefined) return; if (fixed.has(c)) throw new Error('duplicate card in test'); want[i] = c; fixed.add(c); };
  order.forEach((seat, k) => {
    const h = holes[seat] ? parseCards(holes[seat]) : [];
    put(k, h[0]);
    put(order.length + k, h[1]);
  });
  const b = board ? parseCards(board) : [];
  const base = order.length * 2;
  // burn, flop×3, burn, turn, burn, river
  const at = [base + 1, base + 2, base + 3, base + 5, base + 7];
  b.forEach((c, i) => put(at[i], c));
  const rest = freshDeck().filter((c) => !fixed.has(c));
  return want.map((c) => (c === null ? rest.shift() : c));
}

/** Start a hand quickly. stacks: { seat: chips } */
export function quickHand({ stacks, button, sb = 50, bb = 100, ante = 0, holes = {}, board = '', revealAll = false, autoMuck = true }) {
  const players = Object.entries(stacks).map(([seat, stack]) => ({ seat: Number(seat), id: `p${seat}`, name: `P${seat}`, stack, autoMuck }));
  const deck = stackDeck(players, button, holes, board);
  return startHand({ id: 't', no: 1, players, button, sb, bb, ante, deck, revealAll });
}

export const stackOf = (h, seat) => h.players.find((p) => p.seat === seat).stack;
export const sumStacks = (h) => h.players.reduce((a, p) => a + p.stack, 0);
