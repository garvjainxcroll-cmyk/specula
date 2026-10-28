// The big simulation: thousands of hands at cash tables of every size and a series of full
// tournaments, through the same code the server runs. Every step checks that chips balance and
// that no view shows a hidden card. Usage: npm run sim [-- hands] (default 10,000 hands).
import { simulateCash, simulateTournament } from './simlib.mjs';

const total = Number(process.argv[2]) || 10000;
const t0 = Date.now();
const rows = [];
let hands = 0;

const cash = [
  { label: 'Heads-up, 1 person v 1 bot', seats: 2, humans: 1, bots: 1 },
  { label: '6 seats, 4 people + 2 bots', seats: 6, humans: 4, bots: 2 },
  { label: '9 seats, 9 people', seats: 9, humans: 9, bots: 0, sb: 25, bb: 50 },
  { label: '6 seats, 6 bots (practice)', seats: 6, humans: 0, bots: 6, sb: 50, bb: 100 },
];
const each = Math.ceil(total / cash.length);
for (const [i, c] of cash.entries()) {
  const r = simulateCash({ seed: `sim-${i}`, hands: each, ...c });
  const recent = r.room.tables[0];
  rows.push([c.label, r.hands, r.showdowns, r.sidePots, recent.handNo]);
  hands += r.hands;
}
console.log(`Cash tables: ${hands.toLocaleString()} hands, chips balanced after every step.`);
console.table(rows.map(([label, n, sd, sp]) => ({ table: label, hands: n, showdowns: sd, 'hands with side pots': sp })));

const tours = [];
for (const [i, t] of [{ entrants: 30, seats: 9 }, { entrants: 45, seats: 9 }, { entrants: 13, seats: 6 }, { entrants: 2, seats: 2 }, { entrants: 18, seats: 6 }].entries()) {
  const r = simulateTournament({ seed: `tsim-${i}`, humans: Math.min(8, t.entrants), ...t });
  const tour = r.room.tour;
  const paid = tour.results.reduce((a, x) => a + x.prize, 0);
  tours.push({ players: t.entrants, 'seats per table': t.seats, hands: r.hands, 'tables uneven at a hand start (max)': r.startSpread, winner: tour.results[0].name, 'prize pool paid': `${paid}/${t.entrants * 100}` });
  if (tour.status !== 'finished' || paid !== t.entrants * 100 || tour.results.length !== t.entrants) throw new Error('tournament check failed');
  hands += r.hands;
}
console.log('Tournaments: every one finished, every place awarded, the whole prize pool paid.');
console.table(tours);
console.log(`Done: ${hands.toLocaleString()} hands in ${((Date.now() - t0) / 1000).toFixed(1)} s. No chip was created or lost; no view showed a hidden card.`);
