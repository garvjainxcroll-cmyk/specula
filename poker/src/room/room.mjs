// A room is one game: a cash table, a private table, a practice table or a whole tournament
// (all its tables live in the one room, so moving players between tables is a single safe
// write). Everything here is pure: the clock (`now`, in ms) and the random source (`rng`)
// are passed in, so the server, the tests and the offline practice table all run the same
// code. Functions change the room object they are given; the server always works on a fresh
// copy read from storage and writes it back only if nobody else changed it meanwhile.
//
// Chips: a room keeps books (`ledger.in` chips brought to the table, `ledger.out` chips taken
// away). Chips leaving a cash table for a player's account are written to the room's outbox in
// the same write that takes them off the table, and the server delivers each outbox item
// exactly once (by its id). So chips are never lost or paid twice, even if a request fails.
//
// Button: a simplified "moving button": it moves to the next player dealt in, clockwise.
import { startHand, act as handAct, autoAction, legalActions, showCards as handShow, positions, after, HandError, checkChips } from '../engine/hand.mjs';
import { freshDeck, shuffle } from '../engine/cards.mjs';
import { decide, thinkMs, BOT_NAMES } from '../bots/bot.mjs';
import { cleanTable, cleanTournament, prizeTable } from './config.mjs';
import { handRecord, handSummary } from './history.mjs';

export class RoomError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const err = (code, msg) => new RoomError(code, msg);

const RECENT = 10;
const APPLIED = 400;
const NOTES = 40;
export const DELAY = { start: 2500, uncontested: 2400, showdown: 6000, perRunoutStreet: 1300 };

// ---------------- creating ----------------

export function newTable(i, seats) {
  return { i, seats: Array(seats).fill(null), button: null, handNo: 0, hand: null, nextAt: null, turnAt: null, deadline: null, botAt: null, recent: [], closed: false, breaking: false };
}

/** kind: 'cash' | 'tournament' | 'practice'. */
export function createRoom({ id, code, kind = 'cash', name = 'Table', isPrivate = false, owner = 'host', ownerName = 'Event Head', cfg = {}, tour = {} }, now) {
  if (!['cash', 'tournament', 'practice'].includes(kind)) throw err('bad-kind', 'Unknown game type');
  const c = cleanTable(cfg);
  if (kind === 'practice') c.revealFoldedInHistory = true;
  const room = {
    id, code, kind, name, private: !!isPrivate, owner, ownerName, createdAt: now, status: 'open', paused: false,
    cfg: c, pendingCfg: null, tables: [], tour: null, outbox: [], applied: [], nextOut: 1, v: 1,
    ledger: { in: 0, out: 0, botIn: 0, botOut: 0 }, notes: [],
  };
  if (kind === 'tournament') {
    room.tour = { ...cleanTournament(tour), status: 'registering', level: 0, levelEndsAt: null, pausedLeft: null, entrants: [], results: [], startedAt: null, finishedAt: null };
  } else room.tables.push(newTable(0, c.seats));
  note(room, now, `${room.name} opened`);
  return room;
}

function note(room, now, text) {
  room.notes.unshift({ at: now, text });
  if (room.notes.length > NOTES) room.notes.length = NOTES;
}
function outbox(room, item) {
  room.outbox.push({ ...item, id: `${room.id}:${room.nextOut++}` });
}
function applied(room, xferId) { return !!xferId && room.applied.includes(xferId); }
function markApplied(room, xferId) {
  if (!xferId) return;
  room.applied.push(xferId);
  if (room.applied.length > APPLIED) room.applied.splice(0, room.applied.length - APPLIED);
}

// ---------------- finding things ----------------

export function findSeat(room, acct) {
  for (const t of room.tables) {
    if (t.closed) continue;
    const s = t.seats.findIndex((x) => x && x.acct === acct);
    if (s >= 0) return { t, s, seat: t.seats[s] };
  }
  return null;
}
const inLiveHand = (t, s) => !!(t.hand && t.hand.status === 'betting' && t.hand.players.some((p) => p.seat === s && !p.folded));
const dealtIn = (t, s) => !!(t.hand && t.hand.status === 'betting' && t.hand.players.some((p) => p.seat === s));
const handPlayer = (t, s) => t.hand?.players.find((p) => p.seat === s) || null;
export const isLive = (t) => !!(t.hand && t.hand.status === 'betting');
export const playersAt = (t) => t.seats.filter(Boolean);

function newSeat(room, { acct, name, avatar, bot = null, stack, autoMuck = true }, now, waitBB) {
  return {
    acct, name, avatar: avatar || null, bot, stack, sittingOut: false, sitOutNext: false, sitOutAt: null, waitBB: !!waitBB,
    lastSeen: now, timeouts: 0, bank: room.cfg.timeBankSeconds * 1000, leaving: false, autoMuck: autoMuck !== false,
    joinedAt: now, buyIn: stack, busted: false,
  };
}

