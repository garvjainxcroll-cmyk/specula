// The ten listed companies. Nothing else is ever listed.
// Money everywhere is whole paise (₹1 = 100 paise), so sums are exact.
// `base` is the listed (starting) price: over time, the automatic movement averages to it.

export const STOCKS = [
  { t: 'AURI', name: 'Aurelia Industries', sector: 'Energy & Infrastructure', base: 115000 },
  { t: 'NEXO', name: 'Nexora Technologies', sector: 'Technology & AI', base: 27000 },
  { t: 'VANT', name: 'Vantrex Motors', sector: 'Automobiles & EVs', base: 58000 },
  { t: 'MERB', name: 'Meridian Bank', sector: 'Banking & Finance', base: 30000 },
  { t: 'HELX', name: 'Helix Pharmaceuticals', sector: 'Healthcare & Pharma', base: 28000 },
  { t: 'CRTL', name: 'Crestline Retail', sector: 'Retail & FMCG', base: 45000 },
  { t: 'SKYF', name: 'Skyforge Defence', sector: 'Defence & Aerospace', base: 65000 },
  { t: 'GRVT', name: 'GreenVolt Energy', sector: 'Renewable Energy', base: 11000 },
  { t: 'URBT', name: 'UrbanBite Technologies', sector: 'Food-Tech / Consumer Tech', base: 38000 },
  { t: 'TCOR', name: 'TitanCore Mining', sector: 'Mining & Commodities', base: 25000 },
];

export const TICKERS = STOCKS.map((s) => s.t);
export const BY_T = Object.fromEntries(STOCKS.map((s) => [s.t, s]));

/** Every investor starts with ₹10,00,000 of paper money. */
export const START_CASH = 100000000;

/** Prices move in steps of ₹0.05, as on Indian exchanges. */
export const TICK_PAISE = 5;
