// The Event Head's run sheet (server-only; shown only in the console) and the debrief's
// "what happened and why" for each round. Six rounds, one ten-minute window each.
// Every crisis is optional: the Event Head decides which to release, and when.
// Times are given as the clock shows them (it counts down from 10:00).
// The numbers quoted are what the economy does before teams trade (teams cannot change
// the economy, only prices through the crowd), from a full run with every crisis released.

const OPEN = 'When you are ready, open the window: ten minutes on every screen.';

export const RUNSHEET = {
  1: {
    say: [
      'Welcome to SPECULA — Round 01 of 06: Markets in Normal Times. Every fund starts with ₹1,000 Cr in cash. There is no leaderboard: you will see only your own fund until the very end.',
      'The data has dropped. Aurelian inflation is 4.2%, just above its 4% target. Every central bank rule is on your desk — work out what Aurelia will do at the bell.',
      'Your forecast this round: Aurelia’s policy rate in the next release. ' + OPEN,
    ],
    plan: 'A gentle start. Let the first three or four minutes be quiet so teams learn the desk. Suggested: the Governor hoax at about 6:30, its denial at about 5:00, the crash at about 3:00 — or skip the crash if the room is struggling.',
    crises: {
      hoax: 'Stage 1 (“The Governor resigns?”) — let the hall react for 60–90 seconds, then release stage 2 (“It was fake”). If you never release stage 2, the panic stands until the bell: kinder to the hasty, harsher on those who held. Afterwards: “Check your sources — the panic sellers paid the spread twice.”',
      crash: 'Release it with at least two minutes left and say nothing about why. After the bell: “It was a broken trading program. Nothing in the economy changed — those who held their nerve, or bought, were paid.”',
    },
  },
  2: {
    say: [
      'Round 02: Inflation and Interest Rates. Energy bills are up everywhere and Aurelian inflation is the highest in a decade: 5.7% in this release.',
      'Remember: the rules use this release. Higher inflation means higher rates, and higher rates mean lower bond prices.',
      OPEN,
    ],
    plan: 'The rate-shock round. Suggested: the Wage Spiral at about 7:00 (it doubles Aurelia’s inflation weight, so Aurelia jumps from 4.25% to 6.25% at the bell instead of 4.50%), then Verana’s bonds crack at about 4:30 and the yield cap at about 2:30.',
    crises: {
      spiral: 'Release with plenty of time left: teams must redo the Aurelia sum. Tell the hall: “Read the rule change on your desk. Do the maths again.”',
      cap: 'A trap, two stages. Release stage 1 (“Verana’s bonds crack”) and let shorts pile in for two minutes or more; then stage 2 (“The Bank of Verana caps yields”). Say afterwards: “The cap holds Verana’s 10-year yield at 3% — but printing money costs the currency: the florin falls about 6%. In rupees you feel both.” The cap lasts only for this round.',
    },
  },
  3: {
    say: [
      'Round 03: Commodities and Trade. Norvik’s oil output has dipped, Aurelian politicians are attacking Calder’s surplus, and Sarvan has had no rain for three months.',
      'Calder has no oil of its own. Sarvan’s inflation is 8.3%. ' + OPEN,
    ],
    plan: 'Three crises are available — the busiest round. Suggested: the pipeline explosion at about 8:00 and the reroute at about 6:30; the tariffs at about 5:00; the failed harvest at about 3:30 and the bread riots at about 2:00. For a calmer room, choose two of the three.',
    crises: {
      pipeline: 'Stage 1 (“Pipeline explosion”) — oil jumps. Let funds chase it, then release stage 2 (“The Western Line”) a minute or two later. After the bell: “Calder has no oil of its own — watch its growth next round.”',
      tariff: 'It widens Calder’s currency band to ±6% for the rest of the round and revises Calder’s growth down — tell the hall to read the revision.',
      fields: 'Stage 2 (“Bread riots”) adds +3.00% to Sarvan’s rule: Sarvan’s rate goes from 11% to 13% at the bell. After the bell: “A big rate rise can hold up a currency even in a crisis.”',
    },
  },
  4: {
    say: [
      'Round 04: Emerging Markets and Currencies. Look hard at Kesh’s reserves: 140 at the start of the game, 61 in this release.',
      'Kesh’s finance minister says the peg is not up for discussion. Your forecast: Kesh’s inflation. ' + OPEN,
    ],
    plan: 'The biggest crisis of the game. Suggested: the bank queues at about 8:00, the peg breaks at about 6:30 (the dinar falls from 50 to about 73 to the crown), contagion at about 4:30, and the Concord rescue at about 2:30 as a twist. The rescue can only follow the run on the dinar.',
    crises: {
      dinar: 'Stage 1 (“Queues at the banks”) raises the crisis multiplier to 1.6, so many funds will be near 100% Risk Used. Wait at least a minute, then release stage 2 (“The peg breaks”). Say: “Check your Risk Used. Above 100% at the bell means forced liquidation.”',
      contagion: 'Release after the peg breaks for the full story; on its own it is a frontier-market scare.',
      concord: 'Good news, and a trap for anyone who bought protection at the top. After the bell: “Insurance bought at the top of the panic lost most of its value. Protection pays out only if a default actually happens.”',
    },
  },
  5: {
    say: [
      'Round 05: Banking and Credit. Aurelian office prices are down a fifth, Halvard Bank has issued a profit warning, and Aurelia’s growth is negative: −0.9%.',
      'Watch the bad-loans figure in Aurelia’s data. ' + OPEN,
    ],
    plan: 'Contains a DEFAULT. Suggested: Halvard halts withdrawals at about 8:00 and defaults at about 6:00; the high-yield market shuts at about 4:30; Verana’s banks crack at about 2:30. With every crisis released Aurelia cuts from 6.75% to 4.75% at the bell.',
    crises: {
      halvard: 'Stage 1 (“Halvard halts withdrawals”): crisis multiplier 1.75, trading costs up sharply. Stage 2 (“Halvard defaults”): Aurelian Banks protection pays out in full and Aurelia’s rule gets an emergency −1.00%. Say: “Recompute Aurelia’s decision.”',
      freeze: 'After the bell: “The central bank stepped in at settlement — those who bought at the bottom gained.”',
      verbanks: 'Sets up Round 06: Verana’s banks start selling their own government’s bonds.',
    },
  },
  6: {
    say: [
      'Round 06: Sovereign Debt and Recovery — the final round. It adds a decision to the desk: the Verana Bond Auction. Read its rules on the Trade tab.',
      'Bid a price and an amount; the highest prices are filled first and you pay what you bid. Think about who has been selling Verana’s bonds lately.',
      OPEN,
    ],
    plan: 'Contains a DEFAULT. Bids settle at the bell, after any crisis. Suggested: the downgrade at about 7:30, the restructuring at about 5:30, the global backstop at about 3:30 (it can only follow the downgrade), and the oil cut at about 2:00 as a last twist.',
    crises: {
      reckoning: 'Stage 2 (“Verana restructures”): Verana’s bonds lose 30% and 20% and its protection pays out in full. Say: “Who is bidding big at the auction now?”',
      bargain: 'The recovery: everything rallies and the Fear Index collapses.',
      lastbell: 'A last twist for oil.',
    },
  },
};