// ---------------- sitting down, leaving, chips ----------------

/** A player (or a bot) sits at a cash or practice table with `stack` chips. */
export function sit(room, { acct, name, avatar, bot = null, stack, table = 0, seat = null, xferId = null, autoMuck = true }, now) {
  if (room.status !== 'open') throw err('closed', 'This table is closed');
  if (room.kind === 'tournament') throw err('tournament', 'Register for the tournament instead');
  if (applied(room, xferId)) return findSeat(room, acct);
  if (findSeat(room, acct)) throw err('seated', 'You already have a seat here');
  const t = room.tables[table];
  if (!t || t.closed) throw err('no-table', 'No such table');
  let s = seat === null || seat === undefined ? t.seats.findIndex((x) => !x) : Number(seat);
  if (!(s >= 0 && s < t.seats.length)) throw err('full', 'The table is full');
  if (t.seats[s]) throw err('taken', 'That seat is taken');
  if (!Number.isInteger(stack) || stack <= 0) throw err('amount', 'Choose how many chips to bring');
  if (room.kind === 'cash' && !bot && (stack < room.cfg.minBuyIn || stack > room.cfg.maxBuyIn)) throw err('amount', `Bring between ${room.cfg.minBuyIn} and ${room.cfg.maxBuyIn} chips`);
  const running = isLive(t) || playersAt(t).filter((p) => !p.sittingOut && p.stack > 0).length >= 2;
  t.seats[s] = newSeat(room, { acct, name, avatar, bot, stack, autoMuck }, now, room.cfg.newPlayers === 'wait-bb' && running && !bot);
  room.ledger.in += stack;
  if (bot) room.ledger.botIn += stack;
  markApplied(room, xferId);
  if (!t.hand && t.nextAt === null) t.nextAt = now + 1500;
  note(room, now, `${name}${bot ? ' (bot)' : ''} sat down with ${stack}`);
  room.v++;
  return { t, s, seat: t.seats[s] };
}

function cashOut(room, t, s, now, why) {
  const seat = t.seats[s];
  if (!seat) return 0;
  const amount = seat.stack;
  room.ledger.out += amount;
  if (seat.bot) room.ledger.botOut += amount;
  if (!seat.bot && room.kind === 'cash') outbox(room, { kind: 'cashout', acct: seat.acct, amount, room: room.id, roomName: room.name, at: now });
  t.seats[s] = null;
  note(room, now, `${seat.name} left the table${amount ? ` with ${amount}` : ''}${why ? ` (${why})` : ''}`);
  return amount;
}

/**
 * Leave the table. Between hands (or after folding) the player goes at once with their chips.
 * In the middle of a hand they fold when their turn comes and leave when the hand ends.
 */
export function leave(room, acct, now, rng) {
  if (room.kind === 'tournament') return tournamentLeave(room, acct, now);
  const f = findSeat(room, acct);
  if (!f) throw err('not-seated', 'You are not at this table');
  const { t, s, seat } = f;
  if (inLiveHand(t, s)) {
    seat.leaving = true;
    room.v++;
    tick(room, now, rng);
    return { pending: true, amount: 0 };
  }
  const amount = cashOut(room, t, s, now);
  room.v++;
  return { pending: false, amount };
}

/** Sit out: from the next hand you are not dealt in (in a tournament your blinds are still posted). */
export function sitOut(room, acct, on, now) {
  const f = findSeat(room, acct);
  if (!f) throw err('not-seated', 'You are not at this table');
  const { t, s, seat } = f;
  if (on) {
    if (dealtIn(t, s) && room.kind !== 'tournament') seat.sitOutNext = true;
    else { seat.sittingOut = true; seat.sitOutAt = now; }
  } else {
    if (seat.stack <= 0) throw err('busted', room.kind === 'practice' ? 'Reload your chips first' : 'Top up your chips first');
    seat.sittingOut = false; seat.sitOutNext = false; seat.sitOutAt = null; seat.timeouts = 0;
    if (!t.hand && t.nextAt === null) t.nextAt = now + 1500;
  }
  room.v++;
  return seat;
}

/** Add chips between hands (cash: from the player's account, up to the maximum buy-in; practice: free reload). */
export function topUp(room, acct, amount, now, xferId = null) {
  if (room.kind === 'tournament') throw err('tournament', 'No top-ups in a tournament');
  if (applied(room, xferId)) return findSeat(room, acct)?.seat;
  const f = findSeat(room, acct);
  if (!f) throw err('not-seated', 'You are not at this table');
  const { t, s, seat } = f;
  if (dealtIn(t, s)) throw err('in-hand', 'You can add chips between hands');
  if (!Number.isInteger(amount) || amount <= 0) throw err('amount', 'Choose an amount');
  if (seat.stack + amount > room.cfg.maxBuyIn) throw err('amount', `The most you can have at this table is ${room.cfg.maxBuyIn}`);
  const wasBusted = seat.busted;
  seat.stack += amount; seat.buyIn += amount; seat.busted = false;
  room.ledger.in += amount;
  markApplied(room, xferId);
  if (wasBusted) { seat.sittingOut = false; seat.sitOutAt = null; seat.timeouts = 0; } // back in the game
  if (!t.hand && t.nextAt === null) t.nextAt = now + 1500;
  room.v++;
  return seat;
}

