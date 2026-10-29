# Overview (for developers)

Artha Vyūha is a self-contained project in `poker/` of the SPECULA repository. It shares the JACO CORP design and the deployment pattern (Netlify function + Netlify Blobs) with SPECULA but no code.

## Pieces

| Path | What it is |
|---|---|
| `src/engine/` | **Pure** No-Limit Hold'em: `cards.mjs` (deck, shuffle with an injected random source), `evaluator.mjs` (best five of 5–7 cards, one integer score), `pots.mjs` (side pots, awards, odd chips), `hand.mjs` (the hand state machine: blinds, legal actions, min-raise and reopening rules, run-outs, showdown), `presets.mjs` (bet-size buttons), `rng.mjs` (seeded source for tests). No clock, no `Math.random` — the build refuses either. |
| `src/room/` | **Pure** tables and tournaments: `room.mjs` (seats, buy-ins with transfer ids, moving button, wait-for-BB, time-outs, sit-out, leaving, settings between hands, void, tournaments with levels, late registration, balancing, eliminations, prizes, chip books, outbox), `view.mjs` (the only shape sent to a viewer; redacts hidden cards), `history.mjs` (hand records and their redaction), `config.mjs` (defaults and validation). `now` and `rng` are always passed in. |
| `src/bots/bot.mjs` | Practice opponents (easy / medium / hard). Monte Carlo equity from the bot's own view only. |
| `server/api.mjs` | The server: accounts, tokens, rooms, actions, outbox delivery, the Event Head, rate limits. `handle(request, store, env, opts)`. |
| `server/auth.mjs`, `server/rng.mjs` | scrypt password hashes and HMAC tokens; the crypto random source. |
| `server/storage-*.mjs` | Netlify Blobs (strong consistency, conditional writes) and an in-memory/file store with the same interface. `getMeta` must always return a version tag: when a Blobs read carries none, the adapter takes it from the listing (checked before and after the read) or throws, so a change is never saved unprotected. `GET /api/selftest` checks this on the live storage. |
| `netlify/functions/api.mjs` | The Netlify function for `/api/*`. |
| `scripts/dev-server.mjs` | Local / stand-alone Node server: static files, the API, **Server-Sent Events** push (`/api/stream?id=`) and a background clock (every 0.5 s) for active rooms. |
| `web/` | The website (no framework): `felt.mjs` (table drawing and animations), `betpanel.mjs`, `net.mjs` (requests, session, live rooms via SSE or polling), `local.mjs` (offline practice running the room code in the browser), `sound.mjs` (Web Audio), views under `web/js/views/` (`status.mjs` is the Server check at `#/status`). |
| `tests/`, `e2e/run.mjs`, `scripts/simulate.mjs` | Unit and API tests (`blobs.test.mjs` runs the game on Netlify's reference Blobs server), the browser test, the big simulation. |

## Storage keys

| Key | Contents |
|---|---|
| `secrets` | token signing key |
| `host` | Event Head password hash, token version |
| `settings` | what players may create; chips policy |
| `acct/{id}`, `name/{lowercase name}` | account (bankroll, ledger, holds, stats, recent hands, prefs, presets) and name reservation |
| `room/{id}`, `code/{CODE}` | a room (all its tables, the hand in play with its deck, outbox, books) and its join code |
| `lobby` | short entries for every open room |
| `hist/{handId}` | the full record of a finished hand (redacted per viewer when read) |

## Concurrency and chips

- Every change to a room is read → `tick` (time-outs, bots, next hand) → change → write **only if the document is unchanged since the read** (`onlyIfMatch` etag), otherwise retry from a fresh read. Hand state, pots and awards live in that one document, so an action or a pot can never be applied twice. Views are only ever built from a state that was saved.
- An action must carry the hand id and the hand's action number (`seq`) that the player saw; anything else is refused as stale. This also makes network retries safe.
- Buy-in: the account is debited with a **hold** (transfer id) → the room seats the player, recording the transfer id in `applied` → the hold is released. If the room refuses, the hold is refunded. A hold older than 30 s is finished or refunded the next time the account loads, by checking the room's `applied` list.
- Cash-out, hand stats, tournament results and hand records leave a room through its **outbox**, written in the same write as the change. Delivery is idempotent (accounts remember delivered ids; history uses create-only writes) and retried by later requests.
- The Event Head's chip audit checks each account's ledger, each table's books (`in − out = chips on the table`), and that buy-ins and cash-outs match on both sides.

## Real time

- Netlify: phones poll `GET /api/room?id=&v=` (0.9 s when seated in a live hand, otherwise 1.5–2.5 s); an unchanged version returns a tiny `{same:true}`. Time-outs and bots advance on any request that touches the room (any player's or the Big Screen's poll).
- Node server: the page opens an EventSource; the server pushes the new version after every write and runs the clock itself, so updates are instant. The client falls back to polling automatically.

## Security model

- Server-authoritative: the client sends intentions; the server validates turn, hand id, sequence number, amounts and balances.
- Hidden information never leaves the server in a view: no deck, no burned or future cards, no other player's hole cards (not for the Event Head or the Big Screen either). Tested on every simulation step.
- scrypt (N=16384) password hashes with per-account salt; HMAC-SHA256 tokens with a version for "log out everywhere"; login lockout after 8 wrong passwords; rate limits per IP and per account (per server instance — best effort on Netlify, where several instances may run).

## Known limits (not implemented)

- No chat, no pre-action buttons ("check/fold in turn"), no "run it twice", no straddles, no big-blind ante (classic antes only).
- Simplified moving button: no dead button and no tracking of missed blinds.
- On Netlify updates are polled (about once a second), not pushed; the Node server pushes them.
- Rate limiting on Netlify is per function instance.
- No password reset by email (the Event Head can create a fresh account and grant chips).
- One time bank per seat per table, refilled slowly (2 s per hand); there is no tournament-wide time bank.
