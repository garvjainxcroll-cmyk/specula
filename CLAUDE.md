# CLAUDE.md — working on SPECULA

- Read `docs/01_OVERVIEW.md` first, then `MODEL_EXPLAINED.md`, then `CHANGELOG.md`.
- The printed guide (`reference/SPECULA_Guide.pdf`) is a promise to players. Do not change a rule it states; `tests/guide.test.mjs` pins them. Record every coefficient or rule change in `CHANGELOG.md` with its reason.
- `server/script.mjs` and `server/runsheet.mjs` are secret. Never import them from `src/` or `web/`. The build fails if their text reaches `dist/`.
- The engine (`src/engine`) must stay pure and deterministic: no Date, no Math.random. Money is integer paise; use the helpers in `num.mjs`.
- Before committing: `npm test` (includes the hand check), `node scripts/balance.mjs 20 standard`, and, for UI changes, `npm run e2e`.
- Regenerate `HAND_CHECK.md` (`node scripts/handcheck.mjs`) and `EVENT_HEAD_RUN_SHEET.md` (`node scripts/make-runsheet.mjs`) after model or script changes.
- The user is not a programmer: documents for them use plain language.
