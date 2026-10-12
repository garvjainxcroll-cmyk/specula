# 06 · Server and storage

`server/api.mjs` is the whole server, behind the single Netlify function `netlify/functions/store.mjs` (path `/api/*`). Storage is Netlify Blobs with strong consistency and conditional writes (`server/storage-blobs.mjs`). Tests and the dev server use `server/storage-memory.mjs`.

| Key | Contents | Who reads it |
|---|---|---|
| `config` | Event Head password hash | server |
| `secrets` | fund codes, token signing key | server (codes go to the Event Head) |
| `state` | phase, quarter, timer, epoch, teams, document versions | everyone (poll) |
| `world` | the full engine state | server |
| `orders/{q}/{team}` | that fund's orders, forecast and bid | the fund, the server |
| `pub/quarter`, `pub/standings`, `pub/history`, `pub/result/{q}`, `pub/final` | public documents | everyone |
| `team/{id}`, `team/{id}/r/{q}` | a fund's positions and its per-quarter ledger | that fund |
| `resultfull/{q}` | the full settlement result (for recovery) | server |

Endpoints: `GET health | poll | doc?key= | mine?token=`; `POST join | order | forecast | bid | admin`. Permission rules are listed at the top of `server/api.mjs` and tested in `tests/api.test.mjs`.

Settlement is idempotent and recoverable: the desk is locked first (`phase: settling`), the result is computed deterministically and saved, and pressing settle again after an interruption finishes the job with the same result.
