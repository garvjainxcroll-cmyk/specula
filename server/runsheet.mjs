// The Event Head's run sheet (server-only; shown only in the console) and the debrief's
// "what happened and why" for each round. Written from a full run of the script; the
// numbers quoted are what the economy does before teams trade (teams cannot change the
// economy, only prices through the crowd).

const OPEN = 'When you are ready, open the window: two minutes on every screen.';

export const RUNSHEET = {
  1: { say: ['Welcome to SPECULA — Quarter 1 of 24, Round 01: Markets in Normal Times. Every fund starts with ₹1,000 Cr in cash.', 'The data has dropped. Aurelian inflation is 4.2%, just above its 4% target. Every central bank rule is on your desk — work out what Aurelia will do.', 'Your forecast this quarter: Aurelia’s policy rate in the next release. ' + OPEN], fire: null },
  2: { say: ['Quarter 2. Aurelian shoppers and wages are running hot — look at the surprise against what forecasters expected.', OPEN], fire: 'Two stages. Release stage 1 (“The Governor resigns?”) about 45 seconds in. Let the hall react for 25–30 seconds, then release stage 2 (“It was fake”) with at least 30 seconds left. Afterwards: “Check your sources — the panic sellers paid the spread twice, and spreads stay wider for the rest of the round.”' },
  3: { say: ['Quarter 3. Unemployment in Aurelia keeps falling, Verana stalls, and Norvik’s oil partners are meeting.', OPEN], fire: null },
  4: { say: ['Quarter 4, the last of Round 01. Aurelian inflation is still climbing.', OPEN], fire: 'Release “Shares plunge in minutes” about 60 seconds in. Say nothing about why. After the bell: “It was a broken trading program. Nothing in the economy changed — those who held their nerve, or bought, were paid.”' },
  5: { say: ['Round 02: Inflation and Interest Rates. Energy bills are up everywhere and inflation is rising across the world.', 'Remember: rules use this release. Higher inflation means higher rates, and higher rates mean lower bond prices.', OPEN], fire: null },
  6: { say: ['Quarter 6. Aurelian inflation is the highest in a decade.', OPEN], fire: 'Release “Strikes and a 9% pay rise” about 50 seconds in. It changes Aurelia’s rule (inflation weight doubles) for the rest of the round — tell the hall: “Read the rule change on your desk. Do the maths again.”' },
  7: { say: ['Quarter 7. Calder’s exporters are losing orders and Kesh is raising rates to keep up with Aurelia.', 'Aurelia’s emergency rule is still in force until the end of this round.', OPEN], fire: null },
  8: { say: ['Quarter 8, the last of Round 02. Verana’s inflation has reached 2%.', OPEN], fire: 'Two stages, a trap. Release stage 1 (“Verana’s bonds crack”) about 40 seconds in and let shorts pile in. With about 45 seconds left release stage 2 (“The Bank of Verana caps yields”). After the bell: “Never fight a central bank with a printing press — and notice the cap only lasts for the rest of this round.”' },
  9: { say: ['Round 03: Commodities and Trade. The Bank of Verana’s yield cap ended with Round 02 — think about what that means for Verana’s bonds today.', 'Norvik’s oil output has dipped and Sarvan’s farmers fear a dry season.', OPEN], fire: null },
  10: { say: ['Quarter 10. Tankers are queuing at Norvik’s ports.', OPEN], fire: 'Two stages. Release stage 1 (“Pipeline explosion”) about 30 seconds in — oil jumps 30%. Let funds chase it, then release stage 2 (“The Western Line”) with about 40 seconds left. After the bell: “Calder has no oil of its own — watch its growth next quarter.”' },
  11: { say: ['Quarter 11. Aurelian politicians are attacking Calder’s trade surplus.', OPEN], fire: 'Release “30% tariffs on Calder” about 50 seconds in. It widens Calder’s currency band to ±6% for the rest of the round and revises Calder’s growth down — tell the hall to read the revision.' },
  12: { say: ['Quarter 12, the last of Round 03. No rain in Sarvan’s grain belt for three months.', OPEN], fire: 'Two stages. Release stage 1 (“Harvest fails; export ban”) about 35 seconds in. Release stage 2 (“Bread riots; emergency hike”) with about 45 seconds left — it adds +3.00% to Sarvan’s rule. After the bell: “A big rate rise can hold up a currency even in a crisis.”' },
  13: { say: ['Round 04: Emerging Markets and Currencies. Look hard at Kesh’s reserves — they have fallen for nine quarters in a row.', 'Kesh’s minister says the peg is not up for discussion.', OPEN], fire: null },
  14: { say: ['Quarter 14. Kesh’s reserves are lower than at any time in ten years.', OPEN], fire: 'The biggest crisis so far, two stages. Release stage 1 (“Queues at the banks”) about 30 seconds in — the crisis multiplier rises to 1.6 and many funds will be near 100% Risk Used. Wait at least 30 seconds, then release stage 2 (“The peg breaks”) with 40+ seconds left. Say: “Check your Risk Used. Above 100% at the bell means forced liquidation.”' },
  15: { say: ['Quarter 15. Kesh is in recession after the devaluation.', 'Kesh’s emergency addition to its rule is still in force until the end of the round.', OPEN], fire: 'Release “Flight from frontier markets” about 50 seconds in.' },
  16: { say: ['Quarter 16, the last of Round 04. Kesh’s government is meeting the Concord Fund.', OPEN], fire: 'A twist: good news. Release “A ₵60 bn rescue” about 50 seconds in. After the bell: “Insurance bought at the top of the panic lost most of its value. Protection pays out only if the default actually happens.”' },
  17: { say: ['Round 05: Banking and Credit. Aurelian office prices are down a fifth and Halvard Bank has issued a profit warning.', 'Watch the bad-loans figure in Aurelia’s data.', OPEN], fire: null },
  18: { say: ['Quarter 18. Depositors are moving money out of smaller Aurelian banks.', OPEN], fire: 'Two stages; this one includes a DEFAULT. Release stage 1 (“Halvard halts withdrawals”) about 30 seconds in — crisis multiplier 1.75, trading costs triple. Release stage 2 (“Halvard defaults”) with about 45 seconds left: Aurelian Banks protection pays out in full and Aurelia’s rule gets an emergency −1.00%. Say: “Recompute Aurelia’s decision.”' },
  19: { say: ['Quarter 19. Aurelia is in recession. Aurelia’s emergency cut is still in its rule this round.', OPEN], fire: 'Release “The high-yield market shuts” about 45 seconds in. After the bell: “The central bank stepped in at settlement — those who bought at the bottom gained.”' },
  20: { say: ['Quarter 20, the last of Round 05. Verana’s banks are holding fewer of their own government’s bonds.', OPEN], fire: 'Release “Losses at Verana’s banks” about 50 seconds in.' },
  21: { say: ['Round 06: Sovereign Debt and Recovery — the final round. This round adds a decision to the desk: the Verana Bond Auction. Read its rules on the Trade tab.', 'Bid a price and an amount; highest prices are filled first and you pay what you bid. Think about who has been selling Verana’s bonds lately.', OPEN], fire: null },
  22: { say: ['Quarter 22. Ratings agencies have put Verana on watch for a downgrade.', OPEN], fire: 'Two stages, with a DEFAULT. Release stage 1 (“Downgraded to junk”) about 30 seconds in. Release stage 2 (“Verana restructures”) with about 45 seconds left: Verana’s bonds lose 30% and 20%, its protection pays out in full. Say: “Who bought big at the auction?”' },
  23: { say: ['Quarter 23. Verana’s exchange offer closes; Aurelian unemployment starts to fall.', OPEN], fire: 'A twist: the recovery. Release “A global backstop” about 45 seconds in. Everything rallies, the Fear Index collapses.' },
  24: { say: ['Quarter 24 — the final quarter. After this bell the final release marks the last forecast and the SPECULA Scores are calculated.', OPEN], fire: 'A last twist: release “Oil output cut” about 60 seconds in.' },
};

