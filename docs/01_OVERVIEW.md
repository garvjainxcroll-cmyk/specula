# 01 · Overview

SPECULA is a live, multiplayer macroeconomic trading simulation for Round 3 of *Copia et Inopia*. The printed participant guide is `reference/SPECULA_Guide.pdf`; every rule in it is a promise to players and is pinned by `tests/guide.test.mjs` — except three changes the Event Head asked for in October 2026 (six rounds of one ten-minute window each, crises at the Event Head's choice, results sealed until the end), recorded in CHANGELOG.md 2.0.0.

## Pieces
| Path | What it is |
|---|---|
| `src/config/` | Public configuration: the six economies (`economies.mjs`), the 44 instruments (`instruments.mjs`), game rules (`rules.mjs`), plain-English explanations (`explain.mjs`). |
| `src/engine/` | The pure, deterministic engine: rounding and money (`num.mjs`), data releases and central banks (`macro.mjs`), prices (`market.mjs`), Risk Used (`risk.mjs`), accounting (`portfolio.mjs`), scoring (`scoring.mjs`), and the round-by-round game (`game.mjs`; inside the engine a round is still called `q`). |
| `src/practice/` | The made-up two-round practice scenario (public). |
| `src/bots/` | Bot funds (balance pass, practice opponents, tests). They see only public information. |
| `server/script.mjs` | **Secret**: the six-round script (news, headlines, the optional crises, the auction). Never copied into the website. |
| `server/runsheet.mjs` | **Secret**: the Event Head's run sheet and the debrief round summaries. |
| `server/api.mjs` | The server: storage, permissions, the live game. |
| `netlify/functions/store.mjs` | The Netlify function: every `/api/*` request; storage is Netlify Blobs. |
| `web/` | The website: Home, How to Play (`#/learn`), Practice (`#/practice`), Team Desk (`#/desk`), Big Screen (`#/display`), Event Head console (`#/admin`). |
| `scripts/` | Build (with a leak guard), local dev server, balance pass, hand check, run-sheet generator, zip. |
| `tests/` | Unit tests (`npm test`). `e2e/`: Playwright end-to-end (`npm run e2e`). |
| `stockgame/` | A separate game: the ten-stock broker app and Event Head desk (see `stockgame/README.md`), as single-file Claude pages and as a live Netlify site (`stockgame/netlify.toml`, Base directory `stockgame`). Its updates, price moves and codes live only in `stockgame/secret/` (git-ignored), the private desk page, and sealed in `stockgame/live/server/game-sealed.mjs`. |

## Commands
- `npm test`: all unit tests, including the hand check
- `npm run balance -- 20 standard`: the balance pass (also `crowded`, `gamblers`; add `all`, `some` or `none` for which crises the simulated Event Head releases)
- `npm run dev`: build, then serve at http://localhost:8888 with a local store
- `npm run e2e`: build, then the full 8-fund, six-round browser test
- `npm run zip`: specula-netlify.zip
- `node scripts/handcheck.mjs`: regenerate HAND_CHECK.md
- `node scripts/make-runsheet.mjs`: regenerate EVENT_HEAD_RUN_SHEET.md
