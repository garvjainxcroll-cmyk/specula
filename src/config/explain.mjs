// Plain-English explanations of every instrument, with a small worked example built
// from the real numbers in the model (durations, starting yields and rates).
// Public: these appear in How to Play and on the desk.

import { INSTRUMENTS, INST } from './instruments.mjs';
import { ECONOMIES } from './economies.mjs';
import { RULES } from './rules.mjs';
import { fmtNum, r2 } from '../engine/num.mjs';

const E = (e) => ECONOMIES[e].name;

export const KIND_TEXT = {
  bond2: 'A loan to a government for two years. Its price moves opposite to interest rates, a little.',
  bond10: 'A loan to a government for ten years. Its price moves opposite to interest rates, and further than a 2-year bond.',
  ilb: 'Aurelia’s 10-year bond whose value rises with Aurelian inflation, so it gains on an ordinary bond when prices surprise upward.',
  crownbond: 'Kesh borrowing in crowns: no dinar risk for you, but it falls as Kesh looks less able to pay.',
  ig: 'A basket of bonds of strong Aurelian companies.',
  hy: 'A basket of bonds of weaker Aurelian companies: far more interest, and the hardest fall when the economy turns.',
  equity: 'The share index of the whole market: it follows growth, profits and the cost of borrowing.',
  banks: 'Aurelian bank shares: they answer to lending, interest rates and bad loans.',
  energy: 'Norvik’s energy companies: they answer to the price of oil and gas.',
  fx: 'Holding the currency earns that country’s short-term rate. It rises when money flows into the country and falls when money leaves.',
  future: 'A bet on next round’s policy rate. Priced as 100 minus the rate the market expects; settled at 100 minus the rate the central bank actually sets.',
  oil: 'Follows world demand and anything that disturbs supply.',
  copper: 'Follows industry and building, especially in Calder, the world’s factory.',
  wheat: 'Follows harvests and food supply, especially Sarvan’s.',
  gold: 'Pays nothing, but is bought when investors are afraid.',
  fear: 'Measures how violently share prices are expected to move. It jumps when markets panic, drifts down when they are calm, and holding it costs a fee every round.',
  cds: 'Insurance against a borrower failing to pay. It costs a premium every round, its price rises as default looks more likely, and it pays out in full if the default happens.',
};

