// Cards are integers 0..51: rank = c >> 2 (0 = deuce … 12 = ace), suit = c & 3 (clubs, diamonds, hearts, spades).
// Pure: no Date, no Math.random. Shuffling takes an injected random source (see rng.mjs).

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';
export const RANK_NAME = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
export const RANK_PLURAL = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];
export const SUIT_NAME = ['clubs', 'diamonds', 'hearts', 'spades'];

export const rankOf = (c) => c >> 2;
export const suitOf = (c) => c & 3;
export const makeCard = (rank, suit) => rank * 4 + suit;

/** "As" → 51. Accepts "T" or "10" for ten, any case. */
export function parseCard(str) {
  const s = String(str).trim();
  const m = /^(10|[2-9tjqka])([cdhs])$/i.exec(s);
  if (!m) throw new Error(`Not a card: ${str}`);
  const r = m[1] === '10' ? 8 : RANKS.indexOf(m[1].toUpperCase());
  return makeCard(r, SUITS.indexOf(m[2].toLowerCase()));
}
export const parseCards = (str) => (Array.isArray(str) ? str : String(str).trim().split(/[\s,]+/).filter(Boolean)).map(parseCard);
export const cardStr = (c) => RANKS[rankOf(c)] + SUITS[suitOf(c)];
export const cardsStr = (cs) => cs.map(cardStr).join(' ');
export const isCard = (c) => Number.isInteger(c) && c >= 0 && c < 52;

export function freshDeck() { return Array.from({ length: 52 }, (_, i) => i); }

/** Fisher–Yates with an unbiased integer source rng.int(n) → 0..n-1. Returns a new array. */
export function shuffle(deck, rng) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = d[i]; d[i] = d[j]; d[j] = t;
  }
  return d;
}
