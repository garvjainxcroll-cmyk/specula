// Forecast points and the SPECULA Score (guide pages 05 and 06), with full arithmetic.

import { RULES } from '../config/rules.mjs';
import { r1, r2, roundTo, fmtNum, fmtCr } from './num.mjs';

/** Up to 10 points; lose 1 point for every 0.1 percentage point off. A blank scores zero. */
export function forecastPoints(forecast, actual) {
  if (forecast === null || forecast === undefined || forecast === '' || !Number.isFinite(Number(forecast))) {
    return { forecast: null, actual, error: null, points: 0, steps: ['No forecast was entered, so it scores zero.'] };
  }
  const f = r2(Number(forecast));
  const error = r2(Math.abs(f - actual));
  const lost = r1(error / 0.1 * RULES.forecastPointsPerTenth);
  const points = r1(Math.max(0, RULES.forecastMaxPoints - lost));
  return {
    forecast: f, actual, error, points,
    steps: [
      `Your forecast ${fmtNum(f)}, the release ${fmtNum(actual)}: off by ${fmtNum(error)} percentage points.`,
      `Points = 10 − (${fmtNum(error)} ÷ 0.1) × 1 = 10 − ${fmtNum(lost, 1)} = ${fmtNum(Math.max(0, 10 - lost), 1)}${10 - lost < 0 ? ', and never below 0' : ''}.`,
    ],
  };
}

/**
 * The fund-value statistics behind the risk-adjusted return. navHist in paise: [start, after
 * round 1, …]. flows: capital the Event Head added (+) or removed (−), by round { q: paise }.
 * Capital is not profit, so returns are measured round by round on the money in the fund at
 * the start of each round (a time-weighted return). With no flows this is simply the fund
 * value: `adj` below equals navHist exactly.
 */
export function fundStats(navHist, flows = {}) {
  const n = navHist.length - 1;
  const adj = [navHist[0]];
  let scale = 1;
  const hasFlows = Object.values(flows || {}).some((x) => x);
  for (let k = 1; k <= n; k++) {
    const f = flows?.[k] || 0;
    if (f) scale *= navHist[k - 1] / (navHist[k - 1] + f);
    adj.push(scale === 1 ? navHist[k] : navHist[k] * scale);
  }
  const start = adj[0];
  const end = adj[n];
  const contributed = navHist[0] + Object.entries(flows || {}).filter(([q]) => Number(q) <= n).reduce((a, [, x]) => a + x, 0);
  const totalReturn = r2((end / start - 1) * 100);
  const cashGrowth = r2(((1 + RULES.cashRatePct / 400) ** n - 1) * 100);
  const excess = r2(totalReturn - cashGrowth);
  const qret = [];
  for (let k = 1; k <= n; k++) qret.push(r2((adj[k] / adj[k - 1] - 1) * 100));
  const mean = n ? r2(qret.reduce((a, b) => a + b, 0) / n) : 0;
  const sq = qret.map((x) => r2((x - mean) ** 2));
  const variance = n ? r2(sq.reduce((a, b) => a + b, 0) / n) : 0;
  const swing = r2(Math.sqrt(variance));
  let peak = start; let deepest = 0; let peakQ = 0; let troughQ = 0; let curPeakQ = 0;
  for (let k = 0; k <= n; k++) {
    if (adj[k] > peak) { peak = adj[k]; curPeakQ = k; }
    const fall = r2((peak - adj[k]) / peak * 100);
    if (fall > deepest) { deepest = fall; peakQ = curPeakQ; troughQ = k; }
  }
  const swingUsed = Math.max(swing, RULES.swingFloorPct);
  const riskAdj = r2(excess / swingUsed - RULES.fallPenaltyPerPct * deepest);
  return { n, start, end, navEnd: navHist[n], contributed, hasFlows, totalReturn, cashGrowth, excess, qret, mean, sq, variance, swing, swingUsed, deepest, peakQ, troughQ, riskAdj };
}

/**
 * SPECULA Score for every fund. funds: [{ id, name, navHist, forecastPoints (sum), forced (count) }].
 * forecastsScored: how many forecasts have been marked so far (6 at the end).
 */
export function specula(funds, forecastsScored) {
  const stats = funds.map((f) => ({ f, s: fundStats(f.navHist, f.flows) }));
  const eligible = stats.filter(({ s }) => s.end >= s.start && s.riskAdj > 0);
  const best = eligible.length ? Math.max(...eligible.map(({ s }) => s.riskAdj)) : 0;
  const maxF = RULES.forecastMaxPoints * Math.max(1, forecastsScored);
  const W = RULES.score;
  const rows = stats.map(({ f, s }) => {
    const below = s.end < s.start;
    const rar = below || s.riskAdj <= 0 || best <= 0 ? 0 : r1(W.rar * s.riskAdj / best);
    const fc = r1(W.forecast * (f.forecastPoints || 0) / maxF);
    const disc = Math.max(0, W.discipline - W.perForced * (f.forced || 0));
    const total = r1(rar + fc + disc);
    const steps = {
      rar: [
        s.hasFlows
          ? `Total return, round by round so that capital the Event Head added or removed does not count as profit: the rounds’ returns (${s.qret.map((x) => `${fmtNum(x)}%`).join(', ')}) multiplied together = ${fmtNum(s.totalReturn)}%`
          : `Total return: ${fmtCr(s.end)} ÷ ${fmtCr(s.start)} − 1 = ${fmtNum(s.totalReturn)}%`,
        `Cash alone would have grown ${fmtNum(s.cashGrowth)}% (${fmtNum(RULES.cashRatePct)}% a year; each round counts as three months, so ${fmtNum(RULES.cashRatePct / 4)}% a round for ${s.n} rounds), so the return your decisions earned is ${fmtNum(s.totalReturn)} − ${fmtNum(s.cashGrowth)} = ${fmtNum(s.excess)}%`,
        `Swing (how much the fund value moved from round to round) = ${fmtNum(s.swing)}%${s.swing < RULES.swingFloorPct ? `, counted as at least ${fmtNum(RULES.swingFloorPct)}%` : ''}`,
        `Deepest fall from a peak = ${fmtNum(s.deepest)}%`,
        `Risk-adjusted return = ${fmtNum(s.excess)} ÷ ${fmtNum(s.swingUsed)} − ${RULES.fallPenaltyPerPct} × ${fmtNum(s.deepest)} = ${fmtNum(s.riskAdj)}`,
        below ? `The fund lost money overall (it ends below its starting capital), so it scores zero here.`
          : s.riskAdj <= 0 ? 'A risk-adjusted return of zero or less scores zero here.'
          : `Best in the room: ${fmtNum(best)}. Points = 60 × ${fmtNum(s.riskAdj)} ÷ ${fmtNum(best)} = ${fmtNum(rar, 1)}`,
      ],
      forecast: [`Forecast points ${fmtNum(f.forecastPoints || 0, 1)} out of ${maxF} possible so far. Points = 25 × ${fmtNum(f.forecastPoints || 0, 1)} ÷ ${maxF} = ${fmtNum(fc, 1)}`],
      discipline: [`15 − 5 × ${f.forced || 0} forced liquidation${f.forced === 1 ? '' : 's'} = ${disc}${15 - 5 * (f.forced || 0) < 0 ? ' (never below zero)' : ''}`],
    };
    return { id: f.id, name: f.name, nav: s.navEnd, stats: s, rar, forecast: fc, discipline: disc, total, steps };
  });
  rows.sort((a, b) => b.total - a.total || b.nav - a.nav || (a.name < b.name ? -1 : 1));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { rows, best, forecastsScored, maxF };
}
