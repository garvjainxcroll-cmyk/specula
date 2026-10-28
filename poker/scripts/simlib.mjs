// Simulation driver used by the tests and by `npm run sim`: plays whole tables and tournaments
// through the same room code the server runs, with a fake clock. "Human" seats act randomly
// (sometimes they time out, sit out, leave and come back); bots play as in practice mode.
// After every step the chips must balance; at random steps the views are checked for hidden cards.
import { createRoom, sit, tick, playerAct, leave, sitOut, topUp, addBot, registerTournament, startTournament, checkBooks, findSeat, isLive } from '../src/room/room.mjs';
import { viewRoom } from '../src/room/view.mjs';
import { legalActions } from '../src/engine/hand.mjs';
import { seeded } from '../src/engine/rng.mjs';

/** A random action that is always legal (as the betting panel only offers legal ones). */
export function randomAction(rng, l) {
  const r = rng.float();
  if (r < 0.15) return { type: 'fold' };
  if (r < 0.55) return l.canCheck ? { type: 'check' } : { type: 'call' };
  if (r < 0.62 && (l.canBet || l.canRaise || l.callIsAllIn)) return { type: 'allin' };
  if ((l.canBet || l.canRaise) && r < 0.9) {
    const span = l.maxTo - l.minTo;
    return { type: l.canBet ? 'bet' : 'raise', to: l.minTo + (span > 0 ? rng.int(Math.min(span, 3 * l.bb) + 1) : 0) };
  }
  return l.canCheck ? { type: 'check' } : { type: 'call' };
}

/** Every hole card in a view must be the viewer's own or one turned face up. */
export function checkView(room, viewer, now) {
  const v = viewRoom(room, viewer, now);
  const json = JSON.stringify(v);
  if (/"deck"|"burned"/.test(json)) throw new Error('a view contains the deck');
  for (const t of v.tables) {
    const real = room.tables.find((x) => x.i === t.i);
    const h = real.hand;
    if (!h) continue;
    const allowed = new Set(h.board);
    for (const p of h.players) if (p.shown || p.id === viewer.acct) for (const c of p.cards) allowed.add(c);
    for (const s of t.seats) {
      if (!s || !s.cards) continue;
      for (const c of s.cards) if (c !== 'back' && !allowed.has(c)) throw new Error(`view for ${viewer.acct || viewer.host ? 'host' : 'public'} shows a hidden card`);
    }
    for (const e of t.hand.log) if (e.cards) for (const c of e.cards) if (!allowed.has(c)) throw new Error(`hand log shows a hidden card (${e.t})`);
    if (t.hand.board.length !== h.board.length) throw new Error('board mismatch');
  }
  return v;
}

export function simulateCash({ seed = 'cash', hands = 1000, seats = 6, humans = 4, bots = 2, sb = 10, bb = 20, chaos = true, checkViews = 10 } = {}) {
  const rng = seeded(seed);
  let now = 1_000_000;
  const room = createRoom({ id: 'sim', code: 'SIM', kind: 'cash', name: 'Sim', cfg: { sb, bb, seats, minBuyIn: 20 * bb, maxBuyIn: 200 * bb, actionSeconds: 20 } }, now);
  const people = Array.from({ length: humans }, (_, i) => `h${i}`);
  const bank = new Map(people.map((p) => [p, 0])); // chips each account got back from the table
  for (const p of people) sit(room, { acct: p, name: p.toUpperCase(), stack: 100 * bb }, now);
  for (let i = 0; i < bots; i++) addBot(room, { level: ['easy', 'medium', 'hard'][i % 3], id: `bot${i}` }, now, rng);
  const t = room.tables[0];
  let started = 0; let lastNo = 0; let guard = 0; let showdowns = 0; let sidePots = 0;
  const collect = () => { for (const o of room.outbox.splice(0)) if (o.kind === 'cashout') bank.set(o.acct, bank.get(o.acct) + o.amount); };
  while (started < hands) {
    if (++guard > hands * 400) throw new Error('simulation stalled');
    now += 250 + rng.int(1500);
    tick(room, now, rng);
    checkBooks(room);
    if (t.handNo !== lastNo) {
      started++; lastNo = t.handNo;
      if (t.recent[0]?.showdown) showdowns++;
    }
    const h = t.hand;
    if (h && h.status === 'complete' && h.result.pots.length > 1 && h.events.at(-1).counted !== true) { sidePots++; h.events.at(-1).counted = true; }
    if (checkViews && rng.int(checkViews) === 0) { if (people.length) checkView(room, { acct: people[rng.int(people.length)] }, now); checkView(room, { screen: true }, now); }
    if (isLive(t)) {
      const s = h.toAct;
      const x = t.seats[s];
      if (x && !x.bot) {
        const r = rng.float();
        if (chaos && r < 0.03) { /* wait: let the clock run out */ now += 21000 + (x.bank || 0); continue; }
        const l = legalActions(h, s);
        // a stale or replayed click is refused
        if (chaos && r < 0.06) { try { playerAct(room, x.acct, { handId: h.id, seq: h.seq - 1, type: 'fold' }, now, rng); throw new Error('stale action accepted'); } catch (e) { if (e.code !== 'stale') throw e; } }
        if (chaos && r > 0.995) { leave(room, x.acct, now, rng); continue; }
        playerAct(room, x.acct, { handId: h.id, seq: h.seq, ...randomAction(rng, l) }, now, rng);
      }
    }
    // people away from the table come back, busted ones top up
    if (chaos) {
      for (const p of people) {
        const f = findSeat(room, p);
        if (!f && rng.float() < 0.05) {
          const s = t.seats.findIndex((y) => !y);
          if (s >= 0) sit(room, { acct: p, name: p.toUpperCase(), stack: 100 * bb, seat: s }, now);
        } else if (f && f.seat.busted && rng.float() < 0.3) topUp(room, p, 100 * bb, now);
        else if (f && f.seat.sittingOut && !f.seat.busted && rng.float() < 0.2) sitOut(room, p, false, now);
      }
    }
    collect();
  }
  checkBooks(room);
  return { room, showdowns, sidePots, hands: started, now };
}

