# 08 · The balance pass

`node scripts/balance.mjs 20 standard` plays the real script 20 times with ten bot funds and reports average SPECULA Score, rank, wins, fund value, forced liquidations, excess return, swing and deepest fall.

Bots (in `src/bots/bots.mjs`) see only what a team sees:
- **Reads the economy**: works out every rate decision from the published rules and the release, trades rate futures and 2-year bonds on rate surprises and shares on growth surprises, reads warning lights in the data (Kesh's reserves, Aurelia's bad loans, Verana's banks), and cuts risk in a crisis.
- **Cautious reader**: the same reasoning at half the size.
- **Model economist**: uses the full model to estimate the quarter's moves.
- **Momentum chaser**, **carry trader**, **buy and hold shares**, **random trader**, **reckless gambler** (near 3× in random bets, never reacts to crises), **does nothing**.

## Results (after the changes listed in CHANGELOG.md)
20 games each.

**Standard room**: readers 1st and 2nd in all 20 games (scores 92 and 89); model economist 73; random 25; buy-and-hold 19; doing nothing 15 (only its discipline points); momentum 14; carry 14 (forced out three times when Kesh and Sarvan broke); reckless gambler last (10, average fund ₹551 Cr).

**Crowded room** (four identical readers): the crowd impact punishes herding, so the identical readers fall to 52 and the model economist wins. Gambling and doing nothing are still near the bottom.

**Room full of gamblers**: the reader wins all 20 games with 92. Gamblers average ₹589 Cr and one went below zero (it had sold default protection before a default).

Conclusion: the fund that reads the economy wins; reckless gambling and doing nothing do not.
