// Settings forms shared by the lobby (private tables), the table's host controls, practice
// and the Event Head desk. The server cleans every value again; this only helps typing.
import { h, mount, fmt } from '../ui.mjs';

const STAKES = [[5, 10], [10, 20], [25, 50], [50, 100]];
const num = (name, value, label, attrs = {}) => h('label', { class: 'field' }, h('span', {}, label), h('input', { type: 'number', name, value, ...attrs }));
const select = (name, value, label, options) => h('label', { class: 'field' }, h('span', {}, label), h('select', { name }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) ? true : null }, l))));
const check = (name, value, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name, checked: value ? true : null }), label);

/**
 * Table settings. opts: { kind, onSubmit(cfg, extra), submitLabel, name: bool (ask for a name),
 * bots: bool (practice bot count), isPrivate: bool|null (offer a public/private choice) }
 */
export function tableSettingsForm(cfg = {}, opts = {}) {
  const c = { sb: 10, bb: 20, ante: 0, seats: 6, minBuyIn: 800, maxBuyIn: 4000, actionSeconds: 25, timeBankSeconds: 30, showdownReveal: 'winners', revealFoldedInHistory: false, newPlayers: 'wait-bb', botLevel: 'medium', presets: { small: { mode: 'pot', value: 25 }, big: { mode: 'pot', value: 75 } }, ...cfg };
  const err = h('div', { class: 'err' });
  const stakeRow = h('div', { class: 'row tight' }, h('span', { class: 'muted small' }, 'Quick stakes:'), STAKES.map(([sb, bb]) => h('button', { type: 'button', class: 'btn sm ghost', onclick: (e) => {
    const f = e.target.closest('form');
    f.sb.value = sb; f.bb.value = bb;
    if (f.minBuyIn) { f.minBuyIn.value = 40 * bb; f.maxBuyIn.value = 200 * bb; }
  } }, `${sb}/${bb}`)));
  const form = h('form', { class: 'stack', onsubmit: (e) => {
    e.preventDefault();
    const f = e.target;
    const v = (k) => (f[k] ? Number(f[k].value) : undefined);
    const out = {
      sb: v('sb'), bb: v('bb'), ante: v('ante'), seats: v('seats'), actionSeconds: v('actionSeconds'), timeBankSeconds: v('timeBankSeconds'),
      showdownReveal: f.showdownReveal.value, revealFoldedInHistory: f.revealFoldedInHistory?.checked ?? false, newPlayers: f.newPlayers?.value, botLevel: f.botLevel?.value,
      presets: { small: { mode: f.smallMode.value, value: Number(f.smallValue.value) }, big: { mode: f.bigMode.value, value: Number(f.bigValue.value) } },
    };
    if (f.minBuyIn) { out.minBuyIn = v('minBuyIn'); out.maxBuyIn = v('maxBuyIn'); }
    if (!(out.sb >= 1 && out.bb >= out.sb)) { err.textContent = 'The big blind must be at least the small blind (and at least 1).'; return; }
    if (out.minBuyIn !== undefined && !(out.maxBuyIn >= out.minBuyIn && out.minBuyIn >= out.bb)) { err.textContent = 'The buy-in range must be at least one big blind, minimum below maximum.'; return; }
    const extra = { name: f.tname?.value, private: f.isPrivate ? f.isPrivate.value === 'private' : undefined, bots: f.botCount ? { count: Number(f.botCount.value), level: f.botLevel.value } : undefined };
    opts.onSubmit(out, extra);
  } },
  opts.name ? h('label', { class: 'field' }, h('span', {}, 'Table name'), h('input', { type: 'text', name: 'tname', maxlength: 40, value: opts.defaultName || '' })) : null,
  opts.isPrivate !== undefined && opts.isPrivate !== null ? select('isPrivate', opts.isPrivate ? 'private' : 'public', 'Who can find it', [['public', 'Public — listed in the lobby'], ['private', 'Private — by code or link only']]) : null,
  h('h4', {}, 'Stakes'), stakeRow,
  h('div', { class: 'formgrid' },
    num('sb', c.sb, 'Small blind', { min: 1 }), num('bb', c.bb, 'Big blind', { min: 1 }), num('ante', c.ante, 'Ante (0 = none)', { min: 0 }),
    select('seats', c.seats, 'Seats', [[2, '2 (heads-up)'], [6, '6'], [9, '9'], [3, '3'], [4, '4'], [5, '5'], [7, '7'], [8, '8'], [10, '10']]),
    opts.kind === 'cash' ? num('minBuyIn', c.minBuyIn, 'Minimum buy-in', { min: 1 }) : null,
    opts.kind === 'cash' ? num('maxBuyIn', c.maxBuyIn, 'Maximum buy-in', { min: 1 }) : null),
  h('h4', {}, 'Timing'),
  h('div', { class: 'formgrid' }, num('actionSeconds', c.actionSeconds, 'Seconds to act', { min: 5, max: 600 }), num('timeBankSeconds', c.timeBankSeconds, 'Time bank (seconds)', { min: 0, max: 600 })),
  h('h4', {}, 'Bet buttons (table default; each player can set their own)'),
  h('div', { class: 'formgrid' },
    select('smallMode', c.presets.small.mode, 'Small Bet is…', [['pot', '% of the pot'], ['bb', 'big blinds']]), num('smallValue', c.presets.small.value, 'Small Bet amount', { min: 1, step: 'any' }),
    select('bigMode', c.presets.big.mode, 'Big Bet is…', [['pot', '% of the pot'], ['bb', 'big blinds']]), num('bigValue', c.presets.big.value, 'Big Bet amount', { min: 1, step: 'any' })),
  h('h4', {}, 'Showdown and new players'),
  h('div', { class: 'formgrid' },
    select('showdownReveal', c.showdownReveal, 'At showdown', [['winners', 'Show winners; losers may muck'], ['all', 'Show every hand']]),
    opts.kind !== 'tournament' ? select('newPlayers', c.newPlayers, 'A new player', [['wait-bb', 'waits for the big blind'], ['immediate', 'is dealt in at once']]) : null,
    opts.kind === 'practice' || opts.bots ? select('botLevel', c.botLevel, 'Bot difficulty', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']]) : null,
    opts.bots ? num('botCount', opts.botCount ?? 5, 'Number of bots', { min: 0, max: 9 }) : null),
  opts.kind !== 'practice' ? check('revealFoldedInHistory', c.revealFoldedInHistory, 'Show folded hands in the hand history (for teaching)') : null,
  err,
  h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, opts.submitLabel || 'Save')));
  return form;
}

