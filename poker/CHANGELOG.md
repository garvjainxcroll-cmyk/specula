# Changelog

Every rule or setting change is recorded here with its reason.

## 1.0.0 — October 2026

First version, built in stages: rules engine and tests → tables → multiplayer server → website.

**Rules chosen** (all in docs/RULES.md and pinned by tests)
- Standard no-limit betting: minimum bet = big blind; a raise adds at least the last full raise; the current bet and that increment are tracked separately.
- A short all-in raise does not reopen the betting for players who have already acted unless, since their last action, the total increase reaches a full raise (cumulative short all-ins count). This is the common TDA reading.
- A short all-in big blind still makes the others call the full big blind.
- Facing a short all-in opening bet after the flop, the minimum raise is to that bet plus one big blind.
- Odd chips in a split pot go to the tied winners starting left of the button.
- Simplified moving button (no dead button, no missed-blind tracking): simple to explain at an event; noted as a known limit.
- Tournament ties (two players out in the same hand with the same starting stack) share the place and its prize; otherwise the larger starting stack finishes higher.
- Time bank: 30 s by default, refilled by 2 s per hand, so it helps with a hard decision without slowing every hand.

**Defaults**
- Small Bet 25% of the pot, Big Bet 75% (per player, in the profile; per table default in the table settings).
- Cash tables: buy-in 40–200 big blinds; 25 s to act; new players wait for the big blind; two time-outs sit a player out; 15 minutes sat out stands them up.
- Accounts start with 10,000 virtual chips; free top-up to 10,000 once every 30 minutes when below 1,000 and not at a cash table.
- Tournaments: starting stack 10,000; 14 levels of 8 minutes; late registration to the end of level 3; prizes 50/30/20 of 100 points per player.

**Fixes made while testing**
- The secure random float asked Node's `randomInt` for a range of 2⁴⁸, one above its limit; bots crashed on the live server. Now 2⁴⁷, with a test on the live source (tests/rng.test.mjs).
- Tournament balancing could fail to move a player when the emptier table still had knocked-out players in their seats, and could move a player into a table that was about to break up. Both fixed; a 45-player test checks that no hand starts at a table two players above the emptiest.

**Name**
- The game was first called ALEA; renamed **Artha Vyūha** at the organiser's request. Internal identifiers use `artha` (storage name, `ARTHA_*` settings, browser keys).
