# 04 · The script (secret)

`server/script.mjs` holds 24 quarters. Each has:
- `headlines`, revealed at the data drop;
- `forecast`, `{econ, v}` with v ∈ g, pi, u, i, revealed at the data drop;
- `data`, the news added to that quarter's release (hidden inside the figures);
- `news`, market news at settlement (hidden);
- `crises`, crises of one or two stages. Each stage can carry `state` shocks (fear, credit risk, term premium, spreads), `jumps` (immediate % moves), `data` revisions, `rules` changes, `M` (crisis multiplier), `spreadMult`, `pegBreak`, `defaultEntity` + `haircuts`, `posts`, and `settle` news;
- `auction` (Q21).

The public sees a stage only after the Event Head releases it. `tests/api.test.mjs` plays all 24 quarters and checks that no unreleased text appears in any public document. `scripts/build.mjs` refuses to build if any secret string appears in `dist/`.

Round summaries for the debrief and the run sheet are in `server/runsheet.mjs`.
