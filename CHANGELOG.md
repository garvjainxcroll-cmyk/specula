# CHANGELOG — every rule and coefficient decision, with the reason

The printed guide is a promise to players. Where the guide gives a number or a rule, the code follows it exactly (`tests/guide.test.mjs` pins every one). Where the guide is silent or needed interpreting, the decision is recorded here. **Items marked ⚑ are interpretations you may want to confirm before the event.**

## 2.1.0 — capital, loans and compulsory trading notes (17 October 2026)

**Requested by the Event Head.** Nothing printed in the guide changes; these are additions (the guide should mention them when it is reprinted).

- **The Event Head controls each fund’s capital.** Before the game: a starting capital per fund (₹1,000 Cr unless changed). During the game: add or remove capital at any time except while a round settles, with a reason the fund sees. ⚑ **Capital is not profit**: the score now uses a *time-weighted* return — each round’s return is measured on the money in the fund at the start of that round (last fund value + capital added for the round), and the rounds are multiplied together. With no capital changes this gives exactly the same numbers as before (the hand check and balance are unchanged). The guide’s “a fund below ₹1,000 Cr scores zero” is read as “a fund that has lost money overall”.
- **Loans.** A fund can ask the Event Head for a loan from its desk (amount and reason); the Event Head approves (choosing the amount and the yearly rate; 8% is suggested), declines with a reply, or lends without a request. ⚑ A loan adds cash and an equal debt, so fund value does not change. It costs principal × rate ÷ 4 every round (a new *Loan interest* line in the profit and loss), adds room under the 3× limit (now 3 × (fund value + loans)), and does **not** loosen Risk Used, which is still measured on the fund’s own value. Unused borrowed cash still earns the cash rate. The fund or the Event Head can repay at any time except while settling.
- **Trading notes are compulsory.** Every order (buy, sell or close) needs a written reason of at least a few words; the server refuses an order without one. A new *Trading notes* section on the desk’s Trade tab keeps them round by round. Notes are private to the fund and the Event Head (console → **Notes**). They do not change any number or score — the guide promises no judging.
- Privacy is unchanged: no public document holds a fund’s capital, loans, loan requests or notes (`tests/api.test.mjs`).
- The server now saves the game under a new, uniquely named copy each time it changes, so two changes at the same moment (for example a fund repaying a loan while the Event Head releases a crisis) can never overwrite each other.

## 2.0.0 — six rounds, crisis control, sealed results (13 October 2026)

**Requested by the Event Head. These three changes depart from the printed guide on purpose; the guide (`reference/SPECULA_Guide.pdf`) must be reprinted to match** — see “Guide pages that no longer match” below.

### What changed
- **Six rounds, one ten-minute window each — no quarters inside rounds.** The 24 old quarters were merged four into one: each round’s hidden news is the sum of its four quarters’ news, its headlines were rewritten, and its crises are all of that round’s crises. Each round is one step of the model and stands for three months of the economy (interest, carry and fees per round are a quarter of the yearly rate, as before). The window is 10:00 by default; the Event Head can choose 1–15 minutes and add +30 s or +2 min.
- **Six forecasts** (one a round): up to 60 points, scaled to 25 in the SPECULA Score as before. Round forecasts: Aurelia’s policy rate, Aurelia’s inflation, Calder’s growth, Kesh’s inflation, Aurelia’s policy rate, Verana’s growth.
- **Crisis control is the Event Head’s.** Every crisis is optional: any, all or none, in any order, whenever the Event Head likes. A round no longer refuses to settle while a crisis is unreleased. Two dependencies are kept so the story makes sense: the Concord Rescue follows the Run on the Dinar, and the Grand Bargain follows the Reckoning. Stage 2 still follows stage 1.
- **Results are sealed.** No public document — and so no desk and no Big Screen — holds another fund’s value, profit, forecast marks, auction bid or standing. The desk’s Score tab became **My score**: the fund’s own return beyond cash, swing, deepest fall, risk-adjusted return, forecast points and forced liquidations, with the working. The Event Head’s console keeps live standings, every fund’s history and every auction bid, marked “only you can see this”. After Round 06: **Publish the final release** (scores stay sealed), then **Reveal the results**: the Big Screen reveals the standings from last place to first, and each desk shows its own score and place.
- The public auction result now gives only what a central bank would publish: the cut-off price, the amount sold, how many times the sale was covered and how many funds bid.
- Practice mode: still two short rounds, and its final screen shows only your own score and place.

### Re-tuning and checks
- No coefficient needed to change. Merging four quarters’ news into one round makes each data drop a bigger surprise (Aurelia’s inflation is 5.7% against 4.3% expected in Round 02), which rewards reading the data even more.
- Kesh’s reserves still fall visibly before Round 04: 140 at the start, 129, 96, then 61 in Round 04’s release (79 if no crisis was released). With no crisis at all the peg holds all game.
- Balance (docs/08_BALANCE.md), 20 games each, with all, some or none of the crises released: a skilled fund (reader, cautious reader or model economist) wins every game in every mode; the reckless gambler finishes last or second-last, and its worst fund fell to ₹47 Cr.
- The hand check now recomputes Rounds 01, 04 and 06 (every crisis released) and matches to the paisa.