/** The host (or a private table's owner) removes a player. Their chips go back to their account. */
export function kick(room, acct, now, rng) {
  if (room.kind === 'tournament') {
    const e = room.tour.entrants.find((x) => x.acct === acct);
    if (!e) throw err('not-seated', 'Not in this tournament');
    const f = findSeat(room, acct);
    if (f) { f.seat.sittingOut = true; room.v++; }
    if (room.tour.status === 'registering') return tournamentLeave(room, acct, now);
    return { pending: true };
  }
  const f = findSeat(room, acct);
  if (!f) throw err('not-seated', 'Not at this table');
  return leave(room, acct, now, rng);
}

export function addBot(room, { level, table = 0, stack, id }, now, rng) {
  if (room.kind === 'tournament') return registerTournament(room, { acct: id, name: botName(room, rng), bot: { level } }, now);
  const t = room.tables[table];
  const s = t.seats.findIndex((x) => !x);
  if (s < 0) throw err('full', 'The table is full');
  return sit(room, { acct: id, name: botName(room, rng), bot: { level: level || room.cfg.botLevel }, stack: stack ?? room.cfg.maxBuyIn, table, seat: s }, now);
}
function botName(room, rng) {
  const used = new Set(room.tables.flatMap((t) => t.seats.filter(Boolean).map((x) => x.name)).concat(room.tour ? room.tour.entrants.map((e) => e.name) : []));
  const free = BOT_NAMES.filter((n) => !used.has(n));
  return free.length ? free[rng.int(free.length)] : `Bot ${1 + rng.int(999)}`;
}
export function removeBot(room, acct, now, rng) {
  const f = findSeat(room, acct);
  if (!f || !f.seat.bot) throw err('not-bot', 'No such bot');
  return leave(room, acct, now, rng);
}

/** Change settings: at once between hands, otherwise from the next hand (never mid-hand). */
export function setConfig(room, cfg, now) {
  const next = cleanTable({ ...room.cfg, ...cfg }, room.cfg);
  if (room.kind === 'practice') next.revealFoldedInHistory = true;
  for (const t of room.tables) if (t.seats.slice(next.seats).some(Boolean)) throw err('seats', 'Ask the players in the higher seats to move before making the table smaller');
  if (room.tables.some(isLive)) { room.pendingCfg = next; note(room, now, 'New settings will apply from the next hand'); } else applyConfig(room, next, now);
  room.v++;
  return room.pendingCfg || room.cfg;
}
function applyConfig(room, next, now) {
  room.cfg = next;
  room.pendingCfg = null;
  for (const t of room.tables) {
    if (t.seats.length < next.seats) t.seats.push(...Array(next.seats - t.seats.length).fill(null));
    else if (t.seats.length > next.seats && !t.seats.slice(next.seats).some(Boolean)) t.seats.length = next.seats;
  }
  note(room, now, `Settings: blinds ${next.sb}/${next.bb}${next.ante ? `, ante ${next.ante}` : ''}, ${next.actionSeconds}s to act`);
}

export function setPaused(room, on, now) {
  room.paused = !!on;
  if (!on) for (const t of room.tables) if (!t.hand && t.nextAt === null) t.nextAt = now + 1500;
  note(room, now, on ? 'Paused by the host: the hand in play will finish' : 'Resumed');
  room.v++;
}

export function closeRoom(room, now) {
  if (room.tables.some(isLive)) throw err('in-hand', 'Wait for the hand to finish, or pause the table first');
  for (const t of room.tables) for (let s = 0; s < t.seats.length; s++) if (t.seats[s]) cashOut(room, t, s, now, 'table closed');
  room.status = 'closed';
  room.v++;
}

/** Event Head only: cancel the hand in play and give every player back what they started it with. */
export function voidHand(room, tableIdx, now) {
  const t = room.tables[tableIdx];
  if (!t || !isLive(t)) throw err('no-hand', 'There is no hand in play at that table');
  const h = t.hand;
  h.voided = true; h.status = 'complete';
  for (const p of h.players) { p.stack = p.start; p.committed = 0; p.bet = 0; }
  h.result = { showdown: false, pots: [], winners: [], voided: true };
  h.events.push({ t: 'void' });
  for (const p of h.players) if (t.seats[p.seat] && t.seats[p.seat].acct === p.id) t.seats[p.seat].stack = p.start;
  outbox(room, { kind: 'hist', record: handRecord(room, t, h, now) });
  t.recent.unshift(handSummary(h, now)); t.recent.length = Math.min(t.recent.length, RECENT);
  t.nextAt = now + DELAY.start; t.deadline = null; t.botAt = null;
  note(room, now, `Hand #${h.no} at table ${t.i + 1} was cancelled by the Event Head; everyone got their chips back`);
  room.v++;
}