export const ROUND_SUMMARIES = [
  { n: 1, text: [
    'The world started close to balance, but Aurelia was running slightly hot: inflation at 4.2% against a 4% target, then rising past 4.8% as wages and shopping surged. Aurelia’s rule answered every quarter, taking its rate from 4.00% to 5.50%, and the funds that worked the rule out sold Aurelian rate futures and 2-year bonds before each hike.',
    'In Quarter 2 a fake post claimed the Aurelian governor had resigned. The crown and shares dropped, then snapped back when the central bank denied it. Nothing in the economy had changed — funds that panicked paid the spread twice, at wider spreads.',
    'In Quarter 4 Aurelian shares fell 8% in four minutes for no reason at all. The economy was unchanged, so the price recovered at settlement: holding your nerve, or buying, was the right call.',
  ] },
  { n: 2, text: [
    'Energy and wages pushed inflation up across the world, and Aurelia’s inflation reached 5.6%. In Quarter 6 a 9% pay deal led Aurelia’s central bank to double the inflation weight in its rule, and its rate jumped from 5.75% to 7.00%, then 7.25%. Aurelian 10-year bonds lost money every quarter until the peak.',
    'Because the other central banks watch Aurelia — Calder, Verana and Norvik all have Aurelia’s rate in their rules, and Kesh’s rule is built on it — rates rose almost everywhere. Kesh had to follow Aurelia up even as its own growth slowed: the price of a peg.',
    'In Quarter 8 Verana’s bonds crashed — and then the Bank of Verana capped the 10-year yield at 3.00%. Funds that had shorted Verana’s bonds were crushed; the florin fell 7% because the bank was printing money. The cap lasted only for the rest of the round: when it ended, Verana’s 10-year yield rose to about 4% in Quarter 9 and the bonds fell 7%, exactly as a careful reader of the rule would have expected.',
  ] },
  { n: 3, text: [
    'Commodities took over. In Quarter 10 a pipeline explosion cut Norvik’s oil output almost in half and oil jumped 30% in minutes; when the Western Line reopened, half of that was given back. Funds that chased the spike lost; Calder, which has no oil of its own, saw its shares fall.',
    'In Quarter 11 Aurelia put 30% tariffs on Calder. Calder’s growth was revised down by 1.2 points, its shares fell about 15% and copper fell 10%, because Calder buys half the world’s copper. Calder widened its currency band to let the mark weaken.',
    'In Quarter 12 Sarvan’s harvest failed and it banned wheat exports: wheat rose more than 30%, Sarvan’s inflation shot up, and Sarvan’s emergency +3.00% rate rise actually lifted the ora at settlement. A large enough rate rise can hold up a currency even in a crisis.',
  ] },
  { n: 4, text: [
    'Kesh’s reserves had been falling since Round 01: from ₵145 bn to ₵48 bn by Quarter 14, as Aurelian rates rose and money left. Its default protection kept rising as a warning. In Quarter 14 there was a run on the dinar: reserves were revised down by ₵30 bn, Kesh added an emergency 3% and then 5% to its rule — and then abandoned the peg. The dinar fell by about 30%, Kesh’s bonds and shares lost about half their rupee value, and the crisis multiplier pushed many funds into forced liquidation.',
    'Kesh borrows in crowns, so the devaluation made its debts much bigger: growth collapsed to −2.3% and inflation jumped to 9.2% as import prices rose. Sarvan, which trades with Kesh, was hit in Quarter 15 as investors fled frontier markets.',
    'In Quarter 16 the Concord Fund lent Kesh ₵60 bn. Kesh never defaulted, so its default protection paid nothing and lost a third of its value; Kesh’s bonds and shares rallied more than 40%. Insurance bought at the top of the panic is expensive insurance.',
  ] },
  { n: 5, text: [
    'Aurelian bad loans climbed from 2.8% to 6% as office prices fell and growth slowed — the warning was in the data from Quarter 13 onwards. In Quarter 18 Halvard Bank stopped withdrawals and then defaulted on its bonds. Aurelian bank shares lost about 44%, the Fear Index jumped by about 60%, and Aurelian Banks default protection paid out in full.',
    'Aurelia’s central bank added an emergency −1.00% to its rule and its rate fell from 3.50% to 2.25% and then 1.50%; Aurelian government bonds rallied as money ran for safety. In Quarter 19 the high-yield market froze, until the central bank opened an emergency lending window at settlement.',
    'Aurelia’s losses spread to Verana, whose banks held Aurelian loans. In Quarter 20 Verana’s banks began selling their own government’s bonds: the one thing that had kept Verana’s huge debt safe was ending. Verana’s 10-year bonds fell 14% and its default protection more than doubled.',
  ] },
  { n: 6, text: [
    'In Quarter 21 Verana had to sell ₹3,000 Cr of new 10-year bonds at auction, with its own banks still selling. Funds that bid high won the bonds — and kept them into the next quarter.',
    'In Quarter 22 Verana’s next bond sale failed, it was downgraded to junk, and then it restructured its debt: holders of its 10-year bonds lost 30% and its 2-year bonds 20%, and Verana default protection paid out in full. Including the rise in yields, Verana’s 10-year bond lost more than 40% of its value in one quarter.',
    'In Quarter 23 Aurelia, Calder and the Concord Fund agreed a global backstop. Everything rallied at once — shares 10–20%, Verana’s bonds 19% — and the Fear Index collapsed by 43%. In the final quarter Norvik cut oil output and oil rose 16%.',
    'The funds that ranked highest read the data before the window closed, worked out the central bank rules, kept Risk Used inside the limit through every crisis, and did not chase the first headline.',
  ] },
];

export function runsheetStrings() {
  return [...Object.values(RUNSHEET).flatMap((r) => [...r.say, r.fire || '']), ...ROUND_SUMMARIES.flatMap((r) => r.text)].filter((s) => s.length > 40);
}
