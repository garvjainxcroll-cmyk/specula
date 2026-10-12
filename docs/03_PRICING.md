# 03 · Pricing

Code: `src/engine/market.mjs`. Plain-English formula table: `MODEL_EXPLAINED.md` §5.

- `settleMarket` runs at settlement; `crisisMarket` when a crisis stage is released. Both return per-instrument returns built from named drivers (`rets[id].local.drivers`), which the desk shows under "Why did prices move?".
- Prices are stored to 6 dp: local price (`px.lp`), exchange rates (`px.fx`, rupees per unit), rate futures (`px.fut`) and default protection (`px.cds`). The rupee price = local × exchange rate.
- Yield levels are sums of labelled parts (`y2Parts`, `y10Parts`), so a yield change can be broken down into its causes.
