# The market: a live paper-trading game for teams

A multiplayer stock-market game that looks and works like an online broker app, laid out like SPECULA: a Home page, How to Play, a Team Desk for every team, a Big Screen for the projector and a host console where you create the game and its teams. Styled with the JACO CORP design system (Night: black, charcoal and one gold; Cinzel and EB Garamond). No logo, and no name unless you give the game one (until then the screens just say what they are, e.g. “Ten companies. One live market.”).

**To put it online:** read [DEPLOY.md](DEPLOY.md). The ready-made upload is **`market-netlify.zip`**.

## The screens

| Screen | Link | Who |
|---|---|---|
| Home | `/` | everyone: the ten stocks live, how the game works |
| How to Play | `/#/learn` | everyone: the rules in plain words |
| Team Desk | `/#/desk` | each team: join with the team code, then trade |
| Big Screen | `/#/display` | the projector: join instructions, live prices, updates, the final standings |
| Host console | `/#/host` | you (password) |

## Running a game

1. **Create the game** (console → Game). Optionally give it a name (it appears on every screen). Set the **number of teams**: the names fill in as Team 01, Team 02… and you can type real names, one per line. Press **Save teams and make codes**: every team gets a private six-character code. Print the codes or read them out privately. Later saves go by name: a line with a team's name keeps that team and its code, a new name adds a team with a new code, and a deleted line removes that team (but never one with members signed in, orders or loans). Before saving, the console lists the teams it will remove and add. To **rename** a team and keep its code, use **Rename** in the list of codes.
2. **Teams join.** Each member opens Team Desk, types the team's code and their own name (and, optionally, a phone number). Every member of a team sees the same desk; any member's order is the team's order. Every team starts with **₹10,00,000**. If a code leaks, press **New code** for that team: everyone signed in to it is signed out and joins again with the new code. You can also sign out one member from the team's page (Dataset → click the team). People who were signed out stay in the Dataset, marked as signed out.
3. **Start the game.** Choose a session length (the market closes by itself when it runs out, and you can add time) or none. You can close and reopen the market at any time; while it is closed, prices pause and orders are refused.
4. **During the game**:
   - **Market:** move any stock by −10%, −5%, −2%, +2%, +5% or +10%, by any percentage, or to a set price, at once or over 10 seconds to 30 minutes. **Back to listed price** undoes it. Every holding team's money changes within a second. Teams see only prices, never your moves. Moves you make while the market is closed line up and play one after another from the opening bell, in the order you made them (for example, −10% at once and then +5% over 15 minutes: a drop at the bell, then a slow recovery). Each stock's card says what is still to come and when ("Next: to −10.0%, at the opening bell", "5m 0s after the opening bell"); **Cancel waiting move** on the card removes the moves that have not started yet. A move from before a break that is still playing (say, a slow rise) is replaced by the first move you make in the break, from where the stock stands. A move made while the market is open starts at once and replaces anything still waiting; two clicks within the same second add up. After the game ends, prices are final.
   - **Loans:** send money from one team to another, with no approval needed, at an interest rate and deadline you choose (minutes or hours). It comes back automatically with interest at the deadline. Both teams are told each time.
   - **Updates:** type news for every team; it appears on every desk and on the Big Screen, numbered in order.
   - **Dataset:** every team with its code, members, cash, holdings value, **total liquidable money**, loans, net worth and total P&L, live; everyone who ever joined, with their phone number and whether they are signed in now (or signed out by a new code, by you, by leaving the desk, or because their team was removed); every loan with its initial amount, final amount, deadline and status. Click a team for its whole portfolio. Each of the three lists has its own **Download CSV** button.
5. **End the game.** The market closes and every loan still running is repaid now with its full interest (if you ended it by mistake, **Take the game back** on the Game tab). The standings stay sealed until you press **Reveal the results**: the Big Screen shows them from last place to first, and each desk shows its own place.
6. **Start again** (console → Tools): *New game* keeps the teams and their codes and gives everyone ₹10,00,000 again; *Delete everything* removes the teams too.

## The ten stocks

| # | Company | Ticker | Sector | Listed price |
|--:|---|---|---|--:|
| 1 | Aurelia Industries | AURI | Energy & Infrastructure | ₹1,150 |
| 2 | Nexora Technologies | NEXO | Technology & AI | ₹270 |
| 3 | Vantrex Motors | VANT | Automobiles & EVs | ₹580 |
| 4 | Meridian Bank | MERB | Banking & Finance | ₹300 |
| 5 | Helix Pharmaceuticals | HELX | Healthcare & Pharma | ₹280 |
| 6 | Crestline Retail | CRTL | Retail & FMCG | ₹450 |
| 7 | Skyforge Defence | SKYF | Defence & Aerospace | ₹650 |
| 8 | GreenVolt Energy | GRVT | Renewable Energy | ₹110 |
| 9 | UrbanBite Technologies | URBT | Food-Tech / Consumer Tech | ₹380 |
| 10 | TitanCore Mining | TCOR | Mining & Commodities | ₹250 |

