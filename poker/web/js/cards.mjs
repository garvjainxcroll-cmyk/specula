// Playing cards and chips, drawn in the page (no image files). Suits are SVG shapes so they
// look the same on every device. Four-colour decks are a setting (body.four).
import { h, svg } from './ui.mjs';

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const SUIT_NAME = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const RANK_LABEL = { T: '10' };

const SUIT_SHAPES = {
  h: () => [svg('path', { d: 'M50 90C22 68 6 50 6 31 6 16 17 6 30 6c9 0 16 5 20 13C54 11 61 6 70 6c13 0 24 10 24 25 0 19-16 37-44 59z' })],
  d: () => [svg('path', { d: 'M50 4 88 50 50 96 12 50z' })],
  s: () => [svg('path', { d: 'M50 4C63 24 94 40 94 62c0 13-10 21-22 21-8 0-14-4-18-10 1 9 5 16 12 23H34c7-7 11-14 12-23-4 6-10 10-18 10C16 83 6 75 6 62 6 40 37 24 50 4z' })],
  c: () => [svg('circle', { cx: 50, cy: 27, r: 20 }), svg('circle', { cx: 26, cy: 56, r: 20 }), svg('circle', { cx: 74, cy: 56, r: 20 }), svg('path', { d: 'M44 55c0 18-4 30-12 39h36c-8-9-12-21-12-39z' })],
};
export const suitSvg = (s) => svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' }, ...SUIT_SHAPES[s]());

export const cardCode = (c) => (typeof c === 'number' ? RANKS[c >> 2] + SUITS[c & 3] : c);
export function cardName(c) {
  const code = cardCode(c);
  const r = code[0];
  const names = { T: 'Ten', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' };
  return `${names[r] || r} of ${SUIT_NAME[code[1]]}`;
}
export function cardText(c) {
  const code = cardCode(c);
  return `${RANK_LABEL[code[0]] || code[0]}${{ c: '♣', d: '♦', h: '♥', s: '♠' }[code[1]]}\uFE0E`; // text style, never emoji
}

/** A card element. c: number 0..51, a code like "As", 'back', or null (empty). */
export function cardEl(c, { cls = '', title = true } = {}) {
  if (c === 'back' || c === null || c === undefined) return h('div', { class: `pcard back ${cls}`, role: 'img', 'aria-label': 'Face-down card' });
  const code = cardCode(c);
  const r = code[0]; const s = code[1];
  const red = s === 'h' || s === 'd';
  return h('div', { class: `pcard ${red ? 'red' : ''} ${s} ${cls}`, role: 'img', 'aria-label': cardName(c), title: title ? cardName(c) : null, 'data-c': code },
    h('span', { class: 'rk' }, RANK_LABEL[r] || r),
    h('span', { class: 's1' }, suitSvg(s)),
    h('span', { class: 's2' }, suitSvg(s)));
}
export const miniCards = (list) => h('span', { class: 'mini' }, (list || []).map((c) => cardEl(c, { title: true })));

/** A small stack of chips whose colours suggest the amount. */
export function chipStack(amount, max = 4) {
  const denoms = [1000, 500, 100, 25, 5, 1];
  const out = [];
  let left = amount;
  for (const d of denoms) {
    while (left >= d && out.length < max) { out.push(d); left -= d; }
    if (out.length >= max) break;
  }
  if (!out.length) out.push(1);
  return h('span', { class: 'chipstack', 'aria-hidden': 'true' }, out.slice(0, max).map((d) => h('span', { class: `chip c${d}` })));
}
