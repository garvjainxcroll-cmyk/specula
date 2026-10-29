# JACO CORP 2026 · Round 4 Control

The organiser-only control platform for **Round 4 — International Business Expansion**:
Round 1 (CV Auction) and Round 2 (Global Business Expansion).

- **Who uses it:** the Event Control Team only — Super Administrators, Event Operators and Read-only Control Officers. There are no participant or judge accounts. Teams hand in their decisions on paper or forms; an operator types them in exactly as submitted.
- **What it does:** records the official auction results, the teams' employee deployments and the compliance facts, then calculates revenue, costs, profit, compliance and rankings with one deterministic engine, and produces Excel, PDF and JSON reports.
- **All sample data is fictional:** 4 continents, 20 cities, 20 CVs, 18 legal rules, 4 company profiles. Review and edit it before the event.

## Start here
1. **Put it online:** [DEPLOY.md](DEPLOY.md) (about 20 minutes, no programming).
2. **Sign in for the first time:** the site asks you to create the first Super Administrator.
3. **Rehearse:** Settings and Backup → create a *practice* session → Practice tools → load the sample auction, lock Round 1, load the sample allocations. Every screen then has data to try.

## The 14 screens
| # | Screen | What you do there |
|---|---|---|
| 1 | Control Dashboard | See where the event stands: stages, teams, auction progress, calculation and finalisation status, blocking issues. |
| 2 | Event Configuration | Rules of play, financial assumptions, productivity and revenue settings, scoring and ranking weights, validation severities, what operators may see, formula lock. |
| 3 | Team and Continent Setup | Team labels, home continents, headquarters, business profiles, revenue models, every continent and city figure. |
| 4 | Employee CV Repository | The twenty CVs, their scores, indices, best-fit roles and regional suitability. |
| 5 | CV Auction | Record each sale live: start, track bids, sell (with confirmation), withdraw, close unsold, re-open, lock Round 1. |
| 6 | Auction Results | Recruitment spending, salaries, capabilities and composition per team; the preserved locked outcome. |
| 7 | Global Expansion | Enter each team's written allocation, employee by employee; approve deployments. |
| 8 | Legal and Compliance Engine | Record permits and documents for each requirement; keep and approve the rule book; waivers (Super Administrator). |
| 9 | Financial Calculation Engine | Run the calculation, inspect every line and formula, clear the validation list, finalise Round 2. |
| 10 | Team Performance Comparison | The four teams side by side with charts. |
| 11 | Final Rankings | The private ranking and why each team is placed where it is. |
| 12 | Reports and Exports | Every Excel, PDF and JSON export, and the complete event archive. |
| 13 | Audit Log | Every change: who, when, before, after, why. Revert a draft edit. |
| 14 | Settings and Backup | Sessions (official and practice), backups and restore, accounts and permissions. |

## The workflow
1. **Configure** — check teams, continents, cities, CVs, rules (approve them), assumptions and weights. The Configuration check must show no blocking issue.
2. **Round 1** — record the auction as it happens in the room; when every team has exactly five employees, a Super Administrator locks Round 1.
3. **Round 2** — enter each team's allocation and the compliance facts; approve deployments (or record blocked ones); run the calculation; a Super Administrator finalises.
4. **Preserve** — download the complete event archive; backups are taken automatically at every lock and finalisation.

## How the numbers work
The full method, every formula and every range is in [MODEL.md](MODEL.md) (to follow). In short: each deployment's productivity comes from the employee's capability fit for the role, how much the role matters in that city, and the city's conditions; revenue follows from the city's opportunity, market strength, growth and the months actually worked; costs are counted month by month in clear categories; every total is the sum of rounded lines, so all reports reconcile exactly.

## For developers
- `npm install`, then `npm run dev` (http://localhost:8890), `npm test`, `npm run balance`, `npm run e2e`.
- `src/engine/` is the pure, deterministic calculation engine (no clock, no random numbers; money in integer paise). `src/data/` is the fictional sample data (server-only). `server/` is the API, permissions, audit and exports. `web/` is the console.
- The build (`scripts/build.mjs`) refuses to finish if any sample data would appear in the public files.
