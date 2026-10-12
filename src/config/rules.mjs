// Game rules. Every number marked GUIDE is printed in the participant guide and is a
// promise to players. The rest are model settings, explained in docs/05_ACCOUNTING_RISK_SCORING.md.

export const RULES = {
  startFundCr: 1000,        // GUIDE: ₹1,000 Cr, all in cash
  leverageLimit: 3,         // GUIDE: 3× fund value, buys and shorts both counted
  riskLimitPct: 100,        // GUIDE: Risk Used limit 100%
  forcedTargetPct: 80,      // GUIDE: forced liquidation brings Risk Used down to 80%
  forcedWorsePct: 2,        // GUIDE: at a price 2% worse than the market
  baseSpreadPct: 0.10,      // GUIDE: 0.10% in calm markets
  quartersPerRound: 4,      // GUIDE
  rounds: 6,                // GUIDE
  quarters: 24,             // GUIDE
  windowSeconds: 120,       // GUIDE: two-minute window
  forecastMaxPoints: 10,    // GUIDE: up to 10 points a forecast
  forecastPointsPerTenth: 1,// GUIDE: lose 1 point for every 0.1 percentage point off
  score: { rar: 60, forecast: 25, discipline: 15, perForced: 5 }, // GUIDE

  cashRatePct: 6.00,        // rupee cash rate shown on the desk
  borrowExtraPct: 1.00,     // GUIDE: borrowing costs the cash rate plus 1% a year
  rupeeInflationPct: 5.00,  // used for currency drift (purchasing power)
  riskBudgetPct: 15,        // Risk Used 100% = a bad-quarter loss of 15% of fund value
  badQuarterMultiple: 2,    // a "bad quarter" is two typical moves
  crowdImpactPctPerDepth: 1.0, // net flow equal to market depth moves the price 1%
  crowdImpactCapPct: 3.0,
  fearFeePct: 3.00,         // Fear Index fee per quarter
  swingFloorPct: 1.00,      // smallest swing used in the risk-adjusted return
  fallPenaltyPerPct: 0.25,  // risk-adjusted return loses 0.25 for each 1% of deepest fall
  sigmaMemory: 0.80,        // how quickly "how sharply it has been moving" forgets old moves
};

export const ROUNDS = [
  { n: 1, name: 'Markets in Normal Times', quarters: [1, 2, 3, 4] },
  { n: 2, name: 'Inflation and Interest Rates', quarters: [5, 6, 7, 8] },
  { n: 3, name: 'Commodities and Trade', quarters: [9, 10, 11, 12] },
  { n: 4, name: 'Emerging Markets and Currencies', quarters: [13, 14, 15, 16] },
  { n: 5, name: 'Banking and Credit', quarters: [17, 18, 19, 20] },
  { n: 6, name: 'Sovereign Debt and Recovery', quarters: [21, 22, 23, 24] },
];

export const roundOf = (q) => Math.min(6, Math.max(1, Math.ceil(q / 4)));
export const roundName = (q) => ROUNDS[roundOf(q) - 1].name;

export const FORECAST_VARS = {
  g: { label: 'growth', unit: '%' },
  pi: { label: 'inflation', unit: '%' },
  u: { label: 'unemployment', unit: '%' },
  i: { label: 'policy rate', unit: '%' },
};
