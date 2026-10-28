# Stock game (JACO CORP)

A stock-market trading game in the JACO CORP style, separate from SPECULA. Ten made-up companies, 45 news updates in 9 rounds of 5, and the price effect of every update taken from the organiser's price-impact sheet.

It comes in two versions that share the same engine and screens:

- **Live (Netlify):** a website where teams join with a PIN and play together in real time. News and prices reach every phone by themselves, orders go to the server, and the Event Head sees live standings. See **[DEPLOY.md](DEPLOY.md)** to put it online. Addresses: `/` for teams, `/desk` for the Event Head (game key), `/screen` for the projector.
- **Single file (Claude artifact):** two pages that need no server. Teams type a code from the big screen to open each update, and send a report code at the end.

In both, teams can **buy, sell or short** any stock. A short sells shares you do not own: the money from the sale goes into your cash, and the short's value plus 100% margin is held from your cash while it is open. If the price falls you buy back cheaper and gain; if it rises you lose. A team whose short goes badly can still buy it back, but cannot open new positions until it has free cash again.

The single-file version has two pages:

| Page | Who uses it | What it does |
|---|---|---|
| **Markets** (`dist/market.html`) | Every team, on one phone or laptop each | A broker app with no brand name: watchlist, charts, buy, sell and short (market, limit and stop-loss orders), positions, funds, news. Each team starts with ₹10,00,000. |
| **Event Head Desk** (`dist/desk.html`) | The Event Head only. **Secret** | Every update with its effect on four stocks (move, price before and after, and the reason), one-click **Release news** and **Move prices**, a trading-window timer, a **Big screen** view for the projector, the impact matrix, the price path, every release code, and a **Teams** tab that checks each team's account and reveals the standings. |

## How a round works (single file)

1. The Event Head presses **Release news**. The big screen shows the story and an 8-character code (for example `ABCD-EF23`), and the trading-window timer starts.
2. Teams type the code into **Enter code** in their app. The story appears in their News. Prices have not moved yet, so they trade on the news at the current prices.
3. When the window closes, the Event Head presses **Move prices**. The big screen shows which stocks moved and a new code. Teams type it and their prices change. Open limit and stop-loss orders fill at the new prices.

The pace can be one update at a time or a whole round (five updates) per click.

## Why codes

Every team's app holds the whole game, but each update is locked (AES-GCM encryption) and opens only with its own code. Nobody can read ahead by looking inside the page. Typing the latest code also opens every earlier one, so a team that missed a code only needs the newest.

## Fair play

- At the end (or whenever asked), each team copies its **report code** from Funds and sends it to the Event Head.
- On the desk's **Teams** tab the Event Head pastes it. The desk replays every trade at the official prices, so edited cash or holdings do not count.
- Any order a team placed at old prices after the next price code was already on the screen is voided (a grace period, 45 seconds by default, allows for typing the code). Orders that were waiting and filled because of a price move are always kept.
- The report code has a check that makes casual edits fail. It is not a signature: someone who studies the page's code could still forge one. For a college event that is a deterrent, not a guarantee.

## The live version's secrets

The live site ships the game in `live/server/game-sealed.mjs`, encrypted with the **game key** (AES-GCM; the key goes through 300,000 rounds of PBKDF2). The key is kept in `secret/live-key.txt` and was given to the Event Head privately. The server opens the game only when the Event Head signs in to `/desk` with it, and then sends each team only what has been released. `live/public-game.json` holds what every team knows anyway: the ten stocks, their starting prices and the starting money.

To re-seal after changing the secret data: `node stockgame/live/seal.mjs` (it keeps the same key). To check the live game in a browser: `node stockgame/live/build.mjs && node stockgame/live/e2e.mjs`. To run it on your own computer: `cd stockgame && npm install && npm run dev`, then open http://localhost:8899.

## Where the secret data lives

The 45 updates, the 180 price moves and the 90 release codes are **not in this repository**, because the repository is public. They are in `stockgame/secret/` (ignored by git) and inside the Event Head Desk page itself, which stays private.

To rebuild after a change:

```bash
python3 -I stockgame/tools/make-data.py <price-impact-sheet.xlsx> stockgame/secret/updates.txt
```

```bash
node stockgame/build.mjs
```

`make-data.py` keeps the existing codes, so a rebuilt page still accepts the codes already in use. `build.mjs` refuses to finish if any headline, story, reason or code would be readable in the team page. To check the whole flow in a browser:

```bash
node stockgame/e2e.mjs
```

If `stockgame/secret/` is lost, the desk page holds the same data: the game JSON is inside its `<script id="game">` block.

## Files

| Path | What it is |
|---|---|
| `src/engine.mjs` | Prices (compounded exactly like the sheet, in paise), orders, report codes, the replay check. Tested by `tests/stockgame.test.mjs`. |
| `src/vault.mjs` | Sealing and opening the updates with the release codes. |
| `src/chart.mjs` | The line chart used by both pages. |
| `src/theme.css` | JACO CORP colours and type: black, charcoal and one gold; Cinzel, EB Garamond, IBM Plex. |
| `src/market.html`, `src/desk.html` | The two pages. |
| `build.mjs` | Seals the updates and writes `dist/`. |
| `tools/make-data.py` | Turns the price-impact sheet and the updates text into `secret/game.json`. |
| `e2e.mjs` | A full desk-and-team run of the single-file version in a real browser. |
| `netlify.toml`, `package.json` | The live site's Netlify settings (deploy with Base directory `stockgame`). |
| `live/server/api.mjs` | The live server: joining, orders, releases, standings. Tested by `tests/stockgame-live.test.mjs`. |
| `live/server/game-sealed.mjs` | The whole game, encrypted with the game key. Safe to commit. |
| `live/build.mjs`, `live/dev-server.mjs`, `live/e2e.mjs` | Build the live pages; run them locally; test them in a browser. |
| `live/seal.mjs` | Seals `secret/game.json` with the game key. |
