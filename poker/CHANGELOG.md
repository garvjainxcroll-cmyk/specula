# Changelog

Every rule or setting change is recorded here with its reason.

## 1.0.1 — October 2026: server fixes

Reported: “server issue”. No game rule changed.

**The main cause: storage changes were not always protected**
- Every change to a table is meant to be a conditional write: “save this only if nobody else changed the table since I read it”. That needs the record’s version tag from the read. Some Netlify Blobs servers do not send the tag on reads; the write then quietly became an ordinary one, and two phones acting at the same moment could overwrite each other (a seat given twice, a click lost, chips out of step). The storage adapter now takes the tag from the store’s listing when a read has none, checks it before and after reading, and refuses to save at all rather than save unprotected.
- New test (`tests/blobs.test.mjs`) runs the real game on Netlify’s own Blobs client and reference server: a seat race, twenty identical clicks at once, a balanced chip audit, and the reset.

**Other server fixes**
- Shared Wi-Fi: everyone at an event usually shares one internet address, and the old per-address limits could lock a whole room out (“too many requests”). Limits are now per account for players, and much higher per address: sign-ins 400 per 10 minutes, any request 20,000 per minute, table updates 400 per minute per player.
- A buy-in that timed out after the seat was already taken was refunded *and* seated (chips counted twice). The server now re-reads the table and finishes the buy-in if it went through.
- Chips stuck after a table closed or a tournament ended are now delivered the next time the player opens the site, and old table links are cleared from their account.
- Leaving your own practice table now closes it (it used to keep running with the bots).
- The Event Head’s **Download backup** and **Reset everything** now work in parts, so they finish on Netlify instead of timing out with many accounts. The reset with “keep accounts” first returns every chip on the tables.
- The website no longer says “Single device” when the server is only busy or slow; it slows its updates and shows a gold “the server is having trouble” bar with a link to the Server check.

**Also fixed**
- On phones most pages (Lobby, Practice, How to Play, Profile, the hand replay) had no margin at the sides: the text touched the screen edge. They now keep 16 px at each side, with no sideways scrolling.
- The browser test now also opens the Server check on a phone-sized screen.

**New: Server check** (`/#/status`, also on the Event Head desk)
- Says in plain words whether the game server is there, whether its storage works (including the protection against two changes at once), how fast it is, and what to do about each problem. It makes a report that can be copied and sent.

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
