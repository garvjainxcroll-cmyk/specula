# 02 · The economic model

The full model with every coefficient is explained in plain English in `MODEL_EXPLAINED.md` §3–4. The code is `src/engine/macro.mjs` (`computeRelease`, `decide`) with per-economy parameters in `src/config/economies.mjs`.

Key properties:
- Each published figure is a sum of terms rounded to 2 dp, then rounded to 1 dp. `work[k].terms` carries the terms for the desk's "show working".
- `exp` holds the consensus: the same computation without the round's news. The surprise = published − expected.
- Central banks use the (possibly crisis-revised) release; Aurelia decides first and the others reference its new rate.
- Crisis rule changes (`round.mods`) last until the round ends.
