# SPECULA — the model, explained simply

This document explains every calculation in SPECULA so that you, the Event Head, can answer any question from a participant or a teacher. Nothing in here is secret except where it says so; the secret part is only *what happens* (the script), never *how the simulation works*.

The order follows a round: the data drops, the ten-minute window opens, crises may break (only those the Event Head chooses to release), the bell rings, central banks act and prices reset, results. **The game has six rounds, and each round is one step of the model, standing for three months of the economy**: interest, carry and fees for a round are a quarter of their yearly rate.

---

## 1. Numbers and rounding (why every sum checks on a calculator)

- **Money** is kept in whole paise (₹1 = 100 paise; ₹1 Cr = 1,00,00,00,000 paise). Every multiplication of money is done exactly, then rounded half away from zero to the nearest paisa. That is why the desk can show every profit and loss line as a sum that you can check, and why the hand check (`HAND_CHECK.md`) matches to the paisa.
- **Rates, growth and inflation** are percentages. Each published figure is built from terms that are each rounded to two decimals; the terms are added and the total is rounded to one decimal (growth, inflation, unemployment, budget, current account, debt) or two decimals (rates and yields).
- **Policy rates** are rounded to the nearest 0.25%, halves going up (4.375 → 4.50).

---

## 2. The six economies

Starting figures are exactly page 02 of the guide.

| Economy | Nickname · currency | Growth (= trend) | Inflation | Target | Policy rate | Debt/GDP | Unemployment | Budget | Current account |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Aurelia | The Anchor · crown | 2.0 | 4.2 | 4 | 4.00 | 90 | 4.5 | −4.0 | −2.5 |
| Calder | The Workshop · mark | 5.5 | 2.0 | 3 | 3.00 | 60 | 4.0 | +1.0 | +6.0 |
| Verana | The Debtor · florin | 0.8 | 1.2 | 2 | 1.00 | 155 | 7.5 | −3.5 | +1.0 |
| Kesh | The Riser · dinar | 6.5 | 7.0 | 5 | 9.00 | 55 | 6.5 | −3.0 | −4.0 |
| Norvik | The Well · krone | 2.5 | 3.0 | 3 | 3.50 | 30 | 3.5 | +6.0 | +8.0 |
| Sarvan | The Granary · ora | 4.0 | 9.0 | 6 | 11.00 | 70 | 9.0 | −4.5 | −3.5 |

(Unemployment, budget and current account are not in the guide, so the model chose sensible values.)

**Figures particular to each economy** (shown in every release): Aurelia’s *bank bad loans* (2.0%); Calder’s *marks per crown* (7.50, kept in a ±2% band) and *reserves* (₵3,200 bn); Verana’s *share of government bonds held by its own banks* (72%); Kesh’s *reserves* (₵140 bn) and the *peg* (50 dinars per crown); Norvik’s *oil output* (4.0 m barrels a day) and *wealth fund*; Sarvan’s *harvest* and *copper output* (index, 100 = normal).

**Exchange rates** (rupees per unit at the start): crown ₹84.00, mark ₹11.20 (= 84 ÷ 7.50), florin ₹0.62, dinar ₹1.68 (= 84 ÷ 50), krone ₹8.40, ora ₹0.40.

---

## 3. The data drop — how each figure is made

At the start of every round (from Round 02) each economy’s figures are worked out from last round’s figures, the policy rate just set, last round’s market moves, and that round’s *news* (the script). The desk shows every term: tap any figure.

**Growth** = trend + momentum − cost of borrowing + world demand + commodity effects + news

- momentum = 0.6 × (last growth − trend) (Verana 0.7, Sarvan 0.5)
- cost of borrowing = 0.25 × (policy rate − last inflation − neutral real rate)  (0.15–0.25 by economy)
- world demand = 0.05–0.30 × the world’s growth gap (Calder, the exporter, 0.30)
- oil: importers lose (Aurelia −0.02 per 1% rise in oil, Calder −0.03, Kesh −0.02), Norvik gains (+0.05)
- Calder also gains when the mark weakens (+0.05 per 1%); Kesh loses when the dinar weakens against the crown (−0.08 per 1%, because it borrows in crowns); Norvik gains 2.0 per million barrels of extra output; Sarvan gains 0.03 per harvest point and 0.04 per 1% rise in copper.

