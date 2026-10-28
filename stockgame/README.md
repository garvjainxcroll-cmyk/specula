# Stock game (JACO CORP)

A stock-market trading game in the JACO CORP style, separate from SPECULA. Ten made-up companies, 45 news updates in 9 rounds of 5, and the price effect of every update taken from the organiser's price-impact sheet.

There are two pages:

| Page | Who uses it | What it does |
|---|---|---|
| **Markets** (`dist/market.html`) | Every team, on one phone or laptop each | A broker app with no brand name: watchlist, charts, buy and sell (market, limit and stop-loss orders), holdings, funds, news. Each team starts with ₹10,00,000. |
| **Event Head Desk** (`dist/desk.html`) | The Event Head only. **Secret** | Every update with its effect on four stocks (move, price before and after, and the reason), one-click **Release news** and **Move prices**, a trading-window timer, a **Big screen** view for the projector, the impact matrix, the price path, every release code, and a **Teams** tab that checks each team's account and reveals the standings. |

## How a round works

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
| `e2e.mjs` | A full desk-and-team run in a real browser. |