/** One-line explanation and a worked example for an instrument. start = { yields, rates } at the start. */
export function explainInstrument(id, start) {
  const x = INST[id];
  const e = x.econ;
  const y = start?.econ?.[e];
  const ex = [];
  switch (x.kind) {
    case 'bond2': case 'bond10': {
      const D = x.dur; const yld = x.kind === 'bond2' ? y?.y2 : y?.y10;
      ex.push(`If you buy ₹100 Cr of the ${x.name} and its yield rises 0.50%, you lose about ₹${fmtNum(D * 0.5)} Cr, because its price moves about ${D} times the yield change the other way (${D} × 0.50% = ${fmtNum(D * 0.5)}%). Newly issued bonds now pay more, so yours is worth less.`);
      if (yld) ex.push(`While you hold it you earn its interest: at a ${fmtNum(yld)}% yield, ₹100 Cr earns ₹${fmtNum(yld / 4)} Cr a round.`);
      if (e !== null) ex.push(`It is priced in ${ECONOMIES[e].currencyPlural}, so a 2% fall in the ${ECONOMIES[e].currency} against the rupee costs you about another ₹2 Cr.`);
      break;
    }
    case 'ilb':
      ex.push(`If Aurelian inflation runs at 4% a year, 1% is added to the bond’s price each round (4 ÷ 4). If the real yield (the 10-year yield minus expected inflation) rises 0.50%, it loses about 8.5 × 0.50% = 4.25%.`);
      ex.push('So when inflation surprises upward, an ordinary 10-year bond falls (its yield rises), while this one is protected by the inflation added to its price.');
      break;
    case 'crownbond':
      ex.push('If Kesh’s borrowing spread rises 1%, the bond loses about 4.5 × 1% = 4.5%. If the dinar falls 30%, it does not care: it is paid in crowns. If the crown itself falls 2% against the rupee, you lose about 2%.');
      break;
    case 'ig': ex.push('If its yield rises 0.50% (Aurelian rates or company risk going up), ₹100 Cr loses about 6 × 0.50% = ₹3 Cr. It pays the 5-year Aurelian yield plus a credit spread every round.'); break;
    case 'hy': ex.push('It pays about 4% a year more than Aurelian government bonds. If a recession pushes its spread up 3%, ₹100 Cr loses about 4 × 3% = ₹12 Cr. Some weaker companies always fail, which costs about 0.75% a round.'); break;
    case 'equity':
      ex.push(`If you buy ₹100 Cr of ${x.name} and they rise 5%, you gain ₹5 Cr. If the ${ECONOMIES[e].currency} also falls 2% against the rupee, you lose (₹100 + ₹5) × 2% = ₹2.10 Cr of that.`);
      ex.push('Shares pay nothing beyond their price change in SPECULA.');
      break;
    case 'banks': ex.push('If bad loans in Aurelia rise by 1 point, bank shares fall about 3% from that alone. A steeper yield curve (10-year rising more than 2-year) helps them.'); break;
    case 'energy': ex.push('If oil rises 10%, Norvik Energy rises about 6% from that alone (0.6 × 10%).'); break;
    case 'fx': {
      const i = y?.i ?? ECONOMIES[e].start.i;
      ex.push(`Holding ₹100 Cr of ${ECONOMIES[e].currencyPlural} earns ${E(e)}’s ${fmtNum(i)}% rate: ₹${fmtNum(i / 4)} Cr a round. If the ${ECONOMIES[e].currency} rises 2% against the rupee you gain another ₹2 Cr; if it falls 2% you lose ₹2 Cr.`);
      if (e === 'KES') ex.push('The dinar is fixed at 50 to the crown, so while the peg holds it moves exactly with the crown.');
      if (e === 'CAL') ex.push('Calder keeps the mark inside a band around 7.50 marks per crown, so it mostly moves with the crown.');
      break;
    }
    case 'future': {
      const i = y?.i ?? ECONOMIES[e].start.i;
      const F = r2(100 - i);
      ex.push(`If the future is priced ${fmtNum(F)}, the market expects a rate of ${fmtNum(100 - F)}%. Buy ₹1,000 Cr of it and if ${E(e)} sets ${fmtNum(100 - F - 0.25)}% instead, it settles at ${fmtNum(F + 0.25)}: you gain ₹1,000 Cr × 0.25 ÷ 100 = ₹2.50 Cr. If it sets ${fmtNum(100 - F + 0.25)}%, you lose ₹2.50 Cr.`);
      ex.push('A future needs no cash, but it counts towards your 3× limit. It settles every round and rolls into the next round’s contract.');
      break;
    }
    case 'oil': case 'copper': case 'wheat': case 'gold':
      ex.push(`₹100 Cr of ${x.name.toLowerCase()} gains ₹10 Cr if its price rises 10%, and loses ₹10 Cr if it falls 10%. It pays nothing while you hold it.`);
      break;
    case 'fear': ex.push(`₹50 Cr of the Fear Index costs a fee of ${fmtNum(RULES.fearFeePct)}% a round (₹1.50 Cr). If panic sends the index from 16 to 32, its price doubles and you gain ₹50 Cr. In calm times it drifts back down and you lose.`); break;
    case 'cds': {
      const who = x.entity === 'KES' ? 'Kesh' : x.entity === 'VER' ? 'Verana' : 'an Aurelian bank';
      ex.push(`Buy ₹100 Cr of protection priced ₹8.00 (per ₹100 protected) on a spread of 2% a year: you pay ₹100 Cr × 2% ÷ 4 = ₹0.50 Cr of premium a round. If the price rises to ₹12.00 as default looks likelier, you gain ₹100 Cr × 4 ÷ 100 = ₹4 Cr. If ${who} defaults, it pays out in full: ₹100 Cr × (100 − 8) ÷ 100 = ₹92 Cr.`);
      ex.push('Protection needs no cash up front, but counts towards your 3× limit. Selling protection earns the premium — until a default.');
      break;
    }
    default: break;
  }
  return { line: KIND_TEXT[x.kind], examples: ex };
}

export const GLOSSARY = [
  ['Policy rate', 'The interest rate a central bank sets. It is what banks and borrowers in that country pay at the shortest term.'],
  ['Yield', 'The interest a bond pays each year as a percentage of its price. When yields rise, bond prices fall.'],
  ['Inflation', 'How fast prices are rising, as a percentage over a year.'],
  ['Growth', 'How fast the economy’s output is growing, at an annual rate.'],
  ['Trend growth', 'The growth an economy manages in normal times. Above it, the economy is running hot; below it, cold.'],
  ['Unemployment', 'The share of people who want a job but do not have one.'],
  ['Budget balance', 'The government’s income minus its spending, as a share of yearly output. Negative means borrowing.'],
  ['Current account', 'Roughly, a country’s exports minus its imports, as a share of output. Negative means it relies on money from abroad.'],
  ['Debt to GDP', 'What the government owes as a share of one year’s output.'],
  ['Reserves', 'Foreign money a central bank keeps to defend its currency.'],
  ['Peg', 'A fixed exchange rate. Kesh fixes 50 dinars to the crown and must spend reserves to keep it there.'],
  ['Spread (trading cost)', 'What every trade costs you: 0.10% of the amount in calm markets, more under strain.'],
  ['Credit spread', 'The extra interest a riskier borrower must pay over a safe government.'],
  ['Short selling', 'Selling something you do not own, to buy it back later. You gain if its price falls, and you pay its interest while short.'],
  ['Exposure', 'All your positions added up, buys and shorts both counted, compared with your fund value. The limit is 3×.'],
  ['Risk Used', 'An estimate of what your fund could lose in a bad round, as a share of the limit. Above 100% at the bell means forced liquidation.'],
  ['Carry', 'What holding a position earns or costs each round, apart from its price change.'],
  ['Crowd impact', 'When many funds trade the same way in one round, the price is pushed against them before it settles.'],
  ['Default', 'When a borrower fails to pay what it owes.'],
  ['Rate future', 'A bet on the next policy rate, priced as 100 minus the rate the market expects.'],
];