**Inflation** = 0.7 × last inflation + 0.3 × target + 0.25 × (growth − trend) + oil, food and currency effects + news

- oil 0.02–0.04 per 1%; food (wheat) 0.01 (0.08 in Sarvan, 0.04 in Kesh); a weaker currency 0.02–0.15 per 1% (Kesh 0.15, Sarvan 0.12).

**Unemployment** = last + 0.1 × (normal − last) − 0.15 × (growth − trend) + news.  **Budget**, **current account** and **debt** follow similar simple rules (debt grows with interest minus nominal growth, minus the budget balance).

**Expected figures.** Beside growth and inflation the release shows what forecasters expected: the same calculation *without* this round’s news. The difference is the **surprise**, and surprises move prices at settlement.

---

## 4. Central bank rules (printed on every desk)

At settlement each central bank works out a **target** from this release, then moves halfway (or less) towards it and rounds to 0.25%.

| Economy | Target rate | Smoothing |
|---|---|---|
| Aurelia | 0.25 + inflation + 0.5 × (inflation − 4.00) + 0.5 × (growth − 2.00) | 0.5 × last + 0.5 × target |
| Calder | 1.50 + inflation + 0.5 × (inflation − 3.00) + 0.25 × (growth − 5.50) + 0.5 × (Aurelia’s new rate − 4.00) | 0.6 × last + 0.4 × target |
| Verana | 0.50 + inflation + 0.5 × (inflation − 2.00) + 0.5 × (growth − 0.80) + 0.25 × (Aurelia’s rate − 4.00) | 0.7 × last + 0.3 × target |
| Kesh | Aurelia’s rate + 4.00 + 0.5 × (inflation − 5.00) + 0.5 × (growth − 6.50) + 0.05 × max(0, 120 − reserves) | 0.5 × last + 0.5 × target |
| Norvik | 0.75 + inflation + 0.5 × (inflation − 3.00) + 0.25 × (growth − 2.50) + 0.25 × (Aurelia’s rate − 4.00) | 0.6 × last + 0.4 × target |
| Sarvan | 0.50 + inflation + 0.5 × (inflation − 6.00) + 0.25 × (growth − 4.00) | 0.5 × last + 0.5 × target |

Aurelia decides first; the others “watch Aurelia’s” new rate. Kesh’s rule is built on Aurelia’s rate because of the peg: it cannot cut while Aurelia is high, and it must raise its rate as reserves fall. Rates never go below zero.

**Worked example (the one in the brief):** inflation 4.60%, growth 1.20% (0.80 below trend), last rate 4.00%:
Target = 0.25 + 4.60 + 0.5 × (4.60 − 4.00) + 0.5 × (−0.80) = 4.75. Smoothed: 0.5 × 4.00 + 0.5 × 4.75 = 4.375. Rounded: **4.50%**.

**Crises can change a rule for the rest of the round**: a different inflation weight (Aurelia, Round 02), an emergency addition (Sarvan +3.00%, Kesh +3/+5/+1%, Aurelia −1.00%), a cap on the 10-year yield (Verana 3.00%, Round 02), a wider currency band (Calder ±6%, Round 03). The desk shows the change while it is in force.

---

## 5. Prices — when and why they move

Prices move **only** when a crisis breaks (at once) and at **settlement**. The data drop does not move prices, which is why reading the data in the ten-minute window pays.

### Yields (each economy)
- **2-year yield** = 0.5 × policy rate + 0.5 × the rule’s target + term premium + 0.5 × credit risk
- **10-year yield** = 0.3 × policy rate + 0.7 × long-run rate + term premium + credit risk, where long-run rate = neutral real rate + target + 0.4 × (inflation − target)
- **Credit risk** drifts 30% of the way each round towards a “fair” level that rises with debt above normal, with fear, with Verana’s banks selling its bonds, with Kesh’s reserves falling below ₵120 bn, after a broken peg and after a default.

