// How to Play — open to everyone, before and during the game. It matches the printed
// guide and never reveals anything from the script.
import { h, mount, store, calc, steps, fmtNum, fmtCr, fmtPrice, fmtSigned } from '../ui.mjs';
import { ECONOMIES, ECON_ORDER } from '../../src/config/economies.mjs';
import { INSTRUMENTS, FAMILIES, INST } from '../../src/config/instruments.mjs';
import { RULES, ROUNDS } from '../../src/config/rules.mjs';
import { explainInstrument, GLOSSARY } from '../../src/config/explain.mjs';
import { startRelease, decide, ruleText, smoothingText } from '../../src/engine/macro.mjs';
import { initialMarket, cdsPrice } from '../../src/engine/market.mjs';
import { riskUsed } from '../../src/engine/risk.mjs';
import { forecastPoints, specula } from '../../src/engine/scoring.mjs';
import { QUARTER_STEPS, START_STATS } from './home.mjs';

const CR = 1e9;
const FAMILY_TEXT = {
  govt: ['2-year and 10-year bonds of all six economies · Aurelia Inflation-Linked 10-year · Kesh Crown Bond 5-year', 'Prices move opposite to interest rates, and the 10-year moves furthest. The inflation-linked bond’s value rises with Aurelian inflation, so it gains on an ordinary bond when prices surprise upward. The Crown Bond is Kesh borrowing in crowns: no dinar risk for you, but it falls as Kesh looks less able to pay.'],
  credit: ['Aurelian Investment Grade · Aurelian High Yield', 'Baskets of company bonds. Investment grade lends to strong companies; high yield lends to weaker ones, pays far more interest and falls hardest when the economy turns.'],
  shares: ['Market indices of all six economies · Aurelian Banks · Norvik Energy', 'Market indices follow growth, profits and the cost of borrowing. The two sector indices are narrower: bank shares answer to lending and bad loans, energy shares to the price of oil and gas.'],
  fx: ['Crown · mark · florin · dinar · krone · ora, each priced in rupees', 'Holding a currency earns that country’s short-term rate. A currency rises when money flows into its country and falls when money leaves.'],
  futures: ['3-month rate futures for all six economies', 'A bet on next round’s policy rate. Priced as 100 minus the rate the market expects, and settled at 100 minus the rate the central bank actually sets: buy if you expect rates lower than the market does, sell if higher.'],
  commod: ['Oil · Copper · Wheat · Gold', 'Oil follows world demand and anything that disturbs supply. Copper follows industry and building, wheat follows harvests and food supply, and gold pays nothing but is bought when investors are afraid.'],
  vol: ['The Fear Index', 'Measures how violently share prices are expected to move. It jumps when markets panic and drifts down when they are calm, and holding it costs a fee every round.'],
  cds: ['Kesh Government · Verana Government · Aurelian Banks', 'Insurance against a borrower failing to pay. It costs a premium every round, its price rises as default looks more likely, and it pays out in full if the default happens.'],
};

