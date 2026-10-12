// The six economies of SPECULA.
// Starting figures (growth, inflation, target, policy rate, debt) are exactly the
// printed guide, page 02. Everything else is the model's own calibration and is
// documented in docs/02_MODEL.md.

export const ECON_ORDER = ['AUR', 'CAL', 'VER', 'KES', 'NOR', 'SAR'];

export const ECONOMIES = {
  AUR: {
    code: 'AUR', name: 'Aurelia', title: 'The Anchor', currency: 'crown', currencyPlural: 'crowns', sym: '₵',
    blurb: 'Large and wealthy, with the deepest bond market and the currency the world holds in reserve. Its banks lend across the globe, and when other markets panic, money runs here.',
    weight: 0.35, // share of world output, for world growth surprises
    start: { g: 2.0, pi: 4.2, i: 4.0, debt: 90, u: 4.5, b: -4.0, ca: -2.5 },
    trend: 2.0, target: 4.0, uStar: 4.5,
    rule: { rStar: 0.25, a: 0.5, b: 0.5, rho: 0.5, watchAUR: 0 },
    growth: { rho: 0.6, beta: 0.25, spill: 0.10, oil: -0.02, copper: 0, wheat: 0 },
    infl: { lam: 0.7, alpha: 0.25, oil: 0.03, wheat: 0.01, fx: 0.02 },
    budget: { cyc: 0.15, oil: 0 }, ca: { world: 0.0, oil: -0.01, cyc: -0.1 },
    yields: { tp2: 0.10, tp10: 0.60, cpBase: 0.0, debtSens: 0.01, debtRef: 90, fearSens: -0.01 },
    equity: { beta: 1.0, oil: -0.03, copper: 0 },
    fxModel: { fear: 0.10, oil: 0, wheat: 0, copper: 0, cp: 0 },
    neutralReal: 0.25,
  },
  CAL: {
    code: 'CAL', name: 'Calder', title: 'The Workshop', currency: 'mark', currencyPlural: 'marks', sym: 'M',
    blurb: 'The world’s factory. It exports manufactured goods to everyone, saves heavily, runs a large trade surplus, and keeps the mark inside a band. It buys oil and copper in bulk.',
    weight: 0.25,
    start: { g: 5.5, pi: 2.0, i: 3.0, debt: 60, u: 4.0, b: 1.0, ca: 6.0 },
    trend: 5.5, target: 3.0, uStar: 4.0,
    rule: { rStar: 1.50, a: 0.5, b: 0.25, rho: 0.6, watchAUR: 0.5 },
    growth: { rho: 0.6, beta: 0.20, spill: 0.30, oil: -0.03, copper: -0.01, wheat: 0, markFx: 0.05 },
    infl: { lam: 0.7, alpha: 0.25, oil: 0.03, wheat: 0.01, fx: 0.05 },
    budget: { cyc: 0.15, oil: 0 }, ca: { world: 0.3, oil: -0.02, cyc: -0.1 },
    yields: { tp2: 0.10, tp10: 0.50, cpBase: 0.10, debtSens: 0.0, debtRef: 60, fearSens: 0.01 },
    equity: { beta: 1.1, oil: -0.05, copper: -0.03 },
    fxModel: { fear: 0, oil: 0, wheat: 0, copper: 0, cp: 0 },
    band: { centre: 7.50, width: 2.0 }, // marks per crown, ±width%
    neutralReal: 1.50,
  },
  VER: {
    code: 'VER', name: 'Verana', title: 'The Debtor', currency: 'florin', currencyPlural: 'florins', sym: 'ƒ',
    blurb: 'Old, wealthy and slow. Its government owes more than one and a half times its yearly output, prices barely rise, and its own banks hold most of its government’s bonds.',
    weight: 0.15,
    start: { g: 0.8, pi: 1.2, i: 1.0, debt: 155, u: 7.5, b: -3.5, ca: 1.0 },
    trend: 0.8, target: 2.0, uStar: 7.5,
    rule: { rStar: 0.50, a: 0.5, b: 0.5, rho: 0.7, watchAUR: 0.25 },
    growth: { rho: 0.7, beta: 0.15, spill: 0.15, oil: -0.015, copper: 0, wheat: 0 },
    infl: { lam: 0.7, alpha: 0.15, oil: 0.02, wheat: 0.01, fx: 0.05 },
    budget: { cyc: 0.15, oil: 0 }, ca: { world: 0.1, oil: -0.01, cyc: -0.1 },
    yields: { tp2: 0.05, tp10: 0.40, cpBase: 0.30, debtSens: 0.01, debtRef: 155, fearSens: 0.02, bankShareSens: 0.06, bankShareRef: 72 },
    equity: { beta: 0.9, oil: -0.02, copper: 0 },
    fxModel: { fear: 0.05, oil: 0, wheat: 0, copper: 0, cp: -1.5 },
    neutralReal: 0.50,
  },
  KES: {
    code: 'KES', name: 'Kesh', title: 'The Riser', currency: 'dinar', currencyPlural: 'dinars', sym: 'د',
    blurb: 'A fast-growing emerging economy with high interest rates. It borrows heavily abroad in crowns and fixes the dinar at 50 to the crown, defending the peg with its reserves.',
    weight: 0.10,
    start: { g: 6.5, pi: 7.0, i: 9.0, debt: 55, u: 6.5, b: -3.0, ca: -4.0 },
    trend: 6.5, target: 5.0, uStar: 6.5,
    // Kesh's rule is built on Aurelia's rate because of the peg (see rules.mjs)
    rule: { premium: 4.0, a: 0.5, b: 0.5, rho: 0.5, reserveRef: 120, reserveSens: 0.05 },
    growth: { rho: 0.6, beta: 0.25, spill: 0.15, oil: -0.02, copper: 0, wheat: 0, crownDebt: 0.08 },
    infl: { lam: 0.7, alpha: 0.25, oil: 0.04, wheat: 0.04, fx: 0.15 },
    budget: { cyc: 0.15, oil: 0 }, ca: { world: 0.1, oil: -0.02, cyc: -0.1 },
    yields: { tp2: 0.20, tp10: 0.80, cpBase: 1.50, debtSens: 0.03, debtRef: 55, fearSens: 0.06, reserveSens: 0.03, reserveRef: 120 },
    equity: { beta: 1.4, oil: -0.03, copper: 0 },
    fxModel: { fear: -0.10, oil: 0, wheat: 0, copper: 0, cp: -2.0 },
    peg: 50, // dinars per crown
    neutralReal: 2.0,
  },
  NOR: {
    code: 'NOR', name: 'Norvik', title: 'The Well', currency: 'krone', currencyPlural: 'kroner', sym: 'kr',
    blurb: 'An oil exporter. Its budget, its trade and the krone rise and fall with the price of oil, and it saves the surplus of good years in a national wealth fund.',
    weight: 0.05,
    start: { g: 2.5, pi: 3.0, i: 3.5, debt: 30, u: 3.5, b: 6.0, ca: 8.0 },
    trend: 2.5, target: 3.0, uStar: 3.5,
    rule: { rStar: 0.75, a: 0.5, b: 0.25, rho: 0.6, watchAUR: 0.25 },
    growth: { rho: 0.6, beta: 0.20, spill: 0.05, oil: 0.05, copper: 0, wheat: 0, oilOutput: 2.0 },
    infl: { lam: 0.7, alpha: 0.25, oil: 0.02, wheat: 0.01, fx: 0.05 },
    budget: { cyc: 0.1, oil: 0.05 }, ca: { world: 0.0, oil: 0.08, cyc: -0.1 },
    yields: { tp2: 0.10, tp10: 0.60, cpBase: 0.10, debtSens: 0.0, debtRef: 30, fearSens: 0.01 },
    equity: { beta: 1.0, oil: 0.30, copper: 0 },
    fxModel: { fear: -0.03, oil: 0.25, wheat: 0, copper: 0, cp: 0 },
    neutralReal: 0.75,
  },
  SAR: {
    code: 'SAR', name: 'Sarvan', title: 'The Granary', currency: 'ora', currencyPlural: 'ora', sym: 'ø',
    blurb: 'A frontier economy that sells wheat and copper to the world. Its ora floats freely, inflation runs high, and its markets are thin, so trading there costs more.',
    weight: 0.10,
    start: { g: 4.0, pi: 9.0, i: 11.0, debt: 70, u: 9.0, b: -4.5, ca: -3.5 },
    trend: 4.0, target: 6.0, uStar: 9.0,
    rule: { rStar: 0.50, a: 0.5, b: 0.25, rho: 0.5, watchAUR: 0 },
    growth: { rho: 0.5, beta: 0.20, spill: 0.10, oil: -0.01, copper: 0.04, wheat: 0.03, harvest: 0.03 },
    infl: { lam: 0.7, alpha: 0.25, oil: 0.03, wheat: 0.08, fx: 0.12 },
    budget: { cyc: 0.15, oil: 0, copper: 0.02 }, ca: { world: 0.1, oil: -0.02, cyc: -0.1, copper: 0.03, wheat: 0.03 },
    yields: { tp2: 0.30, tp10: 1.00, cpBase: 3.00, debtSens: 0.03, debtRef: 70, fearSens: 0.08 },
    equity: { beta: 1.5, oil: -0.02, copper: 0.25 },
    fxModel: { fear: -0.12, oil: 0, wheat: 0.12, copper: 0.12, cp: -1.0 },
    neutralReal: 0.50,
  },
};