/** Keep the "last seen" time fresh, at most every 30 seconds (so polling does not write each time). */
export function touch(room, acct, now) {
  const f = findSeat(room, acct);
  if (!f || now - f.seat.lastSeen < 30000) return false;
  f.seat.lastSeen = now;
  return true;
}

export function setAutoMuck(room, acct, on) {
  const f = findSeat(room, acct);
  if (!f) return;
  f.seat.autoMuck = !!on;
  room.v++;
}

// ---------------- acting ----------------

/** A player's action. handId and seq must match the hand as the player saw it (no replays, no stale clicks). */
export function playerAct(room, acct, { handId, seq, type, to }, now, rng) {
  const f = findSeat(room, acct);
  if (!f) throw err('not-seated', 'You are not at this table');
  const { t, s, seat } = f;
  const h = t.hand;
  if (!h || h.id !== handId || h.status !== 'betting') throw err('stale', 'That hand is over');
  if (h.seq !== seq) throw err('stale', 'The action has moved on — your table has been refreshed');
  if (h.toAct !== s) throw err('not-your-turn', 'It is not your turn');
  let next;
  try { next = handAct(h, s, { type, to }); } catch (e) { if (e instanceof HandError) throw err(e.code, e.message); throw e; }
  const used = Math.max(0, now - (t.turnAt + room.cfg.actionSeconds * 1000));
  seat.bank = Math.max(0, seat.bank - used);
  seat.timeouts = 0;
  seat.lastSeen = now;
  afterHandChange(room, t, next, now, rng);
  tick(room, now, rng);
  room.v++;
  return next;
}

export function playerShow(room, acct, now) {
  const f = findSeat(room, acct);
  if (!f) throw err('not-seated', 'You are not at this table');
  const { t, s } = f;
  if (!t.hand || t.hand.status !== 'complete' || !handPlayer(t, s)) throw err('no-hand', 'There is nothing to show');
  t.hand = handShow(t.hand, s);
  const sum = t.recent.find((r) => r.id === t.hand.id);
  if (sum) { const p = sum.players.find((x) => x.seat === s); if (p) p.shown = true; }
  outbox(room, { kind: 'hist-show', handId: t.hand.id, seat: s });
  room.v++;
}

function afterHandChange(room, t, h, now, rng) {
  checkChips(h);
  t.hand = h;
  if (h.status === 'complete') return onComplete(room, t, now);
  t.turnAt = now;
  const seat = t.seats[h.toAct];
  t.deadline = now + room.cfg.actionSeconds * 1000 + (seat?.bank || 0);
  t.botAt = seat?.bot ? now + thinkMs(seat.bot.level, rng) : null;
}

function onComplete(room, t, now) {
  const h = t.hand;
  for (const p of h.players) {
    const seat = t.seats[p.seat];
    if (seat && seat.acct === p.id) seat.stack = p.stack;
  }
  t.recent.unshift(handSummary(h, now));
  if (t.recent.length > RECENT) t.recent.length = RECENT;
  outbox(room, { kind: 'hist', record: handRecord(room, t, h, now) });
  for (const p of h.players) {
    if (p.bot) continue;
    const won = h.result.pots.reduce((a, pot) => a + pot.winners.filter((w) => w.seat === p.seat).reduce((x, w) => x + w.amount, 0), 0);
    outbox(room, {
      kind: 'hand', acct: p.id, handId: h.id, room: room.id, roomName: room.name, roomKind: room.kind, at: now,
      net: p.stack - p.start, won: won > 0, showdown: h.result.showdown && !p.folded, wonShowdown: h.result.showdown && won > 0,
      pot: h.players.reduce((a, q) => a + q.committed, 0), hand: p.hand?.desc || null,
    });
  }
  const ri = h.events.findIndex((e) => e.t === 'reveal');
  const runoutStreets = ri >= 0 ? h.events.slice(ri).filter((e) => e.t === 'street').length : 0;
  t.nextAt = now + (h.result.showdown ? DELAY.showdown : DELAY.uncontested) + runoutStreets * DELAY.perRunoutStreet;
  t.deadline = null; t.botAt = null; t.turnAt = null;
  if (room.kind === 'tournament') tournamentBusts(room, t, h, now);
}

function applyAuto(room, t, reason, now, rng) {
  const s = t.hand.toAct;
  // leaving the table folds the hand; being away or out of time checks when that is free
  const next = reason === 'leave' ? handAct(t.hand, s, { type: 'fold', auto: 'leave' }) : autoAction(t.hand, s, reason);
  afterHandChange(room, t, next, now, rng);
}

