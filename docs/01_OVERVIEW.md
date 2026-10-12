# 01 · Overview

SPECULA is a live, multiplayer macroeconomic trading simulation for Round 3 of *Copia et Inopia*. The printed participant guide is `reference/SPECULA_Guide.pdf`; every rule in it is a promise to players and is pinned by `tests/guide.test.mjs`.

## Pieces
| Path | What it is |
|---|---|
| `src/config/` | Public configuration: the six economies (`economies.mjs`), the 44 instruments (`instruments.mjs`), game rules (`rules.mjs`), plain-English explanations (`explain.mjs`). |
| `src/engine/` | The pure, deterministic engine: rounding and money (`num.mjs`), data releases and central banks (`macro.mjs`), prices (`market.mjs`), Risk Used (`risk.mjs`), accounting (`portfolio.mjs`), scoring (`scoring.mjs`), and the quarter-by-quarter game (`game.mjs`). |
| `src/practice/` | The made-up two-quarter practice scenario (public). |
| `src/bots/` | Bot funds (balance pass, practice opponents, tests). They see only public information. |
| `server/script.mjs` | **Secret**: the 24-quarter script (news, headlines, crises, the auction). Never copied into the website. |
| `server/runsheet.mjs` | **Secret**: the Event Head's run sheet and the debrief round summaries. |
| `server/api.mjs` | The server: storage, permissions, the live game. |
| `netlify/functions/store.mjs` | The Netlify function: every `/api/*` request; storage is Netlify Blobs. |
| `web/` | The website: Home, How to Play (`#/learn`), Practice (`#/practice`), Team Desk (`#/desk`), Big Screen (`#/display`), Event Head console (`#/admin`). |
| `scripts/` | Build (with a leak guard), local dev server, balance pass, hand check, run-sheet generator, zip. |
| `tests/` | Unit tests (`npm test`). `e2e/`: Playwright end-to-end (`npm run e2e`). |

## Commands
- `npm test`: all unit tests, including the hand check
- `npm run balance -- 20 standard`: the balance pass (also `crowded`, `gamblers`)
- `npm run dev`: build, then serve at http://localhost:8888 with a local store
- `npm run e2e`: build, then the full 8-fund, 24-quarter browser test
- `npm run zip`: specula-netlify.zip
- `node scripts/handcheck.mjs`: regenerate HAND_CHECK.md
- `node scripts/make-runsheet.mjs`: regenerate EVENT_HEAD_RUN_SHEET.md
