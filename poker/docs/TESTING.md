# What was tested

Run from the `poker` folder. Results below are from 29 October 2026.

## `npm test` — 81 automated tests, all passing (about 40 seconds)

| File | What it proves |
|---|---|
| `evaluator.test.mjs` | All **2,598,960** five-card hands fall into the ten categories exactly as often as they should (4 royal flushes, 36 other straight flushes, 624 fours of a kind … 1,302,540 high-card hands). 20,000 random 7-card and 3,000 6-card hands agree with a separate brute-force evaluator on category, kickers and order. Wheel and steel wheel, no wrap-around straights, kickers, three pairs, two sets, ties ignore suits, the winning five cards. |
| `hand.test.mjs` | Blinds and turn order (three-handed and heads-up), the big blind's option, minimum raises, a short all-in that does not reopen the betting, a full all-in that does, several short all-ins adding up to a full raise, calling all-in for less, uncalled chips returned, three all-ins making a main and side pot, a folded raiser's chips staying in the pot, split pots with the odd chip, everyone folding, a short big blind, antes putting a player all-in, automatic run-out to the river, time-outs, mucking and showing, refusing acting twice or out of turn. |
| `pots.test.mjs` | Side-pot layers, folded contributions, equal all-ins, three-way splits with odd chips, never winning more than you were eligible for. |
| `presets.test.mjs` | Pot raise = bet + (pot + call): 350 at 50/100 first to act; 900 facing 200 into 300. ½, ⅔, ¾ pot; Small/Big Bet defaults (25% / 75%) and custom values; never below the minimum or above the stack; the amount summary. |
| `random.test.mjs` | **5,000 random hands** of 2–10 players with random stacks, blinds and antes, legal and illegal actions: chips balance after every action, all 52 cards used exactly once, every pot goes to its best eligible hand, split pots differ by at most one chip, folded players never win. |
| `room.test.mjs` | Sitting down and buy-in limits, the first hand starting by itself, stale and replayed clicks refused, the button moving clockwise, time-outs and sitting out, leaving mid-hand, waiting for the big blind, settings waiting for the next hand, cancelling a hand, top-ups, views that hide other players' cards (also from the Event Head), showing cards after a hand, practice bots buying back in. |
| `sim.test.mjs` | 2,000 hands at a 6-seat table with players timing out, leaving and coming back; 1,000 heads-up; 1,000 at a full 9-seat table; a 30-player and a 45-player tournament on four and five tables (balanced, every place awarded, the prize pool paid exactly); heads-up and 6-max tournaments. |
| `api.test.mjs` | Accounts (unique names, hashed passwords, lockout after 8 wrong passwords), guests and claiming an account, logging out ending old tokens, Quick Play, buy-ins within limits and refunded when refused, only the player to act may act, **twenty identical clicks at once applied once**, **two players racing for one seat** (one gets it, the other is refunded), leaving returns the chips and the audit balances, interrupted buy-ins finished or refunded, time-outs on the server clock, practice with bots, private-table permissions, the Event Head password, tournaments played to the end with results delivered to accounts, chip grants, settings, hand-history privacy, rate limits. |
| `rng.test.mjs` | The live (crypto) random source stays in range; 20,000 shuffles are full decks with every card in every position about equally often; a practice table runs on the live source. |
| `blobs.test.mjs` | The real Netlify storage path: Netlify's own Blobs library talking to Netlify's reference Blobs server. Create-only and “only if unchanged” writes are honoured; a stale copy can never be saved; the Server check passes; two players play several hands, **two players race for one seat** and **twenty identical clicks arrive at once** (each applied once); the chip audit balances; the reset in parts keeps every account's chips. |

## On the live site: the Server check

Open `https://YOUR-SITE/#/status` (or Event Head desk → **Server check**). It runs the same storage checks on the real Netlify storage — write, read back, refuse a stale write, let only one of two simultaneous changes through, delete — and measures the speed from that device. Run it after every deploy and before the event.

## `npm run sim` — 10,460 hands

| Table | Hands | Showdowns | Hands with side pots |
|---|---|---|---|
| Heads-up, 1 person v 1 bot | 2,500 | 1,189 | 0 |
| 6 seats, 4 people + 2 bots | 2,500 | 1,920 | 748 |
| 9 seats, 9 people | 2,500 | 2,172 | 1,606 |
| 6 seats, 6 bots (practice) | 2,500 | 2,176 | 33 |

Five full tournaments (30, 45, 13, 2 and 18 players): every one finished, every player got a place, the whole prize pool was paid, and no hand ever started at a table more than one player above the emptiest table. After every step of every simulation the chips balanced. At random steps (about one in ten) the views of a player and of the Big Screen were checked: none ever contained a card it should not.

## `npm run e2e` — the browser test, all 14 checks passing

The Event Head sets the password and opens a table → two players (one on a laptop, one on a phone-sized screen) join by code, choose guest names and sit down → they play 24 actions, including a pot-size raise from the preset button → the Big Screen never shows a hole card during a hand → one player's connection is cut: the red bar appears, then clears by itself and the seat is still there → the other player leaves and the chips are back in their account → the chip audit shows four "Balanced" lines → a tournament with 3 test bots is created, a player registers from the lobby, the Event Head starts it and the player is seated → the Server check, on a phone-sized screen, says the server answers and storage works. No errors in any page.

## Found and fixed by testing
- The live random float overflowed Node's range limit (bots crashed on the real server; the seeded tests could not see it). Fixed, and `rng.test.mjs` now tests the live source.
- Tournament balancing: a table that still showed knocked-out players had no free seat, and a table about to break up could receive players. Fixed; the 45-player test pins it.
- Netlify storage: reads from some Blobs servers carry no version tag, so the protected write turned into an ordinary one and two simultaneous changes could both be saved. Found by running the game on Netlify's reference Blobs server; fixed in `server/storage-blobs.mjs`; `blobs.test.mjs` pins it.
- A buy-in that timed out after it had gone through was refunded as well (chips counted twice). Fixed in `server/api.mjs`.