export default function learn(app, { band }) {
  const rel = startRelease();
  const mkt = initialMarket(rel);
  const sigma = Object.fromEntries(INSTRUMENTS.map((x) => [x.id, x.sigma0]));
  const theme = document.documentElement.dataset.theme;
  const toggle = h('button', { class: 'btn sm ghost', onclick: () => { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = t; store('specula-theme-learn', t); } }, theme === 'light' ? 'Night theme' : 'Parchment theme');
  const sections = [
    ['what', 'What SPECULA Is'], ['world', 'The World'], ['quarter', 'A Round'], ['markets', 'The Markets'], ['desk', 'The Desk'],
    ['limit', 'The 3× Limit'], ['risk', 'Risk Used'], ['forced', 'Forced Liquidation'], ['forecasts', 'Forecasts'], ['crises', 'Crises'],
    ['data', 'Reading the Data'], ['rounds', 'The Six Rounds'], ['score', 'The SPECULA Score'], ['rules', 'Rules of Play'], ['words', 'Words'],
  ];
  const S = (id, title, ...kids) => h('section', { id: `learn-${id}` }, h('h2', {}, title), ...kids);

  // worked examples, computed with the real engine
  const aurRule = decide('AUR', 4.0, { g: 1.2, pi: 4.6 }, 0, {});
  const riskEx = riskUsed({ AUREQ: 400 * CR, AUR10Y: 300 * CR, CALEQ: -200 * CR }, 1000 * CR, sigma, 1);
  const riskCrisis = riskUsed({ AUREQ: 400 * CR, AUR10Y: 300 * CR, CALEQ: -200 * CR }, 1000 * CR, sigma, 1.5);
  const fc1 = forecastPoints(4.30, 4.50); const fc2 = forecastPoints(5.25, 4.50);
  const s0 = 1000 * CR;
  const scoreEx = specula([
    { id: 'a', name: 'Fund A', navHist: [s0, 1.03 * s0, 1.05 * s0, 1.04 * s0, 1.09 * s0], forecastPoints: 32, forced: 0 },
    { id: 'b', name: 'Fund B', navHist: [s0, 1.15 * s0, 0.92 * s0, 1.2 * s0, 1.12 * s0], forecastPoints: 15, forced: 1 },
  ], 4);
  const A = scoreEx.rows.find((r) => r.id === 'a'); const B = scoreEx.rows.find((r) => r.id === 'b');

  mount(app, band('learn'), h('main', { class: 'narrow learn' },
    h('div', { class: 'row between' }, h('div', { class: 'eyebrow' }, 'The Guide · open to everyone'), toggle),
    h('h1', {}, 'How to Play'),
    h('p', { class: 'lead' }, 'Everything on this page matches the printed guide. Every example is worked out by the same calculations the game uses, so you can check them with a calculator.'),
    h('nav', { class: 'toc', 'aria-label': 'Sections' }, sections.map(([id, t]) => h('a', { href: `#/learn`, onclick: (e) => { e.preventDefault(); document.getElementById(`learn-${id}`)?.scrollIntoView({ behavior: 'smooth' }); } }, t))),

    S('what', 'What SPECULA Is',
      h('p', {}, 'SPECULA, Latin for watchtower and the root of speculation, is a live macroeconomic trading simulation. Each team runs an investment fund. Six invented economies grow, slow, overheat and break on their own, and your fund trades their bonds, shares, currencies and commodities as they do. Every trade is entered on your own device, every price and score is calculated by the simulation, and nothing is judged.'),
      h('div', { class: 'big-stats' }, START_STATS.map(([b, s]) => h('div', { class: 's' }, h('b', {}, b), h('span', { class: 'muted small' }, s)))),
      h('p', { class: 'muted', style: { marginTop: '10px' } }, 'Positions, prices and fund values carry over from round to round: the six rounds are one continuous story.')),

    S('world', 'The World',
      h('p', {}, 'Six invented economies, each built on a different way a country can earn its living, and fail to. Figures are each economy’s position at the start of Round 01, at annual rates.'),
      h('div', { class: 'grid g2' }, ECON_ORDER.map((e) => {
        const c = ECONOMIES[e]; const r = rel.econ[e];
        return h('div', { class: 'card tight' },
          h('div', { class: 'row between' }, h('h3', { style: { margin: 0 } }, c.name), h('span', { class: 'gold', style: { fontStyle: 'italic' } }, `${c.title} · ${c.currency}`)),
          h('p', { class: 'small', style: { marginTop: '8px' } }, c.blurb),
          h('div', { class: 'row', style: { gap: '18px' } },
            [['Growth', `${fmtNum(r.g, 1)}%`], [`Inflation · target ${c.target}%`, `${fmtNum(r.pi, 1)}%`], ['Policy rate', `${fmtNum(r.i, 1)}%`], ['Debt to GDP', `${r.debt}%`]]
              .map(([k, v]) => h('div', {}, h('b', { class: 'num', style: { fontSize: '20px' } }, v), h('div', { class: 'tiny muted' }, k)))));
      })),
      h('h3', {}, 'How They Are Linked'),
      h('p', {}, 'No economy stands alone. Calder sells its goods to Aurelia and Verana, and buys oil from Norvik and copper and wheat from Sarvan. Kesh borrows from Aurelian lenders, and Verana borrows mostly from itself. Every central bank sets its rate by its own rule, shown on the desk, but all of them watch Aurelia’s. A change in one economy travels to the others through trade, prices, interest rates and the movement of money.')),

    S('quarter', 'How Every Round Works',
      h('ol', { class: 'step-list' }, QUARTER_STEPS.map(([t, d]) => h('li', {}, h('h4', { style: { marginTop: 0 } }, t), h('span', { class: 'small' }, d)))),
      h('p', { style: { marginTop: '12px' } }, 'Prices do not move when the data drops — they move when a crisis breaks and when the market settles. So the ten minutes between the data and the bell are when reading the economy pays: the data tells you what the central banks are about to do, and the desk shows the rules they use.')),

    S('markets', 'The Markets',
      h('p', {}, 'Forty-four instruments in eight families. Every one can be bought or sold short. Every price on the desk is in rupees. The desk shows each instrument’s price, its change since the last round, and what holding it earns or costs.'),
      FAMILIES.map((f) => h('details', { class: 'fam', open: f.id === 'govt' },
        h('summary', {}, `${f.name} · ${f.count}`, h('span', { class: 'tiny' }, 'open')),
        h('p', { class: 'small', style: { marginTop: '8px' } }, h('b', {}, FAMILY_TEXT[f.id][0])),
        h('p', { class: 'small' }, FAMILY_TEXT[f.id][1]),
        INSTRUMENTS.filter((x) => x.family === f.id).map((x) => {
          const ex = explainInstrument(x.id, mkt);
          return h('div', { class: 'card quiet tight', style: { margin: '10px 0' } },
            h('div', { class: 'row between' }, h('b', {}, x.name), h('span', { class: 'tiny muted' }, `trading cost ${fmtNum(x.spread)}%${x.funded ? '' : ' · no cash needed'}`)),
            h('p', { class: 'small', style: { margin: '4px 0' } }, ex.line),
            h('div', { class: 'example' }, h('div', { class: 'eyebrow' }, 'Worked example'), ex.examples.map((t) => h('p', { class: 'small', style: { margin: '4px 0' } }, t))));
        })))),

    S('desk', 'The Trading Desk',
      h('p', {}, 'One fund and forty-four markets: how a trade works, and what holding a position earns and costs.'),
      h('div', { class: 'grid g3' },
        [['Buy', 'Hold an instrument, in ₹ Cr. You gain when its price rises.'], ['Sell Short', 'Sell an instrument you do not own. You gain when its price falls.'], ['Close', 'End a position, all of it or part, and take the profit or loss.']]
          .map(([t, d]) => h('div', { class: 'card tight' }, h('h4', { style: { marginTop: 0 } }, t), h('p', { class: 'small' }, d)))),
      h('p', { style: { marginTop: '12px' } }, 'All positions together, buys and shorts both counted, may reach three times your fund value; the desk refuses any order beyond that. Unused cash earns the rupee cash rate shown on the desk; positions beyond your cash are funded by borrowing at that rate plus 1% a year.'),
      h('div', { class: 'example' }, h('div', { class: 'eyebrow' }, 'Worked example: cash'),
        calc(`The rupee cash rate is ${fmtNum(RULES.cashRatePct)}% a year. A fund of ₹1,000 Cr holding nothing earns ₹1,000 Cr × ${fmtNum(RULES.cashRatePct)}% ÷ 4 = ₹${fmtNum(1000 * RULES.cashRatePct / 400)} Cr in a round.`,
          `A fund of ₹1,000 Cr that buys ₹1,500 Cr of bonds has borrowed ₹500 Cr: it pays ₹500 Cr × ${fmtNum(RULES.cashRatePct + 1)}% ÷ 4 = ₹${fmtNum(500 * (RULES.cashRatePct + 1) / 400)} Cr, and earns the bonds’ interest instead.`)),
      h('h3', {}, 'Earning and Paying While You Hold'),
      h('ul', {},
        h('li', {}, h('b', {}, 'You earn: '), 'interest on government and company bonds, and the short-term rate of any currency you hold, paid every round.'),
        h('li', {}, h('b', {}, 'You pay: '), 'the premium on default protection, the fee on the Fear Index, and the interest or rate on anything you have sold short.'),
        h('li', {}, h('b', {}, 'Settled each round: '), 'rate futures settle at the end of every round and roll into the next round’s contract. Shares, commodities and currencies pay nothing beyond their price change, except the rate a currency earns.')),
      h('h3', {}, 'The Price You Pay'),
      h('p', {}, 'Every trade costs a spread: 0.10% in calm markets, more under strain, always shown on the desk. Prices also answer to the room. When many funds buy the same instrument in one round, its price is pushed up before it settles, and heavy selling pushes it down. One fund moves a market a little; every fund doing the same thing moves it a lot.'),
      h('div', { class: 'example' }, h('div', { class: 'eyebrow' }, 'Worked example: the spread and the crowd'),
        calc('Buying ₹200 Cr costs ₹200 Cr × 0.10% = ₹0.20 Cr.',
          `Crowd impact: if all funds together buy ₹6,000 Cr of Aurelian Shares in one round and that market’s depth is ₹${INST.AUREQ.depth.toLocaleString('en-IN')} Cr, the price is pushed ${fmtNum(RULES.crowdImpactPctPerDepth * 6000 / INST.AUREQ.depth)}% against the buyers. Your ₹200 Cr purchase pays ₹200 Cr × ${fmtNum(RULES.crowdImpactPctPerDepth * 6000 / INST.AUREQ.depth)}% = ₹${fmtNum(2 * RULES.crowdImpactPctPerDepth * 6000 / INST.AUREQ.depth)} Cr extra; a fund that sold gains the same share.`)),
      h('h3', {}, 'Your Fund Screen'),
      h('p', {}, 'Beside the markets, the desk shows your cash, every open position with its profit or loss, your total exposure against the 3× limit, your Risk Used, and your fund value. It updates as you trade and again when the round settles.'),
      h('h3', {}, 'Working as a Team'),
      h('p', {}, 'Members may sign in on their own devices; all see the same desk, and any member’s trade is the fund’s trade. Decide before the round who places orders and who reads the data, so no trade is placed twice.')),

    S('limit', 'The 3× Limit',
      h('p', {}, 'All positions together, buys and shorts both counted, may reach three times your fund value.'),
      h('div', { class: 'example' }, h('div', { class: 'eyebrow' }, 'Worked example'),
        calc('Fund value ₹1,000 Cr. You hold ₹1,200 Cr of Aurelia rate futures, ₹500 Cr of Calder bonds and are short ₹600 Cr of oil.',
          'Exposure = 1,200 + 500 + 600 = ₹2,300 Cr = 2.3× your fund value.',
          'The most you may hold is 3 × ₹1,000 Cr = ₹3,000 Cr, so you can add at most ₹700 Cr more. A bigger order is refused. Closing or cutting a position is always allowed.'))),

    S('risk', 'Risk Used',
      h('p', {}, 'An estimate of what your fund could lose in a bad round, shown as a share of the limit. It grows with the size of each position and with how sharply that instrument has been moving. Positions that offset one another count for less.'),
      h('p', {}, 'When markets turn violent, the same positions carry more risk. Risk Used can rise past the limit without a single new trade. Watch it until the bell.'),
      h('div', { class: 'example' }, h('div', { class: 'eyebrow' }, 'Worked example'),
        h('p', { class: 'small' }, 'Fund value ₹1,000 Cr: long ₹400 Cr of Aurelia Shares, long ₹300 Cr of the Aurelia 10-Year Bond, short ₹200 Cr of Calder Shares.'),
        calc(...riskEx.lines.map((l) => `${INST[l.id].name}: ${fmtCr(Math.abs(l.value), 0)} × bad-round move ${fmtNum(l.bad)}% (2 × typical ${fmtNum(l.typical)}%) = ${fmtCr(l.risk)}`)),
        calc(...riskEx.families.map((f) => `${f.name}: ½ × |net ${fmtNum(f.net / CR)}| + ½ × √(sum of squares) ${fmtNum(f.spread / CR)} = ${fmtCr(f.risk)}`)),
        calc(`Combined: √(${riskEx.families.map((f) => fmtNum(f.risk / CR)).join('² + ')}²) = ${fmtCr(riskEx.combined)}`,
          `Limit: ${RULES.riskBudgetPct}% of ₹1,000 Cr = ${fmtCr(riskEx.budget)}. Risk Used = ${fmtCr(riskEx.loss)} ÷ ${fmtCr(riskEx.budget)} = ${fmtNum(riskEx.pct)}%`,
          `If a crisis raises the crisis multiplier to 1.5, the same positions use ${fmtNum(riskCrisis.pct)}% — without a single new trade.`),
        h('p', { class: 'small muted' }, 'The short in Calder Shares partly offsets the long in Aurelia Shares, because shares tend to move together: that is why the shares family counts for less than the two risks added up.'))),

    S('forced', 'Forced Liquidation',
      h('p', {}, 'If Risk Used is above 100% when the round settles, the system closes your largest positions until it falls to 80%, at a price 2% worse than the market, and records a forced liquidation against your fund. Each one costs 5 of your 15 Risk Discipline points.'),
      h('div', { class: 'example' }, h('div', { class: 'eyebrow' }, 'Worked example'),
        calc('At the bell your Risk Used is 112%. Your largest position is ₹900 Cr of Kesh Shares.',
          'The system sells Kesh Shares until Risk Used is 80% — say ₹350 Cr of them.',
          'Penalty: ₹350 Cr × 2% = ₹7 Cr, and a forced liquidation is recorded (Risk Discipline 15 → 10).'))),

    S('forecasts', 'Forecasts',
      h('p', {}, 'Every round the desk names one figure to forecast for the next release: a country’s inflation, growth, unemployment or policy rate.'),
      h('p', {}, 'Up to 10 points a forecast. You lose 1 point for every 0.1 percentage point you are off. Six forecasts in all, one a round, worth up to 60 points. A blank forecast scores zero.'),
      h('div', { class: 'example' }, h('div', { class: 'eyebrow' }, 'Worked example'), steps([...fc1.steps, ...fc2.steps]),
        h('p', { class: 'small muted' }, 'Hint: when the question is a policy rate, the next release’s rate is the one the central bank sets at this round’s settlement — and the rule is on your desk.'))),

    S('crises', 'Crises',
      h('p', {}, 'At any moment the Event Head may release a crisis. Headlines and posts appear on every screen and prices react at once. A crisis may also change the data, the rules or the cost of trading for the rest of the round. Nothing about a crisis is announced in advance, and the desk stays open through it for as long as the window runs.'),
      h('ul', {},
        h('li', {}, 'Some crises come in stages: a second headline can follow the first in the same window — and it may not point the same way.'),
        h('li', {}, 'Official accounts are marked ✔. Not every post is true.'),
        h('li', {}, 'After a crisis, orders placed at the old prices are refused: the desk asks you to look again at the new prices.'),
        h('li', {}, 'Crises can change a central bank’s rule for the rest of the round — the desk shows the change in force.'))),

    S('data', 'Reading the Data',
      h('p', {}, 'Each release gives growth, inflation, unemployment, the policy rate, the budget balance and the current account for every economy, with figures particular to each, such as reserves or oil output. Each central bank’s rule for setting rates is on the desk. Everything the simulation does follows from the data and the rules you can see. A calculator is allowed, and you will want one.'),
      h('p', {}, 'Beside growth and inflation the release shows what forecasters expected. The gap between the two is the surprise — and surprises are what move prices at settlement.'),
      h('h3', {}, 'The six central bank rules'),
      ECON_ORDER.map((e) => h('div', { class: 'panel', style: { margin: '8px 0' } }, h('div', { class: 'eyebrow' }, ECONOMIES[e].name), h('div', { class: 'small' }, ruleText(e)), h('div', { class: 'small muted' }, smoothingText(e)))),
      h('div', { class: 'example' }, h('div', { class: 'eyebrow' }, 'Worked example: Aurelia’s rule'),
        h('p', { class: 'small' }, 'Suppose Aurelian inflation is 4.6%, growth is 1.2% (0.8 below its trend of 2.0%) and the rate was 4.00%:'),
        steps(aurRule.steps))),

    S('rounds', 'The Six Rounds',
      h('div', { class: 'grid g3' }, ROUNDS.map((r) => h('div', { class: 'card tight' }, h('div', { class: 'eyebrow' }, `0${r.n}`), h('h4', { style: { marginTop: '4px' } }, r.name), h('div', { class: 'tiny muted' }, r.n === 6 ? 'One ten-minute window · the final round' : 'One ten-minute window')))),
      h('p', { class: 'muted', style: { marginTop: '10px' } }, 'Six rounds, each with one data drop and one ten-minute trading window. The economy runs on from round to round, and what each round brings is revealed only when it opens. Each round stands for three months of the economy, so interest, carry and fees for a round are a quarter of their yearly rate. Some rounds add a decision to the desk; it appears on screen, with its rules, when that round begins.')),

    S('score', 'How Funds Are Ranked: the SPECULA Score',
      h('p', {}, 'Funds are ranked by the SPECULA Score, out of 100, calculated once, after Round 06 and the final release. It rewards a fund that read the economy well over one that gambled and got lucky.'),
      h('div', { class: 'grid g3' },
        h('div', { class: 'card tight' }, h('b', { style: { fontSize: '28px' } }, '60'), h('h4', {}, 'Risk-Adjusted Return'), h('p', { class: 'small' }, 'Your fund’s total return divided by how much its value swung from round to round, less a penalty for its deepest fall from a peak. The best fund in the room scores 60, the rest in proportion; a fund that ends below ₹1,000 Cr scores zero here.')),
        h('div', { class: 'card tight' }, h('b', { style: { fontSize: '28px' } }, '25'), h('h4', {}, 'Forecast Accuracy'), h('p', { class: 'small' }, 'Your forecast points from all six rounds, scaled so that a perfect record scores 25.')),
        h('div', { class: 'card tight' }, h('b', { style: { fontSize: '28px' } }, '15'), h('h4', {}, 'Risk Discipline'), h('p', { class: 'small' }, 'Every fund starts with 15. Each forced liquidation costs 5, down to zero.'))),
      h('p', { style: { marginTop: '12px' } }, `How the return is measured: the return counted is what your decisions earned beyond the rupee cash rate — a fund that leaves everything in cash earns the cash rate and nothing more, so it scores zero here. The swing is the standard deviation of your per-round returns (at least ${fmtNum(RULES.swingFloorPct)}%), and the penalty is ${RULES.fallPenaltyPerPct} for every 1% of your deepest fall.`),
      h('div', { class: 'example' }, h('div', { class: 'eyebrow' }, 'Worked example over four rounds'),
        h('p', { class: 'small' }, 'Fund A grows steadily to ₹1,090 Cr. Fund B swings wildly and ends at ₹1,120 Cr with one forced liquidation.'),
        h('h4', {}, 'Fund A'), steps([...A.steps.rar, ...A.steps.forecast, ...A.steps.discipline, `SPECULA Score = ${fmtNum(A.rar, 1)} + ${fmtNum(A.forecast, 1)} + ${A.discipline} = ${fmtNum(A.total, 1)}`]),
        h('h4', {}, 'Fund B'), steps([...B.steps.rar, ...B.steps.forecast, ...B.steps.discipline, `SPECULA Score = ${fmtNum(B.rar, 1)} + ${fmtNum(B.forecast, 1)} + ${B.discipline} = ${fmtNum(B.total, 1)}`]),
        h('p', { class: 'small muted' }, 'Fund B made more money but Fund A ranks higher: it read the economy, kept its swings small and was never forced to sell.')),
      h('p', {}, 'Results are sealed. After every round your desk shows your own fund value, your profit and loss on each position, your Risk Used and your forecast marks — never another fund’s, and there is no live leaderboard. The SPECULA Score compares you with the best fund in the room, so it is worked out only at the end, and the Event Head reveals the standings on the Big Screen. If two funds tie on the SPECULA Score, the higher final fund value ranks first.')),

    S('rules', 'Rules of Play',
      h('ol', {},
        h('li', {}, 'Each team runs one fund. Members may sign in to it on their own devices.'),
        h('li', {}, 'Trades and forecasts are accepted only while the window is open. Late orders are refused.'),
        h('li', {}, 'Positions stay open from round to round until you close them.'),
        h('li', {}, 'Every price, result and score is calculated for all funds at the same moment. There is no judging and no appeal.'),
        h('li', {}, 'Fund codes are private. Speaking to other teams or looking at their screens is not permitted.'),
        h('li', {}, 'Calculators are allowed. No device other than your desk and calculator may be used.'))),

    S('words', 'Words You Will Meet',
      h('dl', {}, GLOSSARY.map(([t, d]) => [h('dt', { style: { fontWeight: 600, marginTop: '10px' } }, t), h('dd', { style: { margin: '2px 0 0' }, class: 'small' }, d)]))),

    h('hr'), h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/practice' }, 'Try two practice rounds'), h('a', { class: 'btn ghost', href: '#/desk' }, 'Join your fund'))));
}
