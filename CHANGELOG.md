# CHANGELOG — every rule and coefficient decision, with the reason

The printed guide is a promise to players. Where the guide gives a number or a rule, the code follows it exactly (`tests/guide.test.mjs` pins every one). Where the guide is silent or needed interpreting, the decision is recorded here. **Items marked ⚑ are interpretations you may want to confirm before the event.**

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
