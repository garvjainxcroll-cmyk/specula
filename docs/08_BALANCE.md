# 08 · The balance pass

`node scripts/balance.mjs 20 standard all` plays the real six-round script 20 times with ten bot funds (the last word says which crises the simulated Event Head releases: `all`, `none`, or `some` — a random pick of about 60% of the crises, respecting the order rules) and reports average SPECULA Score, rank, wins, fund value, forced liquidations, excess return, swing and deepest fall.

Bots (in `src/bots/bots.mjs`) see only what a team sees:
- **Reads the economy**: works out every rate decision from the published rules and the release, trades rate futures and 2-year bonds on rate surprises and shares on growth surprises, reads warning lights in the data (Kesh's reserves, Aurelia's bad loans, Verana's banks), and cuts risk in a crisis.
- **Cautious reader**: the same reasoning at half the size.
- **Model economist**: uses the full model to estimate the round's moves.
- **Momentum chaser**, **carry trader**, **buy and hold shares**, **random trader**, **reckless gambler** (near 3× in random bets, never reacts to crises), **does nothing**.

## Results (six rounds, October 2026)
20 games each.

| Room · crises released | Winner (wins of 20) | Skilled funds' average score | Reckless gambler | Doing nothing |
|---|---|---|---|---|
| Standard · all | Cautious reader (20) | cautious reader 86.8, reader 80.3, model economist 75.7 | last, 11.0 (average fund ₹810 Cr, worst ₹204 Cr) | 15.0 |
| Standard · some | Model economist (14), cautious reader (4), reader (1), momentum (1) | 83.9, 69.4, 66.0 | last, 12.0 (worst ₹160 Cr) | 15.0 |
| Standard · none | Model economist (20) | 93.6; the readers 33.7 and 33.6 | 19.6 | last, 15.0 |
| Crowded · all (four identical readers) | Cautious reader (20) | 86.8, model economist 85.2, readers 76.9 | last, 11.5 | 15.0 |
| Gamblers · all | Reader (20) | 86.8 | 12.5 (worst ₹47 Cr) | 15.0 |

Notes:
- With every crisis released, the readers (who react to warning lights and cut risk in a crisis) beat the model economist. With no crisis, the model economist wins, because the data surprises are all there is to read. With a random pick, the model economist wins most games but the readers are close. In every mode a skilled fund wins.
- The carry trader is forced out about three times when every crisis is released (Kesh and Sarvan break); with no crisis it comes second.
- Buy-and-hold shares loses money in a crisis-heavy game (average ₹860 Cr) and makes a little in a calm one.
- The crowd impact still punishes herding: four identical readers each score less than one alone.

Conclusion: the fund that reads the economy wins, whichever crises the Event Head chooses; reckless gambling and doing nothing do not.