/** Tournament settings: starting stack, the blind schedule, late registration, prizes. */
export function tournamentForm(tour = {}, opts = {}) {
  let schedule = (tour.schedule || defaultSchedule()).map((l) => ({ ...l }));
  const err = h('div', { class: 'err' });
  const rows = h('tbody', {});
  const drawRows = () => mount(rows, schedule.map((l, i) => h('tr', {},
    h('td', { class: 'num muted' }, String(i + 1).padStart(2, '0')),
    ...['sb', 'bb', 'ante', 'minutes'].map((k) => h('td', {}, h('input', { type: 'number', min: k === 'ante' ? 0 : 1, value: l[k], 'aria-label': `Level ${i + 1} ${k}`, oninput: (e) => { schedule[i][k] = Number(e.target.value); } }))),
    h('td', {}, h('button', { type: 'button', class: 'btn sm ghost', 'aria-label': `Remove level ${i + 1}`, onclick: () => { schedule.splice(i, 1); drawRows(); } }, '−')))));
  drawRows();
  const form = h('form', { class: 'stack', onsubmit: (e) => {
    e.preventDefault();
    const f = e.target;
    if (!schedule.length) { err.textContent = 'Add at least one blind level.'; return; }
    for (const l of schedule) if (!(l.sb >= 1 && l.bb >= l.sb && l.minutes >= 1 && l.ante >= 0)) { err.textContent = 'Each level needs a small blind, a big blind at least as large, and at least one minute.'; return; }
    const payouts = f.payouts.value.split(/[\s,]+/).map(Number).filter((n) => n > 0);
    if (!payouts.length) { err.textContent = 'Enter the prize split, for example 50, 30, 20.'; return; }
    opts.onSubmit({ startingStack: Number(f.startingStack.value), schedule, lateRegLevels: Number(f.lateRegLevels.value), maxEntrants: Number(f.maxEntrants.value), payouts, prize: f.prize.value, perEntrant: Number(f.perEntrant.value) });
  } },
  h('div', { class: 'formgrid' },
    num('startingStack', tour.startingStack ?? 10000, 'Starting stack', { min: 100 }),
    num('lateRegLevels', tour.lateRegLevels ?? 3, 'Late registration until level', { min: 0 }),
    num('maxEntrants', tour.maxEntrants ?? 90, 'Most players', { min: 2 }),
    select('prize', tour.prize ?? 'points', 'Prizes paid in', [['points', 'Points (no value)'], ['chips', 'Virtual chips']]),
    num('perEntrant', tour.perEntrant ?? 100, 'Prize pool per player', { min: 0 }),
    h('label', { class: 'field' }, h('span', {}, 'Prize split, % for 1st, 2nd…'), h('input', { type: 'text', name: 'payouts', value: (tour.payouts || [50, 30, 20]).join(', ') }))),
  h('h4', {}, 'Blind schedule'),
  h('div', { class: 'scroll-x' }, h('table', { class: 'tbl schedule' }, h('thead', {}, h('tr', {}, ['Level', 'Small blind', 'Big blind', 'Ante', 'Minutes', ''].map((x) => h('th', {}, x)))), rows)),
  h('div', { class: 'row tight' },
    h('button', { type: 'button', class: 'btn sm ghost', onclick: () => { const l = schedule.at(-1) || { sb: 25, bb: 50, ante: 0, minutes: 8 }; schedule.push({ sb: l.sb * 2, bb: l.bb * 2, ante: l.ante * 2, minutes: l.minutes }); drawRows(); } }, 'Add a level (double)'),
    h('button', { type: 'button', class: 'btn sm ghost', onclick: () => { const m = Number(prompt('Minutes for every level?', String(schedule[0]?.minutes || 8))); if (m >= 1) { schedule = schedule.map((l) => ({ ...l, minutes: Math.round(m) })); drawRows(); } } }, 'Same minutes for all'),
    h('button', { type: 'button', class: 'btn sm ghost', onclick: () => { schedule = defaultSchedule(); drawRows(); } }, 'Standard schedule')),
  err,
  h('div', { class: 'row' }, h('button', { class: 'btn', type: 'submit' }, opts.submitLabel || 'Save')));
  return form;
}

export function defaultSchedule() {
  return [[25, 50, 0], [50, 100, 0], [75, 150, 15], [100, 200, 25], [150, 300, 30], [200, 400, 50], [300, 600, 75], [400, 800, 100], [600, 1200, 150], [800, 1600, 200], [1000, 2000, 300], [1500, 3000, 400], [2000, 4000, 500], [3000, 6000, 1000]].map(([sb, bb, ante]) => ({ sb, bb, ante, minutes: 8 }));
}

export const stakesLabel = (r) => `${fmt(r.sb)}/${fmt(r.bb)}${r.ante ? ` · ante ${fmt(r.ante)}` : ''}`;