function botMove(room, t, now, rng) {
  const h = t.hand;
  const s = h.toAct;
  const seat = t.seats[s];
  const p = h.players.find((x) => x.seat === s);
  const legal = legalActions(h, s);
  const order = after(h, h.button).filter((x) => !x.folded).map((x) => x.seat);
  const view = {
    hole: p.cards, board: h.board, legal, street: h.street,
    opponents: h.players.filter((x) => !x.folded && x.seat !== s).length,
    position: order.length > 1 ? order.indexOf(s) / (order.length - 1) : 1,
  };
  let next;
  try { next = handAct(h, s, decide(view, seat.bot.level, rng)); } catch (e) { if (!(e instanceof HandError)) throw e; next = autoAction(h, s, 'bot'); }
  afterHandChange(room, t, next, now, rng);
}

// ---------------- the clock ----------------

/**
 * Bring the room up to date at time `now`: time-outs, bots, players who left, the next hand,
 * the tournament clock. Safe to call as often as you like. Returns true if anything changed.
 */
export function tick(room, now, rng) {
  if (room.status !== 'open') return false;
  let changed = false;
  const tour = room.tour;
  if (tour && tour.status === 'running' && tour.levelEndsAt !== null && now >= tour.levelEndsAt) { advanceLevel(room, now); changed = true; }
  for (const t of room.tables) {
    if (t.closed) continue;
    for (let guard = 0; guard < 80; guard++) {
      if (!step(room, t, now, rng)) break;
      changed = true;
    }
  }
  if (changed) room.v++;
  return changed;
}

function step(room, t, now, rng) {
  if (t.closed) return false;
  const h = t.hand;
  if (h && h.status === 'betting') {
    const seat = t.seats[h.toAct];
    if (!seat || seat.leaving) { applyAuto(room, t, 'leave', now, rng); return true; }
    if (seat.sittingOut && !seat.bot) { applyAuto(room, t, 'away', now, rng); return true; }
    if (seat.bot) { if (now >= t.botAt) { botMove(room, t, now, rng); return true; } return false; }
    if (now >= t.deadline) {
      seat.timeouts += 1; seat.bank = 0;
      if (seat.timeouts >= room.cfg.idleSitOut) { seat.sittingOut = true; seat.sitOutAt = now; }
      applyAuto(room, t, 'timeout', now, rng);
      return true;
    }
    return false;
  }
  if (room.paused || (room.tour && room.tour.status !== 'running')) {
    if (room.tour && room.tour.status === 'finished' && h && h.status === 'complete' && t.nextAt !== null && now >= t.nextAt) { t.nextAt = null; return true; }
    return false;
  }
  const due = t.nextAt === null ? canStart(room, t) : now >= t.nextAt;
  if (!due) return false;
  return beginHand(room, t, now, rng);
}

function eligible(room, t) {
  return t.seats.map((x, s) => ({ x, s })).filter(({ x }) => x && x.stack > 0 && !x.leaving && (room.kind === 'tournament' || !x.sittingOut));
}
function canStart(room, t) { return eligible(room, t).length >= 2; }

function housekeeping(room, t, now, rng) {
  let changed = false;
  for (let s = 0; s < t.seats.length; s++) {
    const x = t.seats[s];
    if (!x) continue;
    if (x.leaving) { cashOut(room, t, s, now); changed = true; continue; }
    if (room.kind === 'tournament') {
      if (x.stack <= 0) { t.seats[s] = null; changed = true; }
      continue;
    }
    if (x.sitOutNext) { x.sittingOut = true; x.sitOutNext = false; x.sitOutAt = now; changed = true; }
    if (x.stack <= 0 && !x.busted) {
      if (x.bot) { // bots buy back in so practice can go on
        const amount = room.cfg.maxBuyIn; x.stack = amount; x.buyIn += amount; room.ledger.in += amount; room.ledger.botIn += amount;
        note(room, now, `${x.name} (bot) bought back in`);
      } else { x.busted = true; x.sittingOut = true; x.sitOutAt = now; }
      changed = true;
    }
    if (x.sittingOut && x.sitOutAt !== null && room.kind === 'cash' && now - x.sitOutAt > room.cfg.sitOutMinutes * 60000) { cashOut(room, t, s, now, 'sat out too long'); changed = true; }
  }
  return changed;
}

