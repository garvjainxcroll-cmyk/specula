# 04 · The script (secret)

`server/script.mjs` holds six rounds. They were built (October 2026) by merging the original 24 quarters four into one (`SOURCE` → `ROUND_PLAN` → `SCRIPT`): each round's hidden news is the sum of its four quarters' news, its headlines were rewritten for the round, and every crisis of those quarters is available in the round. Each round has:
- `headlines`, revealed at the data drop;
- `forecast`, `{econ, v}` with v ∈ g, pi, u, i, revealed at the data drop;
- `data`, the news added to that round's release (hidden inside the figures);
- `news`, market news at settlement (hidden);
- `crises`, two to four per round, each of one or two stages. **Every crisis is optional**: the Event Head may release any, all or none, in any order. A second stage follows its first; a crisis with `needs: '<stage id>'` can only be released after that stage (the Concord Rescue needs `dinar-1`; the Grand Bargain needs `reckoning-1`). Each stage can carry `state` shocks (fear, credit risk, term premium, spreads), `jumps` (immediate % moves), `data` revisions, `rules` changes, `M` (crisis multiplier), `spreadMult`, `pegBreak`, `defaultEntity` + `haircuts`, `posts`, and `settle` news;
- `auction` (Round 06).

The public sees a stage only after the Event Head releases it. `tests/api.test.mjs` plays all six rounds and checks that no unreleased text appears in any public document. `scripts/build.mjs` refuses to build if any secret string (from the six rounds or the original 24 quarters) appears in `dist/`.

The run sheet (what to say each round, a suggested crisis plan with clock times, and notes on each crisis) and the debrief round summaries are in `server/runsheet.mjs`; `node scripts/make-runsheet.mjs` prints them into `EVENT_HEAD_RUN_SHEET.md`.
