# 06 · Server and storage

`server/api.mjs` is the whole server, behind the single Netlify function `netlify/functions/store.mjs` (path `/api/*`). Storage is Netlify Blobs with strong consistency and conditional writes (`server/storage-blobs.mjs`). Tests and the dev server use `server/storage-memory.mjs`.

| Key | Contents | Who reads it |
|---|---|---|
| `config` | Event Head password hash | server |
| `secrets` | fund codes, token signing key | server (codes go to the Event Head) |
| `state` | phase, round (`q`), timer, epoch, teams, document versions, `revealed` | everyone (poll) |
| `world/{v}-{id}` | the full engine state, a new copy each change; `state.worldKey` points to the current one | server |
| `journal/{team}` | that fund's trading notes, round by round | the fund, the Event Head |
| `loanreq` | loan requests and the Event Head's answers | each fund its own; the Event Head all |
| `orders/{q}/{team}` | that fund's orders, forecast and bid | the fund, the server |
| `pub/quarter`, `pub/history`, `pub/result/{q}` | public documents: the economy, prices, decisions and why prices moved — **never any fund's value, profit, forecast marks, bid or standing** | everyone |
| `pub/final` | the final standings; written only after the Event Head presses **Reveal the results** | everyone, after the reveal |
| `admin/private` | live standings, every fund's history, the final standings before the reveal | the Event Head (`admin` action `private`) |
| `team/{id}`, `team/{id}/r/{q}` | a fund's positions, forecasts and its per-round ledger | that fund |
| `resultfull/{q}` | the full settlement result (for recovery) | server |

Endpoints: `GET health | poll | doc?key= | mine?token=`; `POST join | order | forecast | bid | loan | admin`. Every `order` must carry a `note` (the trading note); `loan` lets a fund request, withdraw or repay. Admin actions include `startCapital`, `capital`, `loan`, `declineLoan`, `repay`, `notes`, and `fire` (any available crisis, in any order, subject to stage order and `needs`), `settle` (never blocked by unreleased crises), `final`, `reveal` and `private`.

Results are hidden: the public auction result carries only the cut-off price, amount sold, cover and number of bidders; who bid what is only in the Event Head's status. `tests/api.test.mjs` plays six rounds and checks that nothing a participant can read — without a token or with another fund's token — contains a fund's value, forecast, rank or standings. Permission rules are listed at the top of `server/api.mjs` and tested in `tests/api.test.mjs`.

Settlement is idempotent and recoverable: the desk is locked first (`phase: settling`), the result is computed deterministically and saved, and pressing settle again after an interruption finishes the job with the same result.
