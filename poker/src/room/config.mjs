// Table and tournament settings: defaults, choices offered in the lobby, and validation.
// Every setting a host can type goes through clean*() so a bad value can never reach a table.
import { cleanPresets, DEFAULT_PRESETS } from '../engine/presets.mjs';
import { BOT_LEVELS } from '../bots/bot.mjs';

export const STAKES = [
  { id: '5-10', sb: 5, bb: 10, label: '5 / 10' },
  { id: '10-20', sb: 10, bb: 20, label: '10 / 20' },
  { id: '25-50', sb: 25, bb: 50, label: '25 / 50' },
  { id: '50-100', sb: 50, bb: 100, label: '50 / 100' },
];
export const TABLE_SIZES = [2, 6, 9];
export const MAX_SEATS = 10;

export const DEFAULT_TABLE = Object.freeze({
  sb: 10, bb: 20, ante: 0,
  seats: 6,
  minBuyIn: 800, maxBuyIn: 4000, // 40 and 200 big blinds
  actionSeconds: 25, timeBankSeconds: 30,
  presets: DEFAULT_PRESETS,
  showdownReveal: 'winners', // 'winners': losing hands are mucked unless the player turns auto-muck off; 'all': every hand at showdown is shown
  revealFoldedInHistory: false, // show folded players' cards in the hand history (practice tables turn this on)
  newPlayers: 'wait-bb', // 'wait-bb': a new player is dealt in when the big blind reaches them; 'immediate'
  idleSitOut: 2, // time-outs in a row before a player is sat out
  sitOutMinutes: 15, // a player sat out this long is taken off the table (chips go back to their account)
  botLevel: 'medium',
});

export const DEFAULT_SCHEDULE = [
  { sb: 25, bb: 50, ante: 0, minutes: 8 }, { sb: 50, bb: 100, ante: 0, minutes: 8 }, { sb: 75, bb: 150, ante: 15, minutes: 8 },
  { sb: 100, bb: 200, ante: 25, minutes: 8 }, { sb: 150, bb: 300, ante: 30, minutes: 8 }, { sb: 200, bb: 400, ante: 50, minutes: 8 },
  { sb: 300, bb: 600, ante: 75, minutes: 8 }, { sb: 400, bb: 800, ante: 100, minutes: 8 }, { sb: 600, bb: 1200, ante: 150, minutes: 8 },
  { sb: 800, bb: 1600, ante: 200, minutes: 8 }, { sb: 1000, bb: 2000, ante: 300, minutes: 8 }, { sb: 1500, bb: 3000, ante: 400, minutes: 8 },
  { sb: 2000, bb: 4000, ante: 500, minutes: 8 }, { sb: 3000, bb: 6000, ante: 1000, minutes: 8 },
];

export const DEFAULT_TOURNAMENT = Object.freeze({
  startingStack: 10000,
  schedule: DEFAULT_SCHEDULE,
  lateRegLevels: 3, // registration stays open until this level ends
  maxEntrants: 90,
  payouts: [50, 30, 20], // percentage of the prize pool for 1st, 2nd, 3rd…
  prize: 'points', // 'points' (non-monetary) or 'chips' (virtual chips credited to accounts)
  perEntrant: 100, // the pool is this many points (or chips) per entrant
});

const int = (x, d, lo, hi) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const pick = (x, list, d) => (list.includes(x) ? x : d);
const str = (x, d, max = 40) => { const s = String(x ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max); return s || d; };

/** Clean table settings. Blinds: sb ≥ 1, bb ≥ sb. Buy-ins in chips. */
export function cleanTable(x = {}, base = DEFAULT_TABLE) {
  const b = { ...DEFAULT_TABLE, ...base };
  const sb = int(x.sb ?? b.sb, b.sb, 1, 1e7);
  const bb = int(x.bb ?? b.bb, Math.max(b.bb, sb), sb, 2e7);
  const minBuyIn = int(x.minBuyIn ?? Math.max(b.minBuyIn, bb), 20 * bb, bb, 1e9);
  return {
    sb, bb,
    ante: int(x.ante ?? b.ante, 0, 0, bb),
    seats: int(x.seats ?? b.seats, 6, 2, MAX_SEATS),
    minBuyIn,
    maxBuyIn: int(x.maxBuyIn ?? b.maxBuyIn, 100 * bb, minBuyIn, 1e9),
    actionSeconds: int(x.actionSeconds ?? b.actionSeconds, 25, 5, 600),
    timeBankSeconds: int(x.timeBankSeconds ?? b.timeBankSeconds, 30, 0, 600),
    presets: cleanPresets(x.presets ?? b.presets),
    showdownReveal: pick(x.showdownReveal ?? b.showdownReveal, ['winners', 'all'], 'winners'),
    revealFoldedInHistory: !!(x.revealFoldedInHistory ?? b.revealFoldedInHistory),
    newPlayers: pick(x.newPlayers ?? b.newPlayers, ['wait-bb', 'immediate'], 'wait-bb'),
    idleSitOut: int(x.idleSitOut ?? b.idleSitOut, 2, 1, 20),
    sitOutMinutes: int(x.sitOutMinutes ?? b.sitOutMinutes, 15, 1, 1440),
    botLevel: pick(x.botLevel ?? b.botLevel, BOT_LEVELS, 'medium'),
  };
}

export function cleanSchedule(list) {
  if (!Array.isArray(list) || !list.length) return DEFAULT_SCHEDULE.map((l) => ({ ...l }));
  const out = [];
  for (const l of list.slice(0, 60)) {
    const sb = int(l?.sb, 0, 1, 1e8);
    const bb = int(l?.bb, 2 * sb, sb, 2e8);
    out.push({ sb, bb, ante: int(l?.ante, 0, 0, bb), minutes: int(l?.minutes, 8, 1, 240) });
  }
  return out;
}

export function cleanTournament(x = {}) {
  const d = DEFAULT_TOURNAMENT;
  let payouts = Array.isArray(x.payouts) ? x.payouts.map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 20) : d.payouts.slice();
  const total = payouts.reduce((a, b) => a + b, 0);
  if (!payouts.length || total <= 0) payouts = d.payouts.slice();
  else payouts = payouts.map((p) => Math.round((p * 1000) / total) / 10); // normalise to 100%
  return {
    startingStack: int(x.startingStack, d.startingStack, 100, 1e9),
    schedule: cleanSchedule(x.schedule),
    lateRegLevels: int(x.lateRegLevels, d.lateRegLevels, 0, 60),
    maxEntrants: int(x.maxEntrants, d.maxEntrants, 2, 1000),
    payouts,
    prize: pick(x.prize, ['points', 'chips'], 'points'),
    perEntrant: int(x.perEntrant, d.perEntrant, 0, 1e7),
  };
}

export const cleanName = (x, d = 'Table') => str(x, d, 40);
export const cleanPlayerName = (x) => str(x, '', 20).replace(/[^\p{L}\p{N} ._'-]/gu, '').trim();

/** Prize for each finishing place: integer points (or chips), summing exactly to the pool. */
export function prizeTable(payouts, entrants, perEntrant) {
  const pool = entrants * perEntrant;
  const n = Math.min(payouts.length, entrants);
  const pct = payouts.slice(0, n);
  const sum = pct.reduce((a, b) => a + b, 0);
  const out = pct.map((p) => Math.floor((pool * p) / sum));
  let left = pool - out.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % n) { out[i]++; left--; }
  return out; // out[0] is first place
}
