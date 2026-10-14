# The market: a live paper-trading broker website

A multiplayer stock-market game that looks and works like an online broker app. No name and no logo; styled with the JACO CORP design system (Night: black, charcoal and one gold; Cinzel and EB Garamond).

**To put it online:** read [DEPLOY.md](DEPLOY.md). The ready-made upload is **`market-netlify.zip`**.

## What everyone can do

**Investors** (sign in at `/`)
- Create an account with name, email, phone and school or team. Everyone starts with **₹10,00,000** of paper money.
- **Watchlist:** exactly the ten stocks below, live prices, change since the market opened, a 30-minute sparkline, and how many shares you hold.
- **Stock page:** a live chart (5 min, 30 min, 1 hour, 1 day) with a crosshair to read any moment, open, high, low, your position, and **Buy** / **Sell**.
- **Portfolio:** total liquidable money, overall P&L, cash, holdings value, invested, unrealised and realised P&L, net worth over time, holdings, loans and every order.
- **Updates:** the host's news, numbered in the order it was posted.
- **Notices** (the bell): when the host sends a loan to or from you, and when it is repaid.
- An investor sees **only their own** account. Never anyone else's money, holdings or details, and never what the host has done to prices.

**The host** (`/#/host`, password)
- **Open / close the market.** While closed, prices are paused and orders are refused.
- **Market control:** move any stock by −10%, −5%, −2%, +2%, +5%, +10%, any percentage, or to a set price, instantly or over 10 s to 30 min. **Back to listed price** undoes it. The console shows each stock's level, who holds it and how much is at stake, plus a log of your moves.
- **Dataset:** every investor with their details, cash, holdings value, **total liquidable money**, loans, net worth and total P&L, live. Click a row for the whole portfolio. Every loan with its initial amount, final amount (with interest), the deadline set, and its status (ongoing or elapsed). Both download as CSV.
- **Loans:** send money from one investor to another with no approval, at an interest rate and deadline you choose (minutes or hours).
- **Updates:** post, edit and delete updates.
- **Settings:** new game (keep accounts, everyone back to ₹10,00,000), delete everything, change the host password.

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
- The **wiggle** is a mix of slow and fast waves and small random steps, centred on zero. It keeps prices moving a little every second (about ±1–2.5%; tech, EV and green-energy stocks move more, banks and retail less). Over time it **averages to the listed price**: in testing, a one-hour average stays within about 0.15% of it.
- The **host's level** starts at 1 (no change). A move takes it from where it is to a new value, at once or gradually, and it stays there until the host moves it again.
- Prices move in steps of ₹0.05, as on Indian exchanges.
- Prices are worked out **only on the server** from the time and a secret number chosen when the game starts. Every screen shows the same price at the same moment, and nobody can see a future price or tell which moves were the host's.

**Money.** All amounts are kept in whole paise, so sums are exact.
- *Total liquidable money* = cash + what your shares would sell for now.
- *Net worth* = liquidable money + loans owed to you − loans you owe (interest builds up evenly until the deadline).
- *Total P&L* = net worth − ₹10,00,000.
- A host move changes every holder's money at once: holding 500 shares when the price falls ₹29 costs exactly ₹14,500.
- Orders are market orders at the live price, in whole shares, with no brokerage. You cannot spend more cash than you have or sell shares you do not hold (no short selling).

**Loans.** The host chooses the lender, the borrower, the amount, the interest (one rate for the whole loan, e.g. 10% means ₹50,000 comes back as ₹55,000) and the deadline.
1. At once: the amount leaves the lender's cash and arrives in the borrower's. Both get a notice.
2. At the deadline the website automatically takes the amount + interest from the borrower and pays it to the lender. Both get a notice.
3. If the borrower does not have enough cash then, their shares are sold at that moment's price (largest holding first) until it is covered. If even that is not enough, their cash goes below zero. The lender is always paid in full.
4. The host can cancel an ongoing loan: the amount goes back, with no interest.

## For developers

| Path | What it is |
|---|---|
| `src/stocks.mjs` | The ten stocks (public). |
| `server/model.mjs` | The price model and market clock. **Server only**: the build refuses to publish it. |
| `server/api.mjs` | Accounts, trades, loans, updates, host controls, permissions. |
| `server/storage-*.mjs` | Netlify Blobs (online) and in-memory/file (tests, local) storage. |
| `netlify/functions/api.mjs` | The Netlify function: every `/api/*` request. |
| `web/` | The website (no framework, no build step): `js/investor.mjs`, `js/host.mjs`, `js/chart.mjs`. |
| `tests/` | Unit tests (`npm test`). `e2e/`: a browser test with a host and two investors (`npm run e2e`). |

Commands: `npm install`, then `npm test`, `npm run e2e`, `npm run dev` (local server on port 8888), `npm run zip` (makes `market-netlify.zip`).
