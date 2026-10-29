# CLAUDE.md — working on SPECULA

- Read `docs/01_OVERVIEW.md` first, then `MODEL_EXPLAINED.md`, then `CHANGELOG.md`.
- The printed guide (`reference/SPECULA_Guide.pdf`) is a promise to players. Do not change a rule it states; `tests/guide.test.mjs` pins them. Record every coefficient or rule change in `CHANGELOG.md` with its reason.
- Exception, asked for by the Event Head (CHANGELOG 2.0.0): six rounds of one ten-minute window each, every crisis optional, results sealed until the reveal. No public document may hold another fund's value, profit, forecast marks, bid or standing (`tests/api.test.mjs` checks this).
- CHANGELOG 2.1.0: the Event Head sets/changes capital (never counted as profit: scores are time-weighted) and lends money; every order needs a trading note. Notes, loans and capital are private to the fund and the Event Head.
- `server/script.mjs` and `server/runsheet.mjs` are secret. Never import them from `src/` or `web/`. The build fails if their text reaches `dist/`.
- The engine (`src/engine`) must stay pure and deterministic: no Date, no Math.random. Money is integer paise; use the helpers in `num.mjs`.
- Before committing: `npm test` (includes the hand check), `node scripts/balance.mjs 20 standard`, and, for UI changes, `npm run e2e`.
- Regenerate `HAND_CHECK.md` (`node scripts/handcheck.mjs`) and `EVENT_HEAD_RUN_SHEET.md` (`node scripts/make-runsheet.mjs`) after model or script changes.
- The user is not a programmer: documents for them use plain language.

## `expansion/` — JACO CORP 2026 Round 4 Control (a separate app)
- Its own Netlify site (Base directory `expansion`). Read `expansion/README.md`, `expansion/MODEL.md`, `expansion/CHANGELOG.md`.
- Its engine (`expansion/src/engine`) is pure and deterministic like SPECULA's; money is integer paise.
- `expansion/src/data` is confidential sample data and stays on the server; its build fails if that data reaches `expansion/dist`.
- Before committing there: `cd expansion && npm test` (includes the brief's 25 acceptance tests), `npm run balance`, and `npm run e2e` for UI changes. Record formula and default changes in `expansion/CHANGELOG.md`.