/** Start the next hand at a table if it can; otherwise tidy up. Returns true if anything changed. */
function beginHand(room, t, now, rng) {
  let changed = housekeeping(room, t, now, rng);
  if (room.pendingCfg && !room.tables.some(isLive)) { applyConfig(room, room.pendingCfg, now); changed = true; }
  if (room.kind === 'tournament') {
    if (balance(room, t, now, rng) === 'broken') return true;
    // how far this table is above the emptiest one as its hand starts (0 or 1 when balanced)
    const others = room.tables.filter((x) => !x.closed && !x.breaking && x !== t);
    t.spread = others.length ? count(t) - Math.min(...others.map(count)) : 0;
  }
  const el = eligible(room, t);
  if (el.length < 2) {
    if (t.hand || t.nextAt !== null) { t.hand = null; t.nextAt = null; changed = true; }
    return changed;
  }
  // who is dealt in: players waiting for the big blind join when it reaches them
  let base = el.filter(({ x }) => !x.waitBB).map(({ s }) => s);
  if (base.length < 2) { for (const { x } of el) x.waitBB = false; base = el.map(({ s }) => s); }
  const button = t.button === null ? base[rng.int(base.length)] : (base.find((s) => s > t.button) ?? base[0]);
  let dealt = base.slice();
  for (const { x, s } of el) {
    if (!x.waitBB) continue;
    const trial = [...dealt, s].sort((a, b) => a - b);
    if (positions(trial, button).bb === s) { x.waitBB = false; dealt = trial; break; } // the big blind has reached them
  }
  const blinds = room.kind === 'tournament' ? room.tour.schedule[room.tour.level] : room.cfg;
  const players = dealt.map((s) => {
    const x = t.seats[s];
    x.bank = Math.min(room.cfg.timeBankSeconds * 1000, x.bank + 2000);
    return { seat: s, id: x.acct, name: x.name, stack: x.stack, bot: !!x.bot, autoMuck: x.autoMuck };
  });
  t.handNo += 1;
  t.button = button;
  const h = startHand({
    id: `${room.id}.${t.i + 1}.${t.handNo}`, no: t.handNo, players, button,
    sb: blinds.sb, bb: blinds.bb, ante: blinds.ante || 0, deck: shuffle(freshDeck(), rng),
    revealAll: room.cfg.showdownReveal === 'all',
  });
  afterHandChange(room, t, h, now, rng);
  return true;
}

// ---------------- tournaments ----------------

export function registerTournament(room, { acct, name, avatar = null, bot = null }, now) {
  const tour = room.tour;
  if (!tour) throw err('not-tournament', 'This is not a tournament');
  if (tour.entrants.some((e) => e.acct === acct)) throw err('registered', 'Already registered');
  const late = tour.status === 'running' || tour.status === 'paused';
  if (tour.status === 'finished') throw err('closed', 'The tournament is over');
  if (late && tour.level >= tour.lateRegLevels) throw err('closed', 'Registration has closed');
  if (tour.entrants.length >= tour.maxEntrants) throw err('full', 'The tournament is full');
  const e = { acct, name, avatar, bot, status: 'registered', place: null, span: 1, table: null, at: now, prize: 0 };
  tour.entrants.push(e);
  if (late) seatLate(room, e, now);
  note(room, now, `${name}${bot ? ' (bot)' : ''} registered${late ? ' (late)' : ''}`);
  room.v++;
  return e;
}

function tournamentLeave(room, acct, now) {
  const tour = room.tour;
  const i = tour.entrants.findIndex((e) => e.acct === acct);
  if (i < 0) throw err('not-registered', 'You are not registered');
  if (tour.status === 'registering') {
    const [e] = tour.entrants.splice(i, 1);
    note(room, now, `${e.name} unregistered`);
    room.v++;
    return { pending: false, amount: 0 };
  }
  const f = findSeat(room, acct);
  if (f) { f.seat.sittingOut = true; room.v++; }
  return { pending: true, amount: 0, note: 'In a tournament your chips stay in play: you are sat out and your blinds are posted until you come back or are knocked out.' };
}

function seatLate(room, e, now) {
  const open = room.tables.filter((t) => !t.closed);
  let target = open.filter((t) => t.seats.some((x) => !x)).sort((a, b) => playersAt(a).length - playersAt(b).length)[0];
  if (!target) { target = newTable(room.tables.length, room.cfg.seats); room.tables.push(target); }
  const free = target.seats.map((x, s) => (x ? -1 : s)).filter((s) => s >= 0);
  const s = free[0];
  target.seats[s] = newSeat(room, { acct: e.acct, name: e.name, avatar: e.avatar, bot: e.bot, stack: room.tour.startingStack }, now, false);
  e.status = 'playing'; e.table = target.i;
  if (!target.hand && target.nextAt === null) target.nextAt = now + DELAY.start;
}