### Price moves at settlement (in each instrument’s own currency)
| Instrument | Price change |
|---|---|
| 2-year bond | −1.9 × change in its yield |
| 10-year bond | −8.0 × change in its yield (₹100 Cr loses about ₹4 Cr if the yield rises 0.5%) |
| Aurelia inflation-linked 10Y | −8.5 × change in the real yield, plus inflation ÷ 4 added to the price |
| Kesh Crown Bond 5Y | −4.5 × change in (Aurelian 5-year yield + Kesh spread) |
| Investment grade / high yield | −6.0 / −4.0 × change in yield; high yield also −0.75% a round for defaults |
| Share index | normal profit growth + 1.5 × growth surprise − 2.5 × change in 10-year yield − 0.4 × beta × change in the Fear Index + oil/copper effects + news |
| Aurelian Banks | Aurelian profit growth + 1.2 × the rest of Aurelia’s market move + 3.0 × steeper yield curve − 3.0 × rise in bad loans + news |
| Norvik Energy | Norvik profit growth + 0.5 × the rest of Norvik’s market move + 0.6 × oil move + news |
| Currencies (₹ per unit) | −(inflation − 5%) ÷ 4 + 2.0 × change in its policy rate + safe-haven / oil / commodity / credit effects + news |
| Mark | follows the crown, moving only inside Calder’s band; Calder spends ₵60 bn of reserves for each 1% it holds back |
| Dinar | exactly the crown ÷ 50 while the peg holds; floats after it breaks |
| Oil | 1.0 + 4.0 × world growth surprise − 10 × change in Norvik output + supply news |
| Copper | 1.0 + 3.0 × Calder growth surprise + 1.5 × world surprise − 0.3 × Sarvan copper output change + news |
| Wheat | 1.0 − 0.5 × harvest change + 0.15 × oil move + news |
| Gold | 1.0 + 0.3 × change in the Fear Index − 3.0 × change in Aurelia’s real yield + 0.5 × Aurelian inflation surprise + news |
| Fear Index | level = 16 + half of last round’s gap from 16 − 3 × world growth surprise + news (never below 10) |
| Rate future | settles at 100 − the new policy rate |
| Default protection | price per ₹100 protected = 100 × (1 − e^(−4 × spread ÷ 100)); pays 100 on a default |

**Rupee price** of a foreign instrument = its local price × the exchange rate. The P&L splits the two: *price change* (in its own currency) and *currency effect*.

**Rate futures** are priced, at the data drop, at 100 minus the rate the market expects: the rule applied to the *expected* figures (forecasters’ consensus). If the data surprises, the actual decision differs, and a team that worked out the rule knows it before the market does.

### Crises
Every crisis is **the Event Head’s choice**: each round has two to four available, and the Event Head may release any, all or none of them, in any order and at any moment of the window. The only rules: a second stage follows its first, and two crises follow another (the Concord Rescue follows the Run on the Dinar; the Grand Bargain follows the Reckoning). The round settles with whatever was released. A crisis that is never released never happens: with no crisis at all, Kesh’s peg holds for the whole game.

A crisis stage moves prices **at once**, mid-window: it changes the Fear Index, credit risk, term premiums and credit spreads (and so every yield), gives an immediate jump to shares, currencies and commodities, may revise the data (a central bank then uses the revised figure), may change a rule, raise trading costs and the crisis multiplier for the rest of the round, break the Kesh peg, or cause a **default** (default protection pays out in full at 100 and closes; the defaulter’s bonds take a haircut).

---

## 6. Trading and accounting

- **Orders execute immediately** at the current price. Each costs the spread on its size: 0.10% in calm markets (0.40% in Sarvan), more under strain (crises multiply it for the rest of the round).
- **3× limit**: all positions together, buys and shorts both counted (futures and protection at their notional), may not exceed 3 × fund value. The desk refuses any order beyond it; reducing a position is always allowed.
- **Funded** instruments use cash when bought (shorts receive proceeds). **Rate futures and default protection** use no cash; their gains and losses are paid in cash as the price moves.
- **Carry**, paid at settlement on the position held at the bell: bonds and credit their yield ÷ 4; currencies their country’s policy rate ÷ 4; the Fear Index costs 3% a round; protection costs its spread ÷ 4 on the amount protected. Shorts pay instead of receive.
- **Cash interest**: (fund value − money in long positions) × 6% ÷ 4 if positive; if negative you have borrowed and pay 7% ÷ 4 (the cash rate plus 1%).
- **Crowd impact**: at settlement, for each instrument, all funds’ net buying in the round is compared with its market depth. Price push = 1% × net flow ÷ depth (at most 3%). Each fund pays −(its own net trade) × push: buying with the crowd costs, trading against it earns.

