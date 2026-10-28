# CLAUDE.md — working on Artha Vyūha (the poker game in poker/)

- This folder is its own project: run every command from `poker/`. It shares nothing with SPECULA's code; do not import between them.
- Read `docs/OVERVIEW.md`, then `docs/RULES.md`, then `CHANGELOG.md`.
- `docs/RULES.md` is what players and the Event Head rely on. Change a rule only on purpose, keep the doc and its tests in step, and record the change and its reason in `CHANGELOG.md`.
- `src/engine` and `src/room` must stay pure: no `Date`, no `Math.random`; the clock (`now`) and the random source (`rng`) are passed in. Live play uses `server/rng.mjs` (crypto). The build refuses engine code that breaks this.
- Hidden information: nothing in `src/room/view.mjs` or `src/room/history.mjs` may ever expose the deck, burned or future cards, or a hole card the viewer is not entitled to — the Event Head and the Big Screen included, while a hand is in play. `scripts/simlib.mjs` (`checkView`) and `tests/api.test.mjs` check this.
- Chips: every change to a room is one conditional write; account ↔ table transfers go through holds (buy-in) and the room outbox (cash-out, stats, history), each applied once by id. Keep the chip audit (`GET /api/host/audit`) balancing.
- Virtual chips only: never add deposits, withdrawals, cash prizes or anything with money value.
- Bots are always labelled as bots and never presented as people.
- Before committing: `npm test`; for rule or table changes also `npm run sim`; for UI changes `npm run e2e`.
- The user is not a programmer: documents for them (README, DEPLOY, RULES) use plain language. Design follows JACO CORP (`docs/jacocorp-tokens.json`): black, charcoal and one gold, Cinzel / EB Garamond, no emoji, no exclamation marks in headings.
