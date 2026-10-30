# Changelog — Round 4 Control

Every change to a formula, a default value or a rule of play is recorded here with its reason. The model version is shown on the Financial Calculation Engine screen and in every report.

## 1.1.0 — one employee per city; every city with benefits of its own (model version 1.1.0)

Asked for by the Event Head: *each continent is divided into five cities; a team cannot allot more than one employee per city; each continent has its own benefits, and each city's benefits differ within the continent.*

| Change | Was | Now | Reason |
|---|---|---|---|
| One employee of a team per city (`deployment.allowSameCity`) | allowed | **not allowed** (headquarters included); refused on entry; check R2_SAME_CITY always blocks | The event rule. A team's five employees go to five different cities. Other teams may use the same city. A Super Administrator can relax it as a logged scenario change. |
| City role bonuses | some cities had none, some shared one | in every continent the five cities favour five different job areas (+5% to +15%, added to the continent's bonus, capped at ±20%) | Each city's benefits must differ within its continent, and with one employee per city the choice of city should reward the right person in the right place. Full table: MODEL.md section 8. |
| Ironvale role bonus | supply chain −5% | supply chain +10% (supplier park; long shipment times kept as logistics −12) | Every city now has a strength; its disadvantage stays in its figures. |
| Customer Relations, Marketing, Product Development, Operations Manager effects | city scope: +6%, +30%, +10%, +15% (and 15% operating-cost saving) | continent scope: +5%, +15%, +8%, +10% (and 15% operating-cost saving in the continent) | With one employee per city a city-scoped effect could never reach a colleague, so these roles were worthless. Continent scope reaches colleagues in the other cities; the strengths were lowered because they now reach more people. |
| Practice sample allocations | several employees in one city | every team uses five different cities | They must obey the rule. |
| Balance strategies | "concentrated" put everyone in one city | replaced by "one continent" (the five cities of one foreign continent); every strategy uses five different cities | Plans the rule forbids cannot be tested. |

Balance pass after the change (20 auctions, 80 team-plans): "earners" (each earner in the best free foreign city) is best for 49 teams, "cluster" (three earners and two specialists in one continent) for 16 and "one continent" for 15. Home-only, scattered and random plans never win.

## 1.0.0 — first release (model version 1.0.0)

The organiser-only platform for JACO CORP 2026 Round 4: Round 1 (CV auction) and Round 2 (global business expansion). Built to the development brief: server-enforced roles, a deterministic engine, a configurable compliance engine, an audit log, backups, practice sessions, Excel/PDF/JSON exports, and the brief's 25 acceptance tests (`tests/acceptance.test.mjs`).

### Defaults set by the balance pass
The sample figures were tuned with `npm run balance`. It plays 20 random auctions × 4 teams × 6 deployment strategies and checks that thoughtful plans beat careless ones without one plan always winning:

| Setting | Value | Reason |
|---|---|---|
| City base revenue opportunities | sample values × 1.35 | With the first figures every team ended the year with a loss, whatever it did. |
| Legal and compliance overhead | ₹4 L per employee a year × legal complexity ÷ 100 | Legal complexity had no cost of its own, so complex markets were too cheap. |
| Finance Controller | saves up to 20% of operating costs, 60% of currency costs and 40% of tax in its continent | Support specialists were worth less than a mediocre earner, so no team would deploy one. |
| Risk discount | up to 25% of revenue at regional risk 100 | Risky markets cost almost nothing; the Risk Manager had nothing to recover. |
| Fit floor | capability fit 40 gives zero base productivity (85 gives 1.00) | With a lower floor a poor match still earned well, so role choice hardly mattered. |
| Continent credit | 1, 0.9, 0.8, 0.7, 0.6 for the 1st, 2nd… earner of one kind in one continent | Stacking every earner in one continent was always best ("earners" won 119 of 120 runs). |
| Uplift strengths | as listed in MODEL.md §3.3 | Cluster plans (earners plus specialists together) needed a real reward. |
| Home-market saturation | direct revenue in the team's own home continent −35% | Staying at home was too safe for an *international* expansion round. |

Result (20 auctions, 80 team-plans): "cluster" is best for 40 teams and "earners" for 37; "concentrated" plans sometimes win; home-only, scattered and random plans never do.

### Rules of play
- `auction.allowShortTeams` (default **off**): the brief says a team cannot enter Round 2 with fewer than five employees "unless the administrator explicitly changes the rule". With the switch off, Round 1 cannot be locked until every team has exactly the team size. With it on (Super Administrator, logged as a scenario change once the auction has started), a short team gets a warning (R1_TEAM_SHORT) instead of a blocking issue. A team can never have more than the team size.
