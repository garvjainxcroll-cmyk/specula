// The hand evaluator: the best five-card hand from 5, 6 or 7 cards.
// A hand's `score` is one integer; a higher score is a better hand and equal scores tie
// exactly (suits never break ties). Layout: category << 20, then up to five ranks of
// four bits each, most significant first.
import { rankOf, suitOf, RANK_NAME, RANK_PLURAL } from './cards.mjs';

export const CAT = { HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8, ROYAL_FLUSH: 9 };
export const CAT_NAME = ['High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'];

const WHEEL = 0x100f; // A, 5, 4, 3, 2

/** Highest straight in a 13-bit rank mask: returns its top rank (3 for the wheel, five high), or -1. */
function straightHigh(mask) {
  for (let hi = 12; hi >= 4; hi--) { const m = 0x1f << (hi - 4); if ((mask & m) === m) return hi; }
  return (mask & WHEEL) === WHEEL ? 3 : -1;
}
const straightRanks = (hi) => (hi === 3 ? [3, 2, 1, 0, 12] : [hi, hi - 1, hi - 2, hi - 3, hi - 4]);

function pack(cat, ranks) {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 16 + (ranks[i] ?? 0);
  return s;
}

/**
 * Evaluate 5–7 cards. Returns { score, cat, name, ranks, best, desc }:
 *  ranks — the ranks that decide ties, in order; best — the five cards that make the hand.
 */
export function evaluate(cards) {
  if (cards.length < 5 || cards.length > 7) throw new Error(`evaluate needs 5–7 cards, got ${cards.length}`);
  const counts = new Array(13).fill(0);
  const suitMask = [0, 0, 0, 0];
  const suitCount = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) {
    const r = rankOf(c); const s = suitOf(c);
    counts[r]++; suitMask[s] |= 1 << r; suitCount[s]++; mask |= 1 << r;
  }
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCount[s] >= 5) flushSuit = s;

  let cat; let ranks; let need; // need: [[rank, count]] for picking cards (non-flush hands)
  if (flushSuit >= 0) {
    const sh = straightHigh(suitMask[flushSuit]);
    if (sh >= 0) {
      cat = sh === 12 ? CAT.ROYAL_FLUSH : CAT.STRAIGHT_FLUSH;
      ranks = [sh];
      return finish(cards, cat, ranks, straightRanks(sh).map((r) => [r, 1]), flushSuit);
    }
  }
  const quads = []; const trips = []; const pairs = []; const singles = [];
  for (let r = 12; r >= 0; r--) {
    if (counts[r] === 4) quads.push(r);
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
    else if (counts[r] === 1) singles.push(r);
  }
  const kickers = (exclude, n) => {
    const out = [];
    for (let r = 12; r >= 0 && out.length < n; r--) if (counts[r] > 0 && !exclude.includes(r)) out.push(r);
    return out;
  };
  if (quads.length) {
    const q = quads[0]; const k = kickers([q], 1);
    cat = CAT.QUADS; ranks = [q, ...k]; need = [[q, 4], [k[0], 1]];
  } else if (trips.length && (trips.length > 1 || pairs.length)) {
    const t = trips[0];
    const p = Math.max(trips[1] ?? -1, pairs[0] ?? -1);
    cat = CAT.FULL_HOUSE; ranks = [t, p]; need = [[t, 3], [p, 2]];
  } else if (flushSuit >= 0) {
    const fr = [];
    for (let r = 12; r >= 0 && fr.length < 5; r--) if (suitMask[flushSuit] & (1 << r)) fr.push(r);
    return finish(cards, CAT.FLUSH, fr, fr.map((r) => [r, 1]), flushSuit);
  } else if (straightHigh(mask) >= 0) {
    const sh = straightHigh(mask);
    cat = CAT.STRAIGHT; ranks = [sh]; need = straightRanks(sh).map((r) => [r, 1]);
  } else if (trips.length) {
    const t = trips[0]; const k = kickers([t], 2);
    cat = CAT.TRIPS; ranks = [t, ...k]; need = [[t, 3], ...k.map((r) => [r, 1])];
  } else if (pairs.length >= 2) {
    const [p1, p2] = pairs; const k = kickers([p1, p2], 1);
    cat = CAT.TWO_PAIR; ranks = [p1, p2, ...k]; need = [[p1, 2], [p2, 2], ...k.map((r) => [r, 1])];
  } else if (pairs.length) {
    const p = pairs[0]; const k = kickers([p], 3);
    cat = CAT.PAIR; ranks = [p, ...k]; need = [[p, 2], ...k.map((r) => [r, 1])];
  } else {
    const k = kickers([], 5);
    cat = CAT.HIGH; ranks = k; need = k.map((r) => [r, 1]);
  }
  return finish(cards, cat, ranks, need, -1);
}

function finish(cards, cat, ranks, need, suit) {
  // Pick the actual cards, highest suit first so the choice is stable.
  const pool = cards.slice().sort((a, b) => b - a);
  const used = new Set();
  const best = [];
  for (const [r, n] of need) {
    let got = 0;
    for (const c of pool) {
      if (got === n) break;
      if (used.has(c) || rankOf(c) !== r || (suit >= 0 && suitOf(c) !== suit)) continue;
      used.add(c); best.push(c); got++;
    }
  }
  const score = pack(cat, ranks);
  return { score, cat, name: CAT_NAME[cat], ranks, best, desc: describe(cat, ranks) };
}

/** Plain-English description, e.g. "Full House, Kings full of Fours". */
export function describe(cat, ranks) {
  const N = (r) => RANK_NAME[r]; const P = (r) => RANK_PLURAL[r];
  switch (cat) {
    case CAT.ROYAL_FLUSH: return 'Royal Flush';
    case CAT.STRAIGHT_FLUSH: return `Straight Flush, ${N(ranks[0])} high`;
    case CAT.QUADS: return `Four of a Kind, ${P(ranks[0])}`;
    case CAT.FULL_HOUSE: return `Full House, ${P(ranks[0])} full of ${P(ranks[1])}`;
    case CAT.FLUSH: return `Flush, ${N(ranks[0])} high`;
    case CAT.STRAIGHT: return `Straight, ${N(ranks[0])} high`;
    case CAT.TRIPS: return `Three of a Kind, ${P(ranks[0])}`;
    case CAT.TWO_PAIR: return `Two Pair, ${P(ranks[0])} and ${P(ranks[1])}`;
    case CAT.PAIR: return `One Pair, ${P(ranks[0])}`;
    default: return `High Card, ${N(ranks[0])}`;
  }
}

/** The best hand from two hole cards and the board (3–5 cards). */
export const bestHand = (hole, board) => evaluate([...hole, ...board]);
export const compare = (a, b) => a.score - b.score;

/** Score only (a little faster path for simulations): same ordering as evaluate().score. */
export const scoreOf = (cards) => evaluate(cards).score;