/** Figures particular to each economy, shown in every data release. */
export const SPECIALS = {
  AUR: [{ key: 'badLoans', label: 'Bank bad loans', unit: '% of loans', start: 2.0, dp: 1 }],
  CAL: [
    { key: 'markPerCrown', label: 'Marks per crown', unit: '', start: 7.50, dp: 4 },
    { key: 'reserves', label: 'Reserves', unit: '₵ bn', start: 3200, dp: 0 },
  ],
  VER: [{ key: 'bankShare', label: 'Govt bonds held by Verana’s banks', unit: '%', start: 72, dp: 1 }],
  KES: [
    { key: 'reserves', label: 'Reserves', unit: '₵ bn', start: 140, dp: 0 },
    { key: 'dinarPerCrown', label: 'Dinars per crown', unit: '', start: 50, dp: 2 },
  ],
  NOR: [
    { key: 'oilOutput', label: 'Oil output', unit: 'm barrels a day', start: 4.0, dp: 1 },
    { key: 'wealthFund', label: 'Wealth fund', unit: '₵ bn', start: 1100, dp: 0 },
  ],
  SAR: [
    { key: 'harvest', label: 'Harvest', unit: 'index', start: 100, dp: 0 },
    { key: 'copperOutput', label: 'Copper output', unit: 'index', start: 100, dp: 0 },
  ],
};

/** Starting exchange rates: rupees per unit of each currency. */
export const START_FX = { AUR: 84.0, CAL: 11.2, VER: 0.62, KES: 1.68, NOR: 8.4, SAR: 0.4 };