## How it works, in plain words

**Prices.** Each price = listed price × the host's level × (1 + a small automatic wiggle).
- The **wiggle** is six layers of random drift, from a few seconds to several minutes long. Every layer takes a small random step each second, all at the same moment, and every step is pulled back towards zero, so prices keep moving all the time (about ±1–2%; tech, EV and green-energy stocks move more, banks and retail less), keep returning to the listed price and **average to it**: in testing, a one-hour average is typically within about 0.06% of the listed price, and rarely more than 0.35% away.
- The **host's level** starts at 1 (no change). A move takes it from where it is to a new value, at once or gradually, and it stays until the host moves it again. Like the drift, a move changes the price only on the whole seconds, so its timing does not give it away.
- The game opens at exactly the listed prices; the wiggle starts from zero at the opening bell.
- Prices move in steps of ₹0.05, as on Indian exchanges, and stand still while the market is closed.
- Prices are worked out **only on the server** from the time and a secret number chosen when the game is created (and again at New game or Delete everything). Every screen shows the same price at the same moment. The steps are random and do not repeat: the last move says nothing about the next one, except that over a minute or more a price tends to come back towards its listed price. Teams see only prices, never the host's moves.
- Because prices come back to their listed prices, a team that buys a little below the listed price and sells a little above it tends to make a small, steady profit. That is part of the game (it is the same with any market that averages to fixed prices); your moves and the news are what make the big differences.

**Money.** All amounts are kept in whole paise, so sums are exact.
- *Total liquidable money* = cash + what the team's shares would sell for now.
- *Net worth* = liquidable money + loans owed to the team − loans it owes (interest builds up evenly until the deadline).
- *Total P&L* = net worth − ₹10,00,000. The standings rank teams by net worth; teams with exactly the same net worth share a place.
- A host move changes every holder's money together, within a second: holding 500 shares when the price falls ₹29 costs exactly ₹14,500.
- Orders are market orders at the live price, in whole shares, with no brokerage. A team cannot spend more cash than it has or sell shares it does not hold (no short selling).

**Loans.** The host chooses the lending team, the borrowing team, the amount, the interest (one rate for the whole loan: 10% means ₹50,000 comes back as ₹55,000) and the deadline.
1. At once: the amount leaves the lender's cash and arrives in the borrower's. Both teams get a notice.
2. At the deadline the website automatically takes the amount + interest from the borrower and pays it to the lender. Both teams get a notice.
3. If the borrower does not have enough cash then, its shares are sold at that moment's price (largest holding first) until it is covered. If even that is not enough, its cash goes below zero. The lender is always paid in full.
4. The host can cancel an ongoing loan: the amount goes back, with no interest (if the borrower has spent it, its shares are sold to give it back).

**Privacy and safety.** A desk receives only its own team's account: never another team's money, holdings, members or code, and never the host's moves. The Big Screen shows prices, updates, team names and how many members have signed in, and the standings only after the host reveals them. At most ten host-password tries are allowed from one internet connection in any ten minutes, even if they are all sent at the same moment; after that the console says how long to wait. **On the online site, every phone and laptop on the hall Wi-Fi counts as one connection**, so keep the console signed in (a signed-in console is never locked out), and if you are locked out, sign in over mobile data or wait. (On the local one-Wi-Fi server each device has its own count.) If you forget the password, or someone opened the console before you and chose one, set `HOST_PASSWORD` (see DEPLOY.md) and sign in once with it: from then on it replaces the old password for good, even if you remove `HOST_PASSWORD` later, and everyone else is signed out of the console. If the connection drops before an answer arrives, the screen says so, and pressing the same order, loan or update again (same stock, side and quantity; same loan; same text) is safe: it is not applied twice. For an order this holds for 10 minutes on the same phone or laptop, even after reloading the page (the server remembers every order's id for 15 minutes, however many the team makes); for loans and updates, for your last 40. **Leave this desk** signs out that phone or laptop only; a person is marked signed out in the Dataset when they have left on every device. CSV downloads are safe to open in Excel (nothing typed by players runs as a formula).

## For developers

| Path | What it is |
|---|---|
| `src/stocks.mjs` | The ten stocks (public). |
| `server/model.mjs` | The price model and market clock. **Server only**: the build refuses to publish it. |
| `server/api.mjs` | The game, teams and codes, trades, loans, updates, the session clock, host controls, permissions. |
| `server/storage-*.mjs` | Netlify Blobs (online) and in-memory/file (tests, local) storage. |
| `netlify/functions/api.mjs` | The Netlify function: every `/api/*` request. |
| `web/` | The website (no framework, no build step): `js/views/home, learn, desk, display, host`, plus `js/chart.mjs`, `js/series.mjs`, `js/site.mjs`. |
| `tests/` | Unit tests (`npm test`). `e2e/`: a browser test with the host, two teams and the Big Screen (`npm run e2e`). |

Commands: `npm install`, then `npm test`, `npm run e2e`, `npm run dev` (local server on port 8888), `npm run zip` (makes `market-netlify.zip`).
