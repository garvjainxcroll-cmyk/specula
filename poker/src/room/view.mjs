// What one viewer may see of a room. This is the only shape that ever leaves the server
// for a table: it never contains the deck, the burned cards, the cards still to come, or any
// hole card the viewer is not entitled to (their own; hands turned face up; nothing else —
// not even for the Event Head or the Big Screen while a hand is in play).
import { legalActions, middlePots, potTotal } from '../engine/hand.mjs';
import { evaluate } from '../engine/evaluator.mjs';
import { redactSummary } from './history.mjs';
import { prizeTable } from './config.mjs';

const AWAY_MS = 45000;

/**
 * viewer: { acct?: string, host?: boolean, screen?: boolean }
 * Returns a plain object safe to send to that viewer.
 */
export function viewRoom(room, viewer = {}, now = 0) {
  const me = viewer.acct || null;
  let you = null;
  const tables = room.tables.filter((t) => !t.closed).map((t) => {
    const v = viewTable(room, t, me, now);
    if (v.you) you = { table: t.i, seat: v.you.seat, sittingOut: v.you.sittingOut, waitBB: v.you.waitBB, leaving: v.you.leaving, busted: v.you.busted, stack: v.you.stack, autoMuck: v.you.autoMuck };
    delete v.you;
    return v;
  });
  const out = {
    id: room.id, code: room.code, kind: room.kind, name: room.name, private: room.private, status: room.status, paused: room.paused,
    ownerName: room.ownerName, isOwner: !!me && room.owner === me, v: room.v, now,
    cfg: publicCfg(room.cfg), pendingCfg: room.pendingCfg ? publicCfg(room.pendingCfg) : null,
    you, tables, notes: room.notes.slice(0, 15),
  };
  if (room.tour) out.tour = viewTour(room, me, now);
  if (viewer.host) out.books = { in: room.ledger.in, out: room.ledger.out, outbox: room.outbox.length };
  return out;
}

function publicCfg(c) {
  const { sb, bb, ante, seats, minBuyIn, maxBuyIn, actionSeconds, timeBankSeconds, presets, showdownReveal, revealFoldedInHistory, newPlayers, idleSitOut, sitOutMinutes, botLevel } = c;
  return { sb, bb, ante, seats, minBuyIn, maxBuyIn, actionSeconds, timeBankSeconds, presets, showdownReveal, revealFoldedInHistory, newPlayers, idleSitOut, sitOutMinutes, botLevel };
}

function viewTable(room, t, me, now) {
  const h = t.hand;
  const live = h && h.status === 'betting';
  const complete = h && h.status === 'complete';
  let you = null;
  const seats = t.seats.map((x, s) => {
    if (!x) return null;
    const p = h ? h.players.find((q) => q.seat === s && q.id === x.acct) : null;
    const mine = !!me && x.acct === me;
    let cards = null;
    if (p && !p.folded) cards = mine || p.shown ? p.cards.slice() : ['back', 'back'];
    if (p && p.folded && mine) cards = p.cards.slice(); // you can still see your own folded cards
    const seat = {
      seat: s, name: x.name, avatar: x.avatar, bot: x.bot ? x.bot.level : null,
      stack: p && live ? p.stack : x.stack,
      sittingOut: x.sittingOut, waitBB: x.waitBB, leaving: x.leaving, busted: x.busted,
      away: !x.bot && now - x.lastSeen > AWAY_MS,
      isYou: mine,
      inHand: !!p, folded: !!p?.folded, allIn: !!p?.allIn,
      bet: p && live ? p.bet : 0,
      last: p?.last || null,
      cards, shown: !!p?.shown, foldedCards: p && p.folded && mine,
      hand: p && p.shown && p.hand ? { desc: p.hand.desc, best: p.hand.best } : null,
      timeouts: x.timeouts,
    };
    if (mine && p && !p.folded && h.board.length >= 3) seat.myHand = evaluate([...p.cards, ...h.board]).desc; // what you hold right now
    if (mine) you = { ...seat, autoMuck: x.autoMuck };
    return seat;
  });
  const v = {
    i: t.i, handNo: t.handNo, button: t.button, seats, you,
    hand: null, recent: t.recent.map((r) => redactSummary(r, { acct: me }, room.cfg.revealFoldedInHistory || room.kind === 'practice')),
    nextAt: t.nextAt, breaking: t.breaking,
  };
  if (h) {
    const youSeat = you ? you.seat : null;
    v.hand = {
      id: h.id, no: h.no, status: h.status, street: h.street, board: h.board.slice(),
      button: h.button, sbSeat: h.sbSeat, bbSeat: h.bbSeat, blinds: h.blinds,
      currentBet: live ? h.currentBet : 0, minRaise: h.minRaise, seq: h.seq,
      toAct: live ? h.toAct : null, turnAt: live ? t.turnAt : null, deadline: live ? t.deadline : null,
      actionMs: room.cfg.actionSeconds * 1000,
      pot: potTotal(h), pots: middlePots(h),
      legal: live && youSeat !== null && h.toAct === youSeat ? legalActions(h, youSeat) : null,
      log: redactEvents(h, youSeat),
      result: complete ? publicResult(h) : null,
      runout: h.runout, voided: !!h.voided,
    };
  }
  return v;
}