### The profit and loss, line by line
For each position: **price change + currency effect + carry − trading cost + crowd impact − forced-sale penalty**, then **cash interest** (and the **auction** in Round 06). The lines always add up exactly to the change in fund value.

---

## 7. Risk Used and forced liquidation

1. Each position’s **risk** = |size| × bad-round move, where a bad-round move = 2 × the instrument’s *typical move in a round*. The typical move starts at a set value (e.g. Aurelia Shares 5%, oil 10%) and updates every quarter and at every crisis: new = √(0.8 × old² + 0.2 × latest move²), never below three-quarters of its starting value.
2. Positions are grouped into **families** that move together (each economy’s rates or debt; shares and credit; currencies; commodities; gold). Inside a family, offsetting positions count for less: family risk = ½ × |net of signed risks| + ½ × √(sum of each risk²).
3. Families combine: √(family₁² + family₂² + …).
4. × the **crisis multiplier** (1 normally; raised by crises for the rest of the round).
5. **Risk Used** = that ÷ (15% of fund value).

If Risk Used is above 100% **at the bell**, the system closes the largest positions (skipping any whose closing would not lower risk) until Risk Used is 80%, at a price 2% worse than the market, and records a forced liquidation (−5 Risk Discipline points).

---

## 8. Forecasts and the SPECULA Score

**Forecast points** = 10 − 10 × |forecast − actual| (one point lost per 0.1 off, never below 0; a blank scores 0). The actual is the figure in the *next* release — for a policy rate, the rate set at this round’s settlement. Six forecasts in all (one a round), up to 60 points.

**SPECULA Score** (out of 100), calculated once, after the final release, and **sealed until the Event Head presses Reveal**. During the game each fund sees only its own record (return beyond cash, swing, deepest fall, risk-adjusted return, forecast points, forced liquidations) — never another fund’s, and there is no leaderboard. The 60 points depend on the best fund in the room, which is why no fund can know its score before the end.
- **Risk-adjusted return (60)**: the return your decisions earned beyond cash (total return − what 6% cash would have earned) ÷ swing (standard deviation of the round-by-round returns, at least 1%) − 0.10 × deepest fall from a peak (%). The best fund in the room gets 60, the rest in proportion; zero for a fund below ₹1,000 Cr or with a risk-adjusted return of zero or less.
- **Forecast accuracy (25)**: 25 × points ÷ 240.
- **Risk discipline (15)**: 15 − 5 × forced liquidations, not below 0.
- Ties: the higher final fund value ranks first.

*Why “beyond cash”?* Without it a fund that never traded would earn 6% a year with no swing at all, divide by almost nothing, and win. Measuring what the fund earned beyond cash keeps the guide’s promise that the score “rewards a fund that read the economy well over one that gambled and got lucky”. (See CHANGELOG.md.)

---

## 9. A fully worked round: Round 02, Aurelia

*(Numbers from a game where nobody else traded and the Event Head released no crisis in Round 02. In a real game the crowd impact differs. The Example Fund held only cash in Round 01, so it starts Round 02 with ₹1,015.00 Cr.)*

**The data drop.** Aurelia’s growth: 2.00 (trend) + 0.05 (borrowing costs: −0.25 × (4.25 − 4.2 − 0.25)) − 0.12 (oil: −0.02 × 6.00) − 0.10 (news) = 1.83 → **1.8%**, against 1.9% expected.
Inflation: 2.94 (0.7 × 4.2) + 1.20 (0.3 × 4.0) − 0.05 (demand: 0.25 × (1.8 − 2.0)) + 0.18 (oil: 0.03 × 6.00) + 0.02 (food) − 0.01 (crown) + **1.40 news** = 5.68 → **5.7%**, against **4.3% expected**: a 1.4-point surprise.

**What the market expects.** The Aurelia rate future is priced **95.50**: the rule on the *expected* figures gives 4.50%.

**What the rule says.** Target = 0.25 + 5.70 + 0.5 × (5.70 − 4.00) + 0.5 × (−0.20) = 6.70. Smoothed: 0.5 × 4.25 + 0.5 × 6.70 = 5.475 → **5.50%**. A team that does this sum knows the market is a full 1.00 too low. (Had the Event Head released the Wage Spiral, the inflation weight would double and the answer would be 6.25%.)

