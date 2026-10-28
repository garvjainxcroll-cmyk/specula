# The rules Artha Vyūha follows

This is exactly what the game does, written for the Event Head to settle any question at a table. Every rule here is checked by an automated test (named in brackets).

## Cards and hands
- One standard 52-card deck, shuffled on the server for every hand with a cryptographically secure random generator (Fisher–Yates). A card is burned before the flop, the turn and the river. [rng.test, random.test]
- Each player makes the best five cards from their two and the five on the board, in any combination, including the board alone. [evaluator.test]
- Ranking, highest first: Royal Flush, Straight Flush, Four of a Kind, Full House, Flush, Straight, Three of a Kind, Two Pair, One Pair, High Card. Kickers decide ties; suits never do; only five cards count. A-2-3-4-5 (the wheel) is the lowest straight; straights do not wrap round (Q-K-A-2-3 is not one). [evaluator.test: all 2,598,960 five-card hands]

## Button and blinds
- The button moves one player clockwise after each hand, to the next player dealt in (a simplified “moving button”; there is no dead button or missed-blind tracking). [room.test]
- The next player posts the small blind, the next the big blind. Heads-up, the button posts the small blind, acts first before the flop and last after it. [hand.test]
- Blinds (and antes, if set) are posted automatically. A player who cannot cover a blind posts what they have and is all-in; the others must still call the full big blind. [hand.test]
- At a cash table a new player waits for the big blind to reach them (the host can switch this to “dealt in at once”). In a tournament everyone is dealt in. [room.test]

## Betting (No-Limit)
- Pre-flop the first player to act is left of the big blind; after the flop it is the first player still in left of the button.
- The smallest bet is the big blind. A raise must add at least the size of the last full bet or raise in that round. Example: blinds 50/100; raise to 400 (+300); the next raise must reach 700. [hand.test]
- Anyone may bet, raise or call all-in for less. An all-in raise smaller than a full raise does **not** reopen the betting for players who have already acted: they may raise again only if, since their last action, the bet has gone up by at least a full raise (several short all-ins can add up). Players who have not yet acted may still raise. [hand.test]
- Posting a blind is not acting: if everyone calls, the big blind may still check or raise.
- No raise is allowed when no other player could call it (everyone else is all-in).
- Uncalled chips go back to the player who bet them at the end of each round.
- When at most one player can still bet, betting stops, the hands still in are turned face up, and the rest of the board is dealt.
- Folding when you could check is allowed (the panel asks you to confirm, unless you turn that off).

## Time
- Each table sets the seconds to act (default 25) and a time bank (default 30 seconds, topped up by 2 seconds a hand). When both run out, the player checks if that is free, otherwise folds.
- Two time-outs in a row (the host can change this) sit the player out. At a cash table a player sat out for 15 minutes (changeable) is stood up and their chips go back to their account.
- A player who loses their connection keeps their seat; their turn times out as above. When they come back they see the table as it is now.

## Leaving, sitting out, chips
- **Leave table**: between hands you leave at once with your chips. During a hand your hand is folded when your turn comes and you leave when the hand ends; your chips go back to your account.
- **Sit out**: from the next hand you are not dealt in (cash tables). In a tournament your blinds are still posted and your hands folded until you come back or are knocked out.
- Chips can be added only between hands, up to the table’s maximum buy-in.
- Settings changed during a hand (blinds, timer, bet buttons…) apply from the next hand, never during one.

## Showdown and pots
- The last player to bet or raise on the river shows first; if everyone checked, the first player left of the button. Winning hands are always shown. Losing hands are mucked unless the player has turned auto-muck off; a table can instead show every hand at showdown. Hands that were all-in are already face up.
- Side pots: a player can win from each other player only as much as they put in themselves. Pots are built at each all-in amount; a folded player’s chips stay in the pots they reached, but a folded player never wins. [pots.test, hand.test, random.test]
- Tied hands split a pot equally. Odd chips go one at a time to the tied winners in order, starting with the first to the left of the button. [hand.test, pots.test]
- After the hand any player who was in it may choose to show their cards.

## Tournaments
- Everyone starts with the same stack. Blinds (and antes) rise on the clock; a new level applies from the next hand at each table. The Event Head can pause, add time or move to the next level.
- Late registration is open until the chosen level ends.
- Tables are balanced: when a hand is about to start at a table that has two or more players more than the emptiest table, players move (each time the player due to post the big blind next). When fewer tables are needed, the smallest table breaks up and its players fill the others; at the end everyone is at one final table. [sim.test]
- A player with no chips is out. Their place is the number of players left when they went out. Players knocked out in the same hand: the one who started the hand with more chips finishes higher; with equal starting stacks they share the place and its prize. [sim.test, api.test]
- The prize pool is points (or virtual chips), the chosen amount per player, split by the chosen percentages (for example 50/30/20). It is always paid in full, never more. [sim.test]

## Hidden information
- Your hole cards are sent only to you. Nobody else — other players, the Big Screen, the Event Head — sees them during the hand unless they are turned face up. The deck and the cards still to come are never sent to anyone. [api.test, room.test, every simulation step]
- In the hand history you see your own cards and any that were shown. Folded hands are shown only at tables set up for teaching (practice tables are). The Event Head’s audit of a **finished** hand shows every card, for disputes.

## Bots
- Bots are computer players for practice (and for testing a tournament). They are always labelled **Bot** and see only what a player in their seat would see. Players can add bots only to their own practice tables and private tournaments; only the Event Head can add bots to cash tables (for testing).