### Guide pages that no longer match (reprint before the event)
- **Page 01** — the stats (“4 quarters in every round”, “2 min trading window each quarter”, “24 forecasts, one a quarter”) and “A Quarter” steps (“a two-minute clock”, “fund values and standings appear on every screen”): now six rounds, one ten-minute window each, six forecasts, and each desk sees only its own results.
- **Pages 03 and 04** — “every quarter” for futures, fees, premiums, carry, crowd impact and Risk Used: read “every round” (each round stands for three months).
- **Page 05** — “every quarter the desk names one figure”; “twenty-four forecasts, up to 240 points”: now one a round, six forecasts, up to 60 points.
- **Page 06** — the round cards (“four quarters · about 10 minutes”), “calculated after the last quarter of Round 06”, “from all 24 quarters”, “after every quarter your screen shows … your standing”, “positions stay open from quarter to quarter”: now one ten-minute window per round, scores after Round 06, revealed by the Event Head at the end, and no standings during the game.
- Crises: the guide already says the Event Head may release a crisis at any moment; now every crisis is also optional.

## 1.0.0 — first complete build (12 October 2026)

### Interpretations of the guide
- ⚑ **Risk-adjusted return measures the return earned beyond the rupee cash rate.** The guide says “your fund’s total return divided by how much its value swung”. Taken literally, a fund that never trades earns the 6% cash rate with almost no swing, divides by nearly zero and comes first. That breaks the guide’s other promise (“rewards a fund that read the economy well over one that gambled and got lucky”). So the return counted is *total return − what cash alone would have earned*. A fund that ends below ₹1,000 Cr still scores zero here, as the guide says. The swing is the standard deviation of quarterly returns, and at least 1.00% is used so that tiny swings cannot be divided by.
- ⚑ **The penalty for the deepest fall** is 0.10 for every 1% of fall (see the balance changes below).
- ⚑ **Forecast points** are 10 − 10 × |error|: one point lost for every 0.1 percentage point, in proportion (0.15 off scores 8.5), never below zero.
- **The data drop does not move prices.** Prices move when a crisis breaks (“prices react at once”) and at settlement (“prices reset”). This is what makes reading the data in the two-minute window pay.
- **Orders execute immediately** at the current price, and each pays the spread. Positions held when a crisis breaks take the crisis move; orders placed afterwards use the new prices. An order sent at prices that have just been moved by a crisis is refused with a request to look again.
- **Crowd impact** (“its price is pushed up before it settles”) is charged at settlement: each fund pays −(its net trade) × (1% × all funds’ net flow ÷ market depth, at most 3%). Buying with the crowd costs; trading against it earns.
- **Rate futures** are priced at the data drop from what forecasters expected (the rule applied to the expected figures), and need no cash. Default protection needs no cash either; its price per ₹100 protected is 100 × (1 − e^(−4 × spread ÷ 100)), and it pays 100 on a default.
- **Funding**: unused cash = fund value − money in long positions. It earns 6.00% a year; if negative, it costs 7.00% (6% + 1%, as the guide says). Short-sale proceeds do not earn interest, which stops a free “short everything, earn cash” trade.
- **Risk Used**: size × 2 × typical quarterly move per position; families net offsetting positions; families combine by square root of sum of squares; × crisis multiplier; ÷ 15% of fund value.
- **Forced liquidation**, “closes your largest positions”: the largest by size first, skipping any whose closing would not lower risk (a hedge). The last one is closed only as far as needed to land on 80%.
- **Starting unemployment, budget balance, current account and the economy-specific figures** are not printed in the guide, so the model chose them (MODEL_EXPLAINED.md §2).
- **The rupee**: the cash rate is fixed at 6.00% a year. Rupee inflation is 5% (it sets how currencies drift).
- **“Some rounds add a decision to the desk”**: Round 06 adds the Verana Bond Auction in Q21. Its rules appear on the desk when the round opens.
- **Crises are released by the Event Head** during their scripted quarter. A quarter cannot settle until its crisis is released. If one is released after the bell, the desk reopens for 30 seconds so that teams can react (“the desk stays open through it”).
- **Fund codes** are 6 characters (no easily confused letters). Members sign in with the code and a name; any member’s trade is the fund’s trade.

### Coefficient changes made during the balance pass (docs/08_BALANCE.md)
| Change | Before → after | Why |
|---|---|---|
| Risk budget (Risk Used 100%) | 12% → **15%** of fund value | A plain, diversified 1× position in shares was being force-liquidated in calm markets. |
| Family netting inside Risk Used | ½·net + ½·sum → **½·net + ½·√(sum of squares)** | Same reason: positions in one family (e.g. six share indices) were treated as perfectly identical. |
| Deepest-fall penalty | 0.25 → **0.10** per 1% | With 0.25, a fund that ended ₹200 Cr above cash scored zero after one 16% fall. The ranking did not change: readers still won every game. |
| Kesh reserves | inflows 4, current account ×1.5, fear ×2, rate gap ×4 vs 5 → **5, ×1.0, ×1.5, ×2 vs 4** | Reserves ran out by Q13, before the planned crisis. They now fall steadily from ₵145 bn to ₵48 bn by Q14: a visible warning for careful readers. |
| Bank default-risk “fair” level | from 1.5% bad loans → **from 2.0%** | Bank protection drifted up every calm quarter for no reason. |
| Kesh crisis credit jumps | +1.5 / +2.5 → **+1.0 / +1.5** | The peg break was already brutal; the extra jump made Kesh shares fall 56%. Now about half. |
| Rounding nudge | fixed 1e-9 → **8 × machine epsilon, relative** | Found by the hand check: on very large prices (copper at ₹7.8 lakh) the old nudge could move the 6th decimal and leave a 1-paisa difference. |

### Things deliberately not done
- There are no manual score deductions: the guide says nothing is judged.
- Prices never react to the data drop by themselves, even when the data is a big surprise.