**The Example Fund trades** (the spread is 0.10%: no crisis has raised it): short ₹200 Cr of the Aurelia 10-Year Bond, short ₹1,000 Cr of the Aurelia rate future, long ₹300 Cr of Aurelia Shares, long ₹100 Cr of gold. Trading costs: (200 + 1,000 + 300 + 100) × 0.10% = ₹1.60 Cr, so the fund is worth ₹1,013.40 Cr after trading.

**Risk Used at the bell.** Aurelian rates family: 10Y −200 × 5.36% = −₹10.72 Cr and future −1,000 × 0.26% = −₹2.60 Cr → ½ × 13.32 + ½ × √(10.72² + 2.60²) = 6.66 + 5.52 = ₹12.18 Cr. Shares family: 300 × 9.34% = ₹28.02 Cr. Gold: 100 × 8.98% = ₹8.98 Cr. Combined √(12.18² + 28.02² + 8.98²) = ₹31.84 Cr; × crisis multiplier 1.00; ÷ (15% × ₹1,013.40 Cr = ₹152.01 Cr) = **20.95%**.

**Settlement.** Aurelia sets 5.50% (+1.25). The 10-year yield goes 4.91% → 5.95% (+0.37 from the policy rate, +0.42 from the long-run rate, +0.25 term premium): the bond falls 8.0 × 1.04 = 8.32%. The crown rises 2.38% (2.0 × 1.25 = 2.50 for the hike, −0.18 inflation gap with the rupee, +0.06 safe haven). Aurelian shares in crowns: +1.63 normal profit growth − 0.15 growth surprise − 2.60 (yields) − 0.25 (fear) − 0.15 (oil) = **−1.52%**. Gold +1.02%. The future settles at 100 − 5.50 = 94.50.

**The Example Fund’s P&L** (₹ Cr):
| Position | Price | Currency | Carry | Cost | Crowd | Total |
|---|---:|---:|---:|---:|---:|---:|
| Short AUR 10Y | −200 × (−8.32%) = +16.64 | −183.36 × 2.38% = −4.36 | −200 × 1.23% = −2.46 | −0.20 | −0.04 | **+9.58** |
| Short AUR future | −1,000 × (94.50 − 95.50) ÷ 100 = +10.00 | — | — | −1.00 | −0.70 | **+8.30** |
| Long AUR Shares | 300 × (−1.52%) = −4.56 | 295.44 × 2.38% = +7.03 | — | −0.30 | −0.09 | **+2.08** |
| Long Gold | +1.02 | — | — | −0.10 | −0.02 | **+0.90** |
| Cash interest | (1,013.40 − 400.00) × 1.50% | | | | | **+9.20** |
| **Total** | | | | | | **+30.06** |

The fund ends Round 02 at ₹1,045.06 Cr. Lessons that this round teaches: the rate call paid twice (the future and the bond short); but shorting a foreign bond is also a bet *against* its currency, and the very hike you predicted lifted the crown and cost ₹4.36 Cr; a short pays the bond’s interest; and Aurelian shares fell in crowns yet *gained* in rupees, because the crown rose more than the shares fell.

---

## 10. Questions teachers might ask

**Is this how real economies work?** In spirit, yes. The rules are simplified versions of real ones: a Taylor-type rule for central banks, an IS-curve for growth, a Phillips-curve for inflation, duration for bonds, uncovered interest parity and purchasing-power drift for currencies, and parametric value-at-risk for Risk Used. The simplifications are chosen so that every number is explainable with a calculator.

**Can a team win by luck?** Rarely. In 20 simulated games against bots (see `docs/08_BALANCE.md`), funds that read the data and the rules won every time; reckless leveraged gambling finished last, and doing nothing earns only the 15 discipline points.

**Why can’t the data drop move prices?** It is the design: the ten minutes between the data and the bell are the reward for reading the economy.

**Why did my currency fall when its central bank raised rates?** Several things move a currency at once: the rate change (+2.0 × the change), inflation relative to the rupee (−¼ of the gap), credit risk, fear, commodities and news. The desk’s “Why did prices move?” lists each part.

**What is the crowd impact really?** A simplified market impact: when everyone buys the same thing at once, the price you pay is pushed up. It rewards original thinking and punishes herding.

**Why did I get forced out when I did nothing?** Risk Used rises when markets turn violent: the crisis multiplier rises, and every price move feeds the “typical move”. The guide warns: “Watch it until the bell.”