export function startTournament(room, now, rng) {
  const tour = room.tour;
  if (!tour || tour.status !== 'registering') throw err('state', 'The tournament has already started');
  const list = shuffle(tour.entrants.map((_, i) => i), rng).map((i) => tour.entrants[i]);
  if (list.length < 2) throw err('players', 'At least two players must register');
  const per = room.cfg.seats;
  const n = Math.ceil(list.length / per);
  room.tables = Array.from({ length: n }, (_, i) => newTable(i, per));
  list.forEach((e, k) => {
    const t = room.tables[k % n];
    const free = t.seats.map((x, s) => (x ? -1 : s)).filter((s) => s >= 0);
    const s = free[rng.int(free.length)];
    t.seats[s] = newSeat(room, { acct: e.acct, name: e.name, avatar: e.avatar, bot: e.bot, stack: tour.startingStack }, now, false);
    e.status = 'playing'; e.table = t.i;
  });
  tour.status = 'running'; tour.startedAt = now; tour.level = 0;
  tour.levelEndsAt = now + tour.schedule[0].minutes * 60000;
  for (const t of room.tables) t.nextAt = now + DELAY.start + 1500;
  note(room, now, `The tournament started: ${list.length} players at ${n} table${n > 1 ? 's' : ''}`);
  room.v++;
}

export function pauseTournament(room, on, now) {
  const tour = room.tour;
  if (on && tour.status === 'running') { tour.status = 'paused'; tour.pausedLeft = Math.max(0, tour.levelEndsAt - now); tour.levelEndsAt = null; note(room, now, 'Tournament paused: hands in play will finish'); }
  else if (!on && tour.status === 'paused') {
    tour.status = 'running'; tour.levelEndsAt = now + (tour.pausedLeft ?? 60000); tour.pausedLeft = null;
    for (const t of room.tables) if (!t.closed && !isLive(t)) t.nextAt = now + DELAY.start;
    note(room, now, 'Tournament resumed');
  } else throw err('state', 'Nothing to pause or resume');
  room.v++;
}

export function advanceLevel(room, now, { addMinutes = 0 } = {}) {
  const tour = room.tour;
  if (addMinutes) {
    if (tour.status === 'paused') tour.pausedLeft += addMinutes * 60000; else if (tour.levelEndsAt) tour.levelEndsAt += addMinutes * 60000;
    room.v++;
    return;
  }
  if (tour.level < tour.schedule.length - 1) tour.level += 1;
  const l = tour.schedule[tour.level];
  if (tour.status === 'paused') tour.pausedLeft = l.minutes * 60000; else tour.levelEndsAt = now + l.minutes * 60000;
  note(room, now, `Blinds up: level ${tour.level + 1}, ${l.sb}/${l.bb}${l.ante ? ` ante ${l.ante}` : ''} (from the next hand)`);
  room.v++;
}

const stillIn = (tour) => tour.entrants.filter((e) => e.status === 'playing');

function tournamentBusts(room, t, h, now) {
  const tour = room.tour;
  const busted = h.players.filter((p) => p.stack === 0).map((p) => ({ p, e: tour.entrants.find((e) => e.acct === p.id) })).filter((x) => x.e && x.e.status === 'playing');
  if (busted.length) {
    let place = stillIn(tour).length; // the worst place still open
    busted.sort((a, b) => a.p.start - b.p.start); // smallest starting stack finishes lowest
    for (let i = 0; i < busted.length;) {
      let j = i;
      while (j + 1 < busted.length && busted[j + 1].p.start === busted[i].p.start) j++;
      const group = busted.slice(i, j + 1);
      const best = place - group.length + 1;
      for (const { e } of group) { e.status = 'out'; e.place = best; e.span = group.length; e.outAt = now; }
      note(room, now, `${group.map((g) => g.e.name).join(' and ')} finished ${ordinal(best)}${group.length > 1 ? ' (tied)' : ''}`);
      place -= group.length;
      i = j + 1;
    }
  }
  const left = stillIn(tour);
  if (left.length === 1 && tour.entrants.length > 1) finishTournament(room, left[0], now);
  else if (left.length === 0) finishTournament(room, null, now);
}

export const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

function finishTournament(room, winner, now) {
  const tour = room.tour;
  if (winner) { winner.status = 'won'; winner.place = 1; winner.span = 1; }
  tour.status = 'finished'; tour.finishedAt = now; tour.levelEndsAt = null;
  const prizes = prizeTable(tour.payouts, tour.entrants.length, tour.perEntrant);
  const groups = new Map();
  for (const e of tour.entrants) if (e.place) { const k = `${e.place}`; groups.set(k, [...(groups.get(k) || []), e]); }
  for (const g of groups.values()) {
    const first = g[0].place - 1;
    const sum = prizes.slice(first, first + g.length).reduce((a, b) => a + b, 0);
    const each = Math.floor(sum / g.length);
    let odd = sum - each * g.length;
    g.sort((a, b) => (a.acct < b.acct ? -1 : 1));
    for (const e of g) { e.prize = each + (odd > 0 ? 1 : 0); if (odd > 0) odd--; }
  }
  tour.results = tour.entrants.filter((e) => e.place).sort((a, b) => a.place - b.place).map((e) => ({ place: e.place, acct: e.acct, name: e.name, bot: !!e.bot, prize: e.prize }));
  for (const e of tour.entrants) {
    if (e.bot || !e.place) continue;
    outbox(room, { kind: 'tour', acct: e.acct, room: room.id, roomName: room.name, place: e.place, entrants: tour.entrants.length, prize: e.prize, prizeType: tour.prize, at: now });
  }
  note(room, now, winner ? `${winner.name} won the tournament` : 'The tournament is over');
  room.v++;
}

