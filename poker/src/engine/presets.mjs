// Bet-size buttons. These are shortcuts for choosing a no-limit amount, not separate
// betting structures. Every result is a "raise to" (the player's total bet this round),
// rounded to the table's chip unit and kept inside the legal range.
//
// Pot-based sizes use the pot AFTER the player calls, the standard way to size a pot bet:
//   no bet yet:   bet = f × pot
//   facing a bet: raise to = current bet + f × (pot + amount to call)
// where "pot" is every chip in the middle, including the bets in front of players.
// Example: blinds 50/100, first to act. Pot 150, to call 100 → pot raise to 100 + 250 = 350.

export const DEFAULT_PRESETS = Object.freeze({
  small: { mode: 'pot', value: 25 }, // Small Bet: 25% of the pot
  big: { mode: 'pot', value: 75 }, // Big Bet: 75% of the pot
});

export const PRESET_BUTTONS = [
  ['small', 'Small Bet'], ['big', 'Big Bet'], ['half', '½ Pot'], ['twothirds', '⅔ Pot'], ['threequarters', '¾ Pot'],
  ['pot', 'Pot'], ['min', 'Min Raise'], ['allin', 'All-In'],
];

const FRACTION = { half: 1 / 2, twothirds: 2 / 3, threequarters: 3 / 4, pot: 1 };

/** Validate and clean a { small, big } presets object from settings. */
export function cleanPresets(x) {
  const one = (p, d) => {
    const mode = p?.mode === 'bb' ? 'bb' : 'pot';
    let value = Number(p?.value);
    if (!Number.isFinite(value) || value <= 0) value = d.value;
    value = mode === 'pot' ? Math.min(500, Math.max(5, Math.round(value))) : Math.min(100, Math.max(1, Math.round(value * 10) / 10));
    return { mode, value };
  };
  return { small: one(x?.small, DEFAULT_PRESETS.small), big: one(x?.big, DEFAULT_PRESETS.big) };
}

const roundTo = (x, unit) => Math.round(x / unit) * unit;
export const clampTo = (legal, to) => Math.max(legal.minTo, Math.min(legal.maxTo, Math.round(to)));

/** The raise-to for a pot fraction f, before clamping. */
export function potTo(legal, f) {
  const facing = legal.currentBet > 0;
  return facing ? legal.currentBet + f * (legal.pot + legal.toCall) : f * legal.pot;
}

/**
 * Amount for a preset button. Returns { to, clamped, label } or null when no bet or raise is
 * possible. `unit` is the chip unit for rounding (normally the small blind).
 */
export function presetAmount(legal, kind, presets = DEFAULT_PRESETS, unit = 1) {
  if (!legal || !(legal.canBet || legal.canRaise)) return null;
  const p = cleanPresets(presets);
  let raw;
  if (kind === 'min') raw = legal.minTo;
  else if (kind === 'allin') raw = legal.maxTo;
  else if (kind === 'small' || kind === 'big') {
    const c = p[kind];
    if (c.mode === 'pot') raw = potTo(legal, c.value / 100);
    else {
      // "N big blinds": bet (or open-raise to) N big blinds; facing a bet or raise, raise by N big blinds.
      const unopened = legal.currentBet === 0 || (legal.street === 'preflop' && legal.currentBet <= legal.bb);
      raw = unopened ? c.value * legal.bb : legal.currentBet + c.value * legal.bb;
    }
  } else if (FRACTION[kind]) raw = potTo(legal, FRACTION[kind]);
  else return null;
  const rounded = kind === 'min' || kind === 'allin' ? raw : roundTo(raw, Math.max(1, unit));
  const to = clampTo(legal, rounded);
  return { to, clamped: to !== Math.round(rounded), allIn: to === legal.maxTo };
}

/** Everything the betting panel shows for a chosen raise-to. */
export function betSummary(legal, to) {
  const t = clampTo(legal, to);
  const add = t - legal.bet;
  return {
    to: t,
    add, // chips this action puts in
    stackAfter: legal.stack - add,
    committedAfter: legal.committed + add, // this player's total in the pot this hand
    potAfter: legal.pot + add,
    allIn: t === legal.maxTo,
    isRaise: legal.currentBet > 0,
  };
}
