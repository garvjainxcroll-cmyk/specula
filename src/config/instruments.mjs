// The forty-four instruments, in the eight families of the printed guide (page 03).
//
// kind        how the instrument is priced (see src/engine/market.mjs)
// ccy         economy whose currency the instrument is priced in (null = priced in rupees)
// funded      true: buying it uses cash. false (rate futures, default protection): a contract
//             on a notional amount; profit and loss is paid in cash as the price moves.
// dur         price sensitivity to its yield (years), for bonds and credit
// sigma0      typical quarterly move in rupee terms (% of value, or % of notional), the
//             starting point for "how sharply that instrument has been moving"
// risk        family for Risk Used; positions in one family offset each other (sign = direction)
// depth       market depth in ₹ Cr for crowd impact
// spread      trading cost in calm markets, % of the amount traded

export const FAMILIES = [
  { id: 'govt', name: 'Government Bonds', count: 14 },
  { id: 'credit', name: 'Corporate Credit', count: 2 },
  { id: 'shares', name: 'Shares', count: 8 },
  { id: 'fx', name: 'Currencies', count: 6 },
  { id: 'futures', name: 'Rate Futures', count: 6 },
  { id: 'commod', name: 'Commodities', count: 4 },
  { id: 'vol', name: 'Volatility', count: 1 },
  { id: 'cds', name: 'Default Protection', count: 3 },
];

export const RISK_FAMILIES = {
  'AUR-rates': 'Aurelian interest rates',
  'CAL-rates': 'Calder interest rates',
  'VER-debt': 'Verana’s debt',
  'KES-debt': 'Kesh’s debt',
  'NOR-rates': 'Norvik interest rates',
  'SAR-rates': 'Sarvan interest rates',
  shares: 'Shares and credit',
  currencies: 'Currencies',
  commodities: 'Oil, copper and wheat',
  gold: 'Gold',
};

const E = { AUR: 'Aurelia', CAL: 'Calder', VER: 'Verana', KES: 'Kesh', NOR: 'Norvik', SAR: 'Sarvan' };
const SAR_SPREAD = 0.40;

function bond(econ, tenor, extra) {
  const is10 = tenor === 10;
  const sig = { AUR: [2.0, 3.0], CAL: [2.0, 3.0], VER: [2.5, 3.5], KES: [2.5, 4.0], NOR: [3.0, 4.0], SAR: [4.0, 5.5] }[econ];
  const depth = { AUR: 9000, CAL: 5000, VER: 5000, KES: 2500, NOR: 2500, SAR: 1200 }[econ];
  return {
    id: `${econ}${tenor}Y`, family: 'govt', kind: is10 ? 'bond10' : 'bond2', econ, ccy: econ, funded: true,
    name: `${E[econ]} ${tenor}-Year Bond`, short: `${econ} ${tenor}Y`,
    dur: is10 ? 8.0 : 1.9, sigma0: sig[is10 ? 1 : 0],
    risk: econ === 'VER' ? 'VER-debt' : econ === 'KES' ? 'KES-debt' : `${econ}-rates`, sign: 1,
    depth, spread: econ === 'SAR' ? SAR_SPREAD : 0.10, startLocal: 100,
    ...extra,
  };
}

