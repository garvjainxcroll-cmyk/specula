# SPECULA

*Six economies. Forty-four markets. Six rounds.* The live macroeconomic trading simulation of **Copia et Inopia**, Round 3, built in the JACO CORP design.

- **Event Head:** start with [DEPLOY.md](DEPLOY.md), then [EVENT_HEAD_RUN_SHEET.md](EVENT_HEAD_RUN_SHEET.md) (secret) and [MODEL_EXPLAINED.md](MODEL_EXPLAINED.md).
- **What was checked:** [HAND_CHECK.md](HAND_CHECK.md) (the maths to the paisa), [docs/08_BALANCE.md](docs/08_BALANCE.md) (who wins), [CHANGELOG.md](CHANGELOG.md) (every decision).
- **Developers:** [docs/01_OVERVIEW.md](docs/01_OVERVIEW.md).

Six rounds, one ten-minute trading window each. Every crisis is the Event Head’s choice. Results are sealed: each team sees only its own fund until the Event Head reveals the standings at the end.

Screens: Home `/`, How to Play `/#/learn`, Practice `/#/practice`, Team Desk `/#/desk`, Big Screen `/#/display`, Event Head `/#/admin`.

> Keep this repository **private**: it contains the secret script.

---

**Also in this repository:** [`broker/`](broker/README.md), a separate live paper-trading game for teams in SPECULA's style (the host creates the game and its teams with private codes; ten stocks, host price moves, loans, updates, Big Screen). Its own Netlify upload is `broker/market-netlify.zip`; see [broker/DEPLOY.md](broker/DEPLOY.md).
