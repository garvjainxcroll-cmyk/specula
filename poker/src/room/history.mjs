// Hand records: the full record kept on the server, the short summary kept at the table, and
// the redacted copy a particular viewer may see.

/** The complete record of a finished hand (server-side; contains every hole card). */
export function handRecord(room, t, h, now) {
  return {
    id: h.id, room: room.id, roomName: room.name, kind: room.kind, private: room.private, table: t.i, no: h.no, at: now,
    blinds: h.blinds, button: h.button, sbSeat: h.sbSeat, bbSeat: h.bbSeat,
    revealFolded: !!room.cfg.revealFoldedInHistory || room.kind === 'practice',
    players: h.players.map((p) => ({
      seat: p.seat, id: p.id, name: p.name, bot: p.bot, start: p.start, end: p.stack, net: p.stack - p.start,
      cards: p.cards.slice(), shown: p.shown, folded: p.folded, hand: p.hand ? p.hand.desc : null,
    })),
    board: h.board.slice(),
    events: h.events,
    result: h.result,
    voided: !!h.voided,
  };
}

/** Short summary for the table's "previous hands" list. */
export function handSummary(h, now) {
  const won = new Map();
  for (const pot of h.result.pots) for (const w of pot.winners) won.set(w.seat, (won.get(w.seat) || 0) + w.amount);
  return {
    id: h.id, no: h.no, at: now, board: h.board.slice(), showdown: h.result.showdown, voided: !!h.voided,
    pot: h.players.reduce((a, p) => a + p.committed, 0),
    winners: [...won.entries()].map(([seat, amount]) => {
      const p = h.players.find((x) => x.seat === seat);
      return { seat, name: p.name, amount, hand: p.hand ? p.hand.desc : null };
    }),
    players: h.players.map((p) => ({ seat: p.seat, id: p.id, name: p.name, net: p.stack - p.start, cards: p.cards.slice(), shown: p.shown, folded: p.folded })),
  };
}

/**
 * Which hole cards a viewer may see in a finished hand: their own, any hand that was shown,
 * and — only where the table allows it, or for the Event Head's audit — folded hands.
 */
export function visibleCards(p, viewer, revealFolded) {
  if (viewer?.host) return p.cards;
  if (viewer?.acct && p.id === viewer.acct) return p.cards;
  if (p.shown) return p.cards;
  if (revealFolded) return p.cards;
  return null;
}

export function redactRecord(rec, viewer) {
  const vis = new Map(rec.players.map((p) => [p.seat, visibleCards(p, viewer, rec.revealFolded)]));
  return {
    ...rec,
    players: rec.players.map((p) => ({ ...p, cards: vis.get(p.seat) })),
    events: rec.events.filter((e) => e.t !== 'deal' || vis.get(e.seat)).map((e) => (e.t === 'deal' ? { ...e, cards: vis.get(e.seat) } : e)),
  };
}

export function redactSummary(s, viewer, revealFolded) {
  return { ...s, players: s.players.map((p) => ({ ...p, cards: visibleCards(p, viewer, revealFolded) })) };
}
