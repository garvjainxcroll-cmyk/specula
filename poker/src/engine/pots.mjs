// Main pot and side pots, and paying them out.
// Every chip a player put in this hand is in `committed`. Pots are built in layers at each
// all-in amount of a player still in the hand: a player can win from a layer only if they
// are still in the hand and put chips into that layer. Folded players' chips stay in the
// pots they reached, but folded players never win.

/**
 * players: [{ seat, committed, folded, allIn }]. Returns [{ amount, eligible: [seat] }],
 * main pot first. Sum of amounts always equals the sum of committed.
 */
export function buildPots(players) {
  const live = players.filter((p) => !p.folded);
  const caps = [...new Set(live.filter((p) => p.allIn).map((p) => p.committed))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const cap of [...caps, Infinity]) {
    let amount = 0;
    for (const p of players) amount += Math.max(0, Math.min(p.committed, cap) - prev);
    const eligible = live.filter((p) => p.committed > prev).map((p) => p.seat);
    if (amount > 0) {
      if (eligible.length) pots.push({ amount, eligible });
      else if (pots.length) pots[pots.length - 1].amount += amount; // safeguard: dead money joins the last contested pot
      else pots.push({ amount, eligible: live.map((p) => p.seat) });
    }
    prev = cap;
  }
  // merge neighbours with the same eligible players (possible when an all-in matches another's level)
  const out = [];
  for (const p of pots) {
    const last = out[out.length - 1];
    if (last && last.eligible.length === p.eligible.length && last.eligible.every((s, i) => s === p.eligible[i])) last.amount += p.amount;
    else out.push({ amount: p.amount, eligible: p.eligible.slice() });
  }
  return out;
}

/**
 * Split each pot among the best eligible hands.
 *  pots: from buildPots; scores: Map/object seat → score (only players at showdown);
 *  oddOrder: seats in the order odd chips are given — clockwise starting left of the button.
 * Returns [{ i, amount, winners: [{ seat, amount }] }]. Odd chips go one at a time to the
 * tied winners in oddOrder, so no chip is ever created or lost.
 */
export function awardPots(pots, scores, oddOrder) {
  const sc = scores instanceof Map ? scores : new Map(Object.entries(scores).map(([k, v]) => [Number(k), v]));
  return pots.map((pot, i) => {
    const contenders = pot.eligible.filter((s) => sc.has(s));
    if (!contenders.length) throw new Error(`Pot ${i} has no eligible hand at showdown`);
    let best = -Infinity;
    for (const s of contenders) best = Math.max(best, sc.get(s));
    const tied = contenders.filter((s) => sc.get(s) === best);
    const ordered = oddOrder.filter((s) => tied.includes(s));
    for (const s of tied) if (!ordered.includes(s)) ordered.push(s);
    const share = Math.floor(pot.amount / ordered.length);
    let odd = pot.amount - share * ordered.length;
    const winners = ordered.map((seat) => { const extra = odd > 0 ? 1 : 0; odd -= extra; return { seat, amount: share + extra }; });
    return { i, amount: pot.amount, winners };
  });
}