function redactEvents(h, youSeat) {
  const shown = new Set(h.players.filter((p) => p.shown).map((p) => p.seat));
  return h.events.map((e) => {
    if (e.t === 'deal') return e.seat === youSeat || shown.has(e.seat) ? e : { t: 'deal', seat: e.seat, cards: null };
    return e;
  });
}

function publicResult(h) {
  return {
    showdown: h.result.showdown, voided: !!h.result.voided,
    pots: h.result.pots.map((p) => ({
      amount: p.amount, eligible: p.eligible,
      winners: p.winners.map((w) => {
        const pl = h.players.find((x) => x.seat === w.seat);
        return { seat: w.seat, name: pl.name, amount: w.amount, hand: pl.shown && pl.hand ? pl.hand.desc : null, best: pl.shown && pl.hand ? pl.hand.best : null };
      }),
    })),
  };
}

function viewTour(room, me, now) {
  const tour = room.tour;
  const stacks = new Map();
  for (const t of room.tables) if (!t.closed) for (const x of t.seats) if (x) stacks.set(x.acct, { stack: x.stack, table: t.i });
  for (const t of room.tables) {
    if (t.closed || !t.hand || t.hand.status !== 'betting') continue;
    for (const p of t.hand.players) { const s = stacks.get(p.id); if (s) s.stack = p.stack + p.committed; }
  }
  const playing = tour.entrants.filter((e) => e.status === 'playing');
  const standings = playing.map((e) => ({ name: e.name, bot: !!e.bot, chips: stacks.get(e.acct)?.stack ?? 0, table: (stacks.get(e.acct)?.table ?? e.table) + 1, isYou: e.acct === me }))
    .sort((a, b) => b.chips - a.chips);
  const level = tour.schedule[tour.level];
  const nextLevel = tour.schedule[tour.level + 1] || null;
  const totalChips = standings.reduce((a, s) => a + s.chips, 0);
  return {
    status: tour.status, level: tour.level + 1, levels: tour.schedule.length, blinds: level, next: nextLevel,
    levelEndsAt: tour.levelEndsAt, pausedLeft: tour.pausedLeft,
    lateRegOpen: tour.status === 'registering' || ((tour.status === 'running' || tour.status === 'paused') && tour.level < tour.lateRegLevels),
    lateRegLevels: tour.lateRegLevels,
    startingStack: tour.startingStack, maxEntrants: tour.maxEntrants,
    entrants: tour.entrants.length, left: playing.length, avgStack: playing.length ? Math.round(totalChips / playing.length) : 0,
    registered: tour.entrants.map((e) => ({ name: e.name, bot: !!e.bot, status: e.status, place: e.place, isYou: e.acct === me })),
    you: me ? (tour.entrants.find((e) => e.acct === me) ? { status: tour.entrants.find((e) => e.acct === me).status, place: tour.entrants.find((e) => e.acct === me).place } : null) : null,
    standings,
    prize: tour.prize, payouts: tour.payouts, prizes: prizeTable(tour.payouts, Math.max(tour.entrants.length, 2), tour.perEntrant),
    results: tour.results,
    schedule: tour.schedule,
    tables: room.tables.filter((t) => !t.closed).length,
  };
}

/** A short line for the lobby. */
export function lobbyEntry(room) {
  const seated = room.tables.reduce((a, t) => a + (t.closed ? 0 : t.seats.filter(Boolean).length), 0);
  const humans = room.tables.reduce((a, t) => a + (t.closed ? 0 : t.seats.filter((x) => x && !x.bot).length), 0);
  return {
    id: room.id, code: room.private ? null : room.code, kind: room.kind, name: room.name, private: room.private, status: room.status,
    sb: room.cfg.sb, bb: room.cfg.bb, ante: room.cfg.ante, seats: room.cfg.seats, seated, humans, minBuyIn: room.cfg.minBuyIn, maxBuyIn: room.cfg.maxBuyIn,
    actionSeconds: room.cfg.actionSeconds, ownerName: room.ownerName,
    tour: room.tour ? { status: room.tour.status, entrants: room.tour.entrants.length, startingStack: room.tour.startingStack, level: room.tour.level + 1, lateRegOpen: room.tour.status === 'registering' || (room.tour.status !== 'finished' && room.tour.level < room.tour.lateRegLevels), blinds: room.tour.schedule[room.tour.level] } : null,
    createdAt: room.createdAt, v: room.v,
  };
}