const count = (t) => t.seats.filter((x) => x && x.stack > 0).length;

function moveSeat(room, from, s, to, now) {
  const x = from.seats[s];
  // players knocked out at the destination stay seated until its next hand; their seats are free
  for (let k = 0; k < to.seats.length; k++) if (to.seats[k] && to.seats[k].stack <= 0 && !dealtIn(to, k)) to.seats[k] = null;
  const free = to.seats.map((y, k) => (y ? -1 : k)).filter((k) => k >= 0);
  if (!free.length) return false;
  // a moved player takes the empty seat nearest the big blind side, so they do not skip blinds unfairly
  const k = free[0];
  to.seats[k] = { ...x, waitBB: false };
  from.seats[s] = null;
  const e = room.tour.entrants.find((y) => y.acct === x.acct);
  if (e) e.table = to.i;
  if (!to.hand && to.nextAt === null) to.nextAt = now + DELAY.start;
  return true;
}

/**
 * Keep tournament tables even. Runs when table `t` is between hands: if there are more tables
 * than needed, the smallest table breaks up (now if it is between hands, else when its hand
 * ends); if `t` has two or more players more than another table, one player moves.
 */
function balance(room, t, now, rng) {
  const open = room.tables.filter((x) => !x.closed);
  const per = room.cfg.seats;
  const total = open.reduce((a, x) => a + count(x), 0);
  const target = Math.max(1, Math.ceil(total / per));
  const between = (x) => !isLive(x);
  if (open.length > target) {
    const smallest = open.slice().sort((a, b) => count(a) - count(b) || b.i - a.i)[0];
    if (smallest === t || between(smallest)) {
      breakTable(room, smallest, now);
      if (smallest === t) return 'broken';
    } else smallest.breaking = true;
  }
  if (t.breaking) { breakTable(room, t, now); return 'broken'; }
  const others = room.tables.filter((x) => !x.closed && !x.breaking && x !== t); // never move a player to a table about to break up
  if (others.length) {
    // move players (the one due to post the big blind next, each time) until this table is at most one above the emptiest
    for (let k = 0; k < per && count(t) - Math.min(...others.map(count)) > 1; k++) {
      const min = Math.min(...others.map(count));
      const dest = others.find((x) => count(x) === min);
      const seats = t.seats.map((x, s) => (x && x.stack > 0 ? s : -1)).filter((s) => s >= 0);
      const btn = t.button === null ? seats[0] : (seats.find((s) => s > t.button) ?? seats[0]);
      const pos = positions(seats, btn);
      if (!moveSeat(room, t, pos.bb, dest, now)) break;
      note(room, now, `A player moved from table ${t.i + 1} to table ${dest.i + 1} to balance the tables`);
    }
  }
  return 'ok';
}

function breakTable(room, t, now) {
  const dests = () => room.tables.filter((x) => !x.closed && x !== t).sort((a, b) => playersAt(a).length - playersAt(b).length);
  for (let s = 0; s < t.seats.length; s++) {
    if (!t.seats[s]) continue;
    if (t.seats[s].stack <= 0) { t.seats[s] = null; continue; }
    const d = dests().find((x) => x.seats.some((y) => !y));
    if (!d) return; // nowhere to go (should not happen): keep the table
    moveSeat(room, t, s, d, now);
  }
  t.closed = true; t.breaking = false; t.hand = null; t.nextAt = null;
  note(room, now, `Table ${t.i + 1} broke up; its players moved to other tables`);
}

// ---------------- books ----------------

/** The table's chips right now (seats, plus chips in the middle of a hand in play). */
export function chipsOnTables(room) {
  let n = 0;
  for (const t of room.tables) {
    if (t.closed) continue;
    const live = isLive(t) ? t.hand : null;
    for (let s = 0; s < t.seats.length; s++) {
      const x = t.seats[s];
      if (!x) continue;
      const p = live?.players.find((q) => q.seat === s && q.id === x.acct);
      n += p ? p.stack + p.committed : x.stack;
    }
  }
  return n;
}

/** Throws if the room's books do not balance. Tournament rooms keep tournament chips, not account chips. */
export function checkBooks(room) {
  if (room.kind === 'tournament') return true;
  const want = room.ledger.in - room.ledger.out;
  const have = chipsOnTables(room);
  if (want !== have) throw new Error(`Books do not balance in room ${room.id}: in−out = ${want}, on the table ${have}`);
  return true;
}