export function simulateTournament({ seed = 'tour', entrants = 24, seats = 9, humans = 6, startingStack = 3000, minutes = 3, checkViews = 15 } = {}) {
  const rng = seeded(seed);
  let now = 5_000_000;
  const schedule = [[10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [500, 1000], [800, 1600], [1000, 2000], [2000, 4000], [5000, 10000]]
    .map(([sb, bb], i) => ({ sb, bb, ante: i >= 4 ? Math.floor(bb / 10) : 0, minutes }));
  const room = createRoom({ id: 'tour', code: 'TOUR', kind: 'tournament', name: 'Sim Cup', cfg: { seats, actionSeconds: 15 }, tour: { startingStack, schedule, payouts: [50, 30, 20], perEntrant: 100 } }, now);
  for (let i = 0; i < entrants; i++) {
    if (i < humans) registerTournament(room, { acct: `h${i}`, name: `H${i}` }, now);
    else addBot(room, { level: ['easy', 'medium', 'hard'][i % 3], id: `bot${i}` }, now, rng);
  }
  startTournament(room, now, rng);
  const total = entrants * startingStack;
  let guard = 0; let maxSpread = 0; let startSpread = 0; let hands = 0;
  const seen = new Set();
  while (room.tour.status !== 'finished') {
    if (++guard > 400000) throw new Error('tournament did not finish');
    now += 300 + rng.int(1200);
    tick(room, now, rng);
    // chips in play never change
    let chips = 0;
    for (const t of room.tables) {
      if (t.closed) continue;
      for (let s = 0; s < t.seats.length; s++) {
        const x = t.seats[s]; if (!x) continue;
        const p = isLive(t) ? t.hand.players.find((q) => q.seat === s && q.id === x.acct) : null;
        chips += p ? p.stack + p.committed : x.stack;
      }
    }
    if (chips !== total) throw new Error(`tournament chips ${chips} ≠ ${total}`);
    const open = room.tables.filter((t) => !t.closed);
    const counts = open.map((t) => t.seats.filter((x) => x && x.stack > 0).length);
    if (open.every((t) => !isLive(t))) maxSpread = Math.max(maxSpread, Math.max(...counts) - Math.min(...counts));
    for (const t of open) {
      if (t.hand && !seen.has(t.hand.id)) {
        seen.add(t.hand.id); hands++;
        // when a hand starts, its table is never more than one player above the emptiest table
        startSpread = Math.max(startSpread, t.spread ?? 0);
      }
    }
    if (checkViews && rng.int(checkViews) === 0) checkView(room, { acct: `h${rng.int(humans)}` }, now);
    for (const t of open) {
      if (!isLive(t)) continue;
      const h = t.hand; const x = t.seats[h.toAct];
      if (x && !x.bot) {
        if (rng.float() < 0.02) continue; // slow to act: the clock runs
        playerAct(room, x.acct, { handId: h.id, seq: h.seq, ...randomAction(rng, legalActions(h, h.toAct)) }, now, rng);
      }
    }
    room.outbox.length = 0;
  }
  return { room, hands, maxSpread, startSpread, now };
}