export const ROUND_SUMMARIES = [
  { n: 1, text: [
    'The world started close to balance, but Aurelia was running slightly hot: inflation at 4.2% against a 4% target. Aurelia’s rule answered at the bell, taking its rate from 4.00% to 4.25%, and the funds that worked the rule out sold Aurelian rate futures before the hike.',
    'If you released the Governor hoax: the crown and shares dropped on a fake post, then snapped back when the central bank denied it. Nothing in the economy had changed — funds that panicked paid the spread twice.',
    'If you released the crash: Aurelian shares fell in minutes for no reason at all. The economy was unchanged, so the price recovered at settlement.',
  ] },
  { n: 2, text: [
    'Energy prices pushed inflation up everywhere: Aurelia’s reached 5.7%. Aurelia’s rule alone called for 4.50%. Aurelian bonds fell — the 10-year lost about 8% over the round.',
    'If you released the Wage Spiral, Aurelia’s inflation weight doubled and the rate jumped to 6.25% at the bell. Aurelian rate futures fell as the expected rate rose; those who redid the sum on the new rule sold in time.',
    'If you released the Florin Cap: Verana’s 10-year bonds fell about 9% as yields leapt, then the Bank of Verana capped the yield at 3% with unlimited buying. The bonds recovered in florins, but the printing sank the florin about 6% — in rupees, a bond holder felt both. A currency is part of every foreign trade.',
  ] },
  { n: 3, text: [
    'Commodities ruled the round. Oil, wheat and Calder’s trade all moved on news rather than on the rules.',
    'The pipeline explosion lifted oil and Norvik’s krone and hurt Calder, which has no oil of its own; the reroute took back much of the move. The tariffs hit Calder’s growth and widened its currency band. The failed harvest lifted wheat; the bread riots forced Sarvan to add 3.00% to its rule, taking its rate from 11% to 13% — enough to steady the ora.',
  ] },
  { n: 4, text: [
    'Kesh’s reserves fell from 140 at the start to 61 by this release, while Kesh held its peg at 50 dinars to the crown. A peg needs reserves to defend it.',
    'If you released the run on the dinar: Kesh raised rates in an emergency, then abandoned the peg. The dinar sank to about 73 to the crown, a fall of about a third, and Kesh’s inflation jumped. Funds without Kesh exposure, or with protection, were safe; leveraged holders of Kesh assets were forced to sell at the bell.',
    'The Concord rescue then cut Kesh’s emergency addition to +1.00%. Protection bought at the top of the panic lost much of its value: insurance only pays if the default actually happens.',
  ] },
  { n: 5, text: [
    'Aurelia slid into recession: growth −0.9% and bad loans rising. Its rule called for a cut.',
    'If you released Halvard: the bank halted withdrawals and then defaulted. Aurelian Banks protection paid out in full, and Aurelia’s emergency −1.00% took its rate from 6.75% to 4.75%. Aurelian Banks shares lost about half their value over the round.',
    'The credit freeze and Verana’s bank losses set up the last round: Verana’s banks began selling their own government’s bonds.',
  ] },
  { n: 6, text: [
    'Verana had to borrow ₹3,000 Cr at auction while its own banks were selling its bonds. Bidders who paid above the settlement price lost money the moment the bonds were delivered.',
    'If you released the Reckoning: Verana was downgraded and then restructured its debt — 30% off its 10-year bonds and 20% off its 2-year bonds — and Verana protection paid out in full. The Grand Bargain then guaranteed Verana’s new bonds and markets rallied.',
    'The SPECULA Score rewarded the funds that read the rules, kept their swings small and were never forced to sell — not the ones that made the biggest single bet.',
  ] },
];

/** Every piece of text that must never appear in the public website. */
export function runsheetStrings() {
  return [
    ...Object.values(RUNSHEET).flatMap((r) => [...r.say, r.plan || '', ...Object.values(r.crises || {})]),
    ...ROUND_SUMMARIES.flatMap((r) => r.text),
  ].filter((s) => s.length > 40);
}
