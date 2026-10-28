# Artha Vyūha

*Two cards. Five on the board. One pot.* Live multiplayer **No-Limit Texas Hold’em** with **virtual chips only**, in the JACO CORP design.

- **Event Head:** start with [DEPLOY.md](DEPLOY.md) (putting it online, the rehearsal, the day), then [docs/RULES.md](docs/RULES.md) (the exact rules, for settling any dispute).
- **What was checked:** [docs/TESTING.md](docs/TESTING.md) — every five-card hand, thousands of simulated hands and tournaments, the server’s security rules, and a two-player browser test.
- **Developers:** [docs/OVERVIEW.md](docs/OVERVIEW.md), [CHANGELOG.md](CHANGELOG.md).

## The screens

| Screen | Address | Who |
|---|---|---|
| Home | `/` | everyone |
| Lobby (Player Desk) | `/#/lobby` | players: Quick Play, join by code, host a private game, tournaments |
| A table | `/#/t/CODE` | players and anyone watching |
| Practice | `/#/practice` | anyone: against bots, which are always labelled “Bot” |
| Profile | `/#/profile` | players: sign in, guest, chips, statistics, hand replays, settings, bet buttons |
| How to Play | `/#/learn` | first-timers |
| Event Head desk | `/#/host` | the organiser (password) |
| Big Screen | `/#/screen/CODE` | the projector |

## Commands (in the `poker` folder)

- `npm test` — all automated tests (about 40 seconds)
- `npm run sim` — the big simulation: 10,000 hands and five full tournaments (about 2 minutes)
- `npm run dev` — build, then play at http://localhost:8888 (live push and background clock on)
- `npm run e2e` — build, then the browser test: Event Head, two players, Big Screen, a dropped connection, the chip audit, a tournament
- `npm run zip` — `artha-vyuha-netlify.zip`: the built site and its server function in one file, for drag-and-drop on Netlify (see DEPLOY.md)

No real money: no deposits, no withdrawals, no wagering, no prizes of cash value. Tournament prizes are points or virtual chips.