export const INSTRUMENTS = [
  // ---- Government Bonds (14) ----
  bond('AUR', 2), bond('AUR', 10), bond('CAL', 2), bond('CAL', 10), bond('VER', 2), bond('VER', 10),
  bond('KES', 2), bond('KES', 10), bond('NOR', 2), bond('NOR', 10), bond('SAR', 2), bond('SAR', 10),
  { id: 'AURIL10', family: 'govt', kind: 'ilb', econ: 'AUR', ccy: 'AUR', funded: true,
    name: 'Aurelia Inflation-Linked 10-Year', short: 'AUR IL 10Y', dur: 8.5, sigma0: 3.0,
    risk: 'AUR-rates', sign: 1, depth: 5000, spread: 0.10, startLocal: 100 },
  { id: 'KESCB5', family: 'govt', kind: 'crownbond', econ: 'KES', ccy: 'AUR', funded: true,
    name: 'Kesh Crown Bond 5-Year', short: 'KES ₵ 5Y', dur: 4.5, sigma0: 3.0,
    risk: 'KES-debt', sign: 1, depth: 2500, spread: 0.10, startLocal: 100 },
  // ---- Corporate Credit (2) ----
  { id: 'AURIG', family: 'credit', kind: 'ig', econ: 'AUR', ccy: 'AUR', funded: true,
    name: 'Aurelian Investment Grade', short: 'AUR IG', dur: 6.0, sigma0: 3.0,
    risk: 'AUR-rates', sign: 1, depth: 5000, spread: 0.10, startLocal: 100 },
  { id: 'AURHY', family: 'credit', kind: 'hy', econ: 'AUR', ccy: 'AUR', funded: true,
    name: 'Aurelian High Yield', short: 'AUR HY', dur: 4.0, sigma0: 4.0,
    risk: 'shares', sign: 1, depth: 3000, spread: 0.10, startLocal: 100 },
  // ---- Shares (8) ----
  ...['AUR', 'CAL', 'VER', 'KES', 'NOR', 'SAR'].map((econ) => ({
    id: `${econ}EQ`, family: 'shares', kind: 'equity', econ, ccy: econ, funded: true,
    name: `${E[econ]} Shares`, short: `${econ} Shares`,
    sigma0: { AUR: 5, CAL: 6, VER: 5, KES: 8, NOR: 6, SAR: 9 }[econ],
    risk: 'shares', sign: 1, depth: { AUR: 9000, CAL: 6000, VER: 4000, KES: 2500, NOR: 2500, SAR: 1200 }[econ],
    spread: econ === 'SAR' ? SAR_SPREAD : 0.10, startLocal: 100,
  })),
  { id: 'AURBANKS', family: 'shares', kind: 'banks', econ: 'AUR', ccy: 'AUR', funded: true,
    name: 'Aurelian Banks', short: 'AUR Banks', sigma0: 7, risk: 'shares', sign: 1, depth: 3000, spread: 0.10, startLocal: 100 },
  { id: 'NORENERGY', family: 'shares', kind: 'energy', econ: 'NOR', ccy: 'NOR', funded: true,
    name: 'Norvik Energy', short: 'NOR Energy', sigma0: 8, risk: 'shares', sign: 1, depth: 2500, spread: 0.10, startLocal: 100 },
  // ---- Currencies (6), each priced in rupees ----
  ...[['AUR', 'CROWN', 'Crown', 2.0, 12000], ['CAL', 'MARK', 'Mark', 2.0, 6000], ['VER', 'FLORIN', 'Florin', 2.5, 5000],
    ['KES', 'DINAR', 'Dinar', 2.0, 2500], ['NOR', 'KRONE', 'Krone', 3.0, 3000], ['SAR', 'ORA', 'Ora', 4.5, 1200]]
    .map(([econ, id, nm, sig, depth]) => ({
      id, family: 'fx', kind: 'fx', econ, ccy: null, funded: true,
      name: `${nm} (${E[econ]})`, short: nm, sigma0: sig, risk: 'currencies', sign: 1, depth,
      spread: econ === 'SAR' ? SAR_SPREAD : 0.10,
    })),
  // ---- Rate Futures (6) ----
  ...['AUR', 'CAL', 'VER', 'KES', 'NOR', 'SAR'].map((econ) => ({
    id: `${econ}FUT`, family: 'futures', kind: 'future', econ, ccy: null, funded: false,
    name: `${E[econ]} 3-Month Rate Future`, short: `${econ} Rate Fut`,
    sigma0: { AUR: 0.15, CAL: 0.15, VER: 0.12, KES: 0.30, NOR: 0.15, SAR: 0.30 }[econ],
    risk: econ === 'VER' ? 'VER-debt' : econ === 'KES' ? 'KES-debt' : `${econ}-rates`, sign: 1,
    depth: { AUR: 15000, CAL: 6000, VER: 6000, KES: 3000, NOR: 3000, SAR: 1500 }[econ],
    spread: econ === 'SAR' ? SAR_SPREAD : 0.10,
  })),
  // ---- Commodities (4), priced in rupees ----
  { id: 'OIL', family: 'commod', kind: 'oil', econ: null, ccy: null, funded: true, name: 'Oil', short: 'Oil', unit: 'per barrel',
    sigma0: 10, risk: 'commodities', sign: 1, depth: 6000, spread: 0.10, startLocal: 6500 },
  { id: 'COPPER', family: 'commod', kind: 'copper', econ: null, ccy: null, funded: true, name: 'Copper', short: 'Copper', unit: 'per tonne',
    sigma0: 7, risk: 'commodities', sign: 1, depth: 4000, spread: 0.10, startLocal: 780000 },
  { id: 'WHEAT', family: 'commod', kind: 'wheat', econ: null, ccy: null, funded: true, name: 'Wheat', short: 'Wheat', unit: 'per quintal',
    sigma0: 7, risk: 'commodities', sign: 1, depth: 2500, spread: 0.10, startLocal: 2400 },
  { id: 'GOLD', family: 'commod', kind: 'gold', econ: null, ccy: null, funded: true, name: 'Gold', short: 'Gold', unit: 'per 10 g',
    sigma0: 5, risk: 'gold', sign: 1, depth: 6000, spread: 0.10, startLocal: 62000 },
  // ---- Volatility (1) ----
  { id: 'FEAR', family: 'vol', kind: 'fear', econ: null, ccy: null, funded: true, name: 'The Fear Index', short: 'Fear Index',
    sigma0: 20, risk: 'shares', sign: -1, depth: 2000, spread: 0.10 },
  // ---- Default Protection (3) ----
  { id: 'KESCDS', family: 'cds', kind: 'cds', econ: 'KES', entity: 'KES', ccy: null, funded: false,
    name: 'Kesh Government Default Protection', short: 'KES Protection', sigma0: 2.0, risk: 'KES-debt', sign: -1, depth: 3000, spread: 0.10 },
  { id: 'VERCDS', family: 'cds', kind: 'cds', econ: 'VER', entity: 'VER', ccy: null, funded: false,
    name: 'Verana Government Default Protection', short: 'VER Protection', sigma0: 1.0, risk: 'VER-debt', sign: -1, depth: 3000, spread: 0.10 },
  { id: 'BANKCDS', family: 'cds', kind: 'cds', econ: 'AUR', entity: 'BANKS', ccy: null, funded: false,
    name: 'Aurelian Banks Default Protection', short: 'Bank Protection', sigma0: 1.0, risk: 'shares', sign: -1, depth: 3000, spread: 0.10 },
];

export const INST = Object.fromEntries(INSTRUMENTS.map((x) => [x.id, x]));
export const INST_IDS = INSTRUMENTS.map((x) => x.id);

if (INSTRUMENTS.length !== 44) throw new Error(`Expected 44 instruments, found ${INSTRUMENTS.length}`);
