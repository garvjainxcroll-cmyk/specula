# 05 · Accounting, risk and scoring

- Accounting: `src/engine/portfolio.mjs`. Money is in integer paise and multiplications go through BigInt (`num.mjs`). Each round produces a ledger per fund: per instrument price, currency, carry, cost, crowd and forced lines, plus cash interest and the auction. `settleQuarter` throws if the ledger does not add up exactly to the change in fund value.
- Risk Used and forced liquidation: `src/engine/risk.mjs` (MODEL_EXPLAINED §7).
- Scoring: `src/engine/scoring.mjs` (MODEL_EXPLAINED §8); the decisions are in CHANGELOG.md.
- The hand check (`scripts/handcheck.mjs`, `HAND_CHECK.md`) recomputes three rounds of one fund from first principles and must match to the paisa.
