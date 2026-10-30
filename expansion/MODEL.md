# How Round 4 Control calculates the results

This is the full method: every formula, every setting and its default. You do not need it to run the event, but it lets anyone check a figure by hand. On screen, the **ⓘ formula** buttons show the same formula with the real numbers filled in.

All sample figures are **fictional simulation data** for JACO CORP 2026.

---

## 1. Ground rules

- **One engine.** Every screen, report and ranking uses the same calculation (`src/engine/`). The same inputs always give the same results: there is no clock and no random number anywhere in it, and ties are never settled at random.
- **Money is kept in paise** (whole hundredths of a rupee) and never as fractions. Each line of cost or revenue is worked out month by month, then **rounded once** (half away from zero). Every total is the sum of the rounded lines, so all reports reconcile to the paisa.
- **Shared amounts** (for example one market-entry cost split across three cities) are split so the parts add up exactly to the whole.
- **Ratios never divide by zero:** when the denominator is zero (or negative where that makes no sense) the ratio is shown as *n/a*.
- **Everything below is a setting** in Event Configuration, with the default shown. A Super Administrator can lock the formula and scoring settings before the event (Event Configuration → Visibility and lock).
- The **evaluation period** is 12 months from January 2027 by default (1–36 months allowed). Month 1 is the first month of the period.

---

## 2. Round 1 — the CV auction

The auction happens in the room. The platform records each outcome and works out what each team has committed to.

| Figure | Formula |
|---|---|
| Total winning bids | Σ winning bids of the team's employees |
| Initial hiring cost | winning bids + one-time recruitment costs + onboarding costs (from each CV) |
| Contracted salary | expected salary on the CV × (1 + salary adjustment %) — the adjustment is 0% by default |
| Annual workforce cost | Σ contracted salaries + employer contributions at the home continent's rate |
| Budget used | winning bids (default), or the initial hiring cost if *Budget counts* is set to "bids + recruitment + onboarding" |

- Only **confirmed sales** count. A CV can be sold once; a team can never have more than the team size (5).
- When a sale would take a team over its acquisition budget (default ₹1.10 Cr), the operator must acknowledge a warning, or — if *enforcement* is set to *block* — the sale is refused.
- Relocation and training appear in Round 1 only as **estimates**. They are charged in Round 2, when a deployment actually moves or trains someone, so they are never counted twice.
- **Locking Round 1** needs every team at exactly five employees and every CV sold or explicitly resolved (re-auctioned, allocated by Event Control decision, or recorded as left unallocated). A team may go into Round 2 short-handed only if a Super Administrator turns on *Allow a team with fewer employees to go into Round 2* (a logged scenario change once the auction has started).

---

## 3. Round 2 — reading one deployment

Each deployment record says: which employee, which team, which city, which job role, which assignment type, the salary, the start month and the number of months, the time share, the relocation package, and whether training, a local partner or an office is provided.

**One employee per city.** A team may place at most one of its employees in any one city. The headquarters city counts too. So a team's five employees go to five different cities, in one continent or several. Other teams may use the same city. The server refuses a second employee of the same team in a city when it is entered. Only a Super Administrator can relax the rule (*Several employees of a team may work in the same city*, Event Configuration → Rules of play); it is a logged scenario change once the event is live.

Definitions used below:

- **International**: the destination continent is not the employee's own (origin) continent.
- **Foreign to the team**: the destination continent is not the team's home continent.
- **Relocated**: the destination city is not the team's headquarters.
- **Local support**: *presence* (headquarters or an existing presence), else *office* (if an office is arranged), else *partner* (if a local partner is engaged), else *none*.
- **Active months**: from the start month for the number of months entered, cut short at the end of the employee's contract, or earlier if the CV discloses a limit on time abroad (the cut is shown and, when it falls inside the period, an interruption cost is charged).

### 3.1 Effective productivity

> Effective productivity = Base productivity × Role suitability × Operating environment × Regional role bonus × Experience × Cultural adaptation × Training × Local support × Relocation fit — **capped at 1.5**

| Part | Formula | Default range |
|---|---|---|
| Capability fit (0–100) | weighted average of the employee's capability scores, using the job role's weights | — |
| Base productivity | (capability fit − 40) ÷ (85 − 40), never below 0 | 0 at fit 40, 1.00 at fit 85 |
| Destination relevance (0–100) | weighted average of the destination conditions that matter to the role (for example demand and purchasing power for sales, infrastructure and logistics for supply chain) | — |
| Role suitability multiplier | 0.7 + (1.3 − 0.7) × relevance ÷ 100 | ×0.70 – ×1.30 |
| Operating environment | index = 60% infrastructure + 40% talent availability; multiplier 0.85 + 0.30 × index ÷ 100 | ×0.85 – ×1.15 |
| Regional role bonus | 1 + (continent bonus + city bonus for the role's function) ÷ 100, the bonus capped at ±20% | ×0.80 – ×1.20 |
| Experience | 0.85 + 0.20 × min(years, 20) ÷ 20, plus up to +0.05 for up to 3 previous international assignments (international deployments only) | ×0.85 – ×1.10 |
| Cultural adaptation | 1 + 0.004 × (cross-cultural score − cultural difficulty). Difficulty is 0 in the employee's own continent and is reduced by 20 points if they speak a language of the destination. | ×0.80 – ×1.10 |
| Training | ×0.85 if the CV says training is required and none is provided | — |
| Local support | ×0.92 with no office, partner or existing presence | — |
| Relocation fit | ×0.92 if the package is below the employee's stated needs (none < standard < enhanced < family) | — |

The **role suitability score** shown on screen is capability fit × role suitability multiplier, at most 100.

### 3.2 Direct revenue

For each active month *m*:

> Direct revenue = Base opportunity ÷ 12 × Productivity × Market multiplier × Role revenue factor × Business model factor × Risk factor × Special modifier × Home-market factor × (1 − compliance reduction) × Growth(m) × Ramp-up(m) × Time share × Shared credit(m)

| Part | Formula |
|---|---|
| Base opportunity | the city's base revenue opportunity per fully productive employee per year |
| Market multiplier | index = (0.5 × demand + 0.3 × purchasing power + 0.2 × (100 − competition)) ÷ 1.0; multiplier 0.5 + (1.5 − 0.5) × index ÷ 100 |
| Role revenue factor | from the job role (1.00 for a Country Sales Lead, 0.95 Business Development, 0.80 Technology Lead, 0.60 Customer Relations, … 0 for support roles) |
| Business model factor | from the team's revenue model, for the role's kind of revenue (sales, contracts or service) |
| Risk factor | 1 − 0.25 × regional risk ÷ 100 |
| Special modifier | (1 + continent scenario %) × (1 + city scenario %) — only when a special scenario is switched on |
| Home-market factor | 1 abroad; 1 − 35% in the team's own home continent (the existing business already serves it) |
| Compliance reduction | the revenue impact of unresolved, non-blocking mandatory requirements (capped at 100%) |
| Growth(m) | 1 + annual growth rate × (m − 0.5) ÷ 12 |
| Ramp-up(m) | for the k-th month of the assignment: 0 during the onboarding months *O*; then (k − O) ÷ (R + 1) during the ramp-up months *R*; then 1 |
| Shared credit(m) | earners of the same kind of revenue in the **same continent** share customers. Ranked by their monthly rate, the 1st, 2nd, 3rd… earner get 1, 0.9, 0.8, 0.7, 0.6 of their revenue. (If Event Control allows several employees per city, earners in the same city also share: 1, 0.6, 0.4, 0.25, 0.15, multiplied in.) |

A deployment **blocked** by a mandatory legal requirement earns no revenue at all.

### 3.3 What specialists add

Support roles earn no direct revenue; they change the team's figures through **effects**, each with a strength and a scope (same city, same continent, or the whole team):

> Strength in month m = maximum effect × the specialist's productivity × their ramp-up and time share that month × (1 − their compliance reduction)

| Effect | What it does | Cap |
|---|---|---|
| Revenue enabled for colleagues (uplift) | adds strength × a colleague's credited direct revenue in scope (some roles: international colleagues only) | all uplifts on one revenue together at most +50% |
| Cost saving | removes strength × an eligible cost in scope (operating costs, logistics, currency conversion, compliance, tax) | all savings on one cost together at most 50% |
| Risk mitigation | recovers part of the revenue lost to the risk discount in scope | at most the whole discount |

Enabled revenue is credited to the specialist who enables it, so each employee's contribution is counted once. Because a team has only one employee in each city, every sample effect reaches colleagues in the other cities of the same continent (or the whole team). The sample roles: Customer Relations (+5% continent), Marketing (+15% continent, with a campaign budget), Product Development (+8% continent), Regional General Manager (+15% continent), Corporate Strategy Director (+8% team), Operations Manager (+10% continent, saves 15% of operating costs in the continent), Supply Chain Lead (saves 50% of logistics, +12% continent), Finance Controller (saves 20% of operating costs, 60% of currency costs and 40% of tax in its continent), IHRM Manager (+20% for international colleagues, saves 25% of compliance costs), Legal and Compliance Officer (saves 60% of compliance costs, +10%), Risk Manager (recovers up to 80% of the risk discount).

---

## 4. Costs

Costs are counted month by month and fall into three groups.

### One-time
| Category | Formula |
|---|---|
| Relocation | CV relocation estimate × destination relocation multiplier × (1 abroad, or 0.4 within the home continent) × assignment-type factor (1, 0.8, 0.25, 1, 0.5) × package factor (none 0, standard 1, enhanced 1.35, family 1.8). Only when the person moves away from headquarters and the deployment is operational. Charged once, in the first active month. |
| Visa, permit and registration fees | the one-time cost of each applicable requirement recorded as compliant or pending |
| Deployment training | CV training cost × destination operating-cost multiplier, when training is provided |
| Office setup | the city's setup cost, once, when the team opens an office where it had no presence |
| Equipment | ₹1.5 L × destination operating-cost multiplier per operational deployment |
| Market entry | the continent's market-entry cost, once per foreign continent entered, split equally across the team's cities there |

### Recurring
| Category | Formula |
|---|---|
| Salaries | annual salary ÷ 12 for each month on the payroll: the destination salary × time share while on an operational assignment, the contracted Round 1 salary for the rest of the time (including before a deployment starts) |
| Employer contributions | salary × the employer contribution rate of the continent where the salary is paid |
| Housing | continent housing allowance × (1 + city cost adjustment) × assignment-type housing factor ÷ 12 × time share, while relocated |
| Local operating costs | ₹10 L per employee a year × destination operating-cost multiplier ÷ 12 × time share |
| Office | the city's office cost ÷ 12 for each month the office is occupied |
| Marketing | the revenue model's marketing share × revenue earned in the city, plus any campaign budget of the role |
| Logistics | revenue × the role's logistics factor × the city's shipping cost rate |
| Partner fees | revenue earned in the city × the continent's partner fee, where a partner is used instead of an office |
| Insurance, legal and compliance | the annual cost of each applicable requirement, plus a legal overhead of ₹4 L per employee a year × legal complexity ÷ 100 |
| Employee support | ₹2.4 L a year for each employee working outside their own continent |
| Currency conversion | revenue earned outside the home continent × the continent's conversion cost |
| Local taxes | for each city: (revenue − deductible costs) × the city's tax rate, only when that city makes a profit. Penalties are not deductible. Finance specialists may then save part of it. |
| Specialist savings | shown as negative lines against the cost they reduce |

### Contingent
| Category | Formula |
|---|---|
| Pre-operational (blocked) costs | for a blocked deployment: 25% of the housing and operating costs that would have applied |
| Additional documentation | ₹25,000 for each requirement still pending |
| Non-compliance penalties | the rule's penalty for each confirmed violation |
| Blocker penalty | a fixed amount per blocked deployment, if one is configured (0 by default) |
| Interruptions | ₹3 L when a disclosed CV risk cuts an assignment short |
| Duplicated expenditure | 10% of salary for a second holder of the same role in the same city (possible only if Event Control allows several employees per city) |

---

## 5. The statement and the ratios

| Figure | Formula |
|---|---|
| Total revenue | direct + enabled for colleagues + protected by risk mitigation |
| Total expansion costs | one-time + recurring + contingent |
| Operating profit | total revenue − recurring costs |
| **Round 2 incremental contribution** (net expansion contribution) | total revenue − total expansion costs. *Round 1 spending is not deducted here.* |
| **Combined recruitment-and-expansion outcome** | net expansion contribution − Round 1 initial hiring cost. *The auction spending is deducted exactly once, here.* |
| Profit margin | net expansion contribution ÷ total revenue |
| Operating margin | operating profit ÷ total revenue |
| Return on expansion expenditure | net expansion contribution ÷ total expansion costs |
| Combined return | combined outcome ÷ (total expansion costs + Round 1 initial hiring cost) |
| Break-even revenue | (total costs − taxes − revenue-linked costs) ÷ (1 − revenue-linked costs ÷ revenue) |
| Budget utilisation | total expansion costs ÷ expansion budget (default ₹9 Cr) |
| Cash remaining | starting cash (₹25 Cr) − Round 1 initial hiring cost − total expansion costs + total revenue |
| Revenue growth | expansion revenue ÷ (baseline annual revenue × months ÷ 12) |
| Per employee | the figure ÷ employees hired in Round 1 |
| Cost of non-compliance | pre-operational + documentation + penalties + blocker penalties |
| Deployment effectiveness | average over the team's employees of 100 × Σ months (productivity × ramp-up × time share, on operational assignments) ÷ months in the period, at most 100 |

Every figure is also broken down by continent, by city, by employee and by function. Shared costs (offices, market entry, tax) are allocated to employees in proportion to their revenue in that city; the parts always add back to the total.

---

## 6. Legal compliance

Each **rule** (requirement) has: who it applies to (continents, cities, functions, seniority, assignment types, roles, and *always / international / foreign to the team*), whether it is **mandatory**, whether it **blocks** a deployment, whether it can be completed only after arrival, whether **evidence** is required, its costs and penalty, and whether a Super Administrator may **waive** it. Only **approved** rules apply; official sessions start with every rule as a draft.

**Statuses** (kept distinct on purpose):

| Status | Meaning | Score |
|---|---|---|
| Compliant | done, with evidence where required | 100 |
| Waived | set aside by a Super Administrator with a documented reason | 90 |
| Pending documentation | in progress; a *compliant* mark without required evidence is treated as pending | 50 |
| Administrator review | referred for a decision | 40 |
| Not yet assessed | nobody has looked at it | 0 |
| Non-compliant | a confirmed breach | 0 |
| Not applicable | excluded from the score (needs an explanation) | — |

- **Automatic checks** are worked out from the deployment itself: minimum salary, maximum contract length, minimum experience, minimum capability score, minimum seniority, local partner, office or partner, training provided, relocation package, assignment type not permitted. An operator can only refer an automatic result for review.
- A requirement **stops** a deployment when it is mandatory, blocks, is not satisfied (compliant, waived or not applicable), and is not "pending but can only be completed after arrival".
- A blocked deployment earns no revenue. It must be resolved, or explicitly *recorded as blocked*, before Round 2 can be finalised.
- **Compliance score** = weighted average of the status scores (mandatory requirements count twice), minus any score penalties, kept within 0–100.
- **Compliance and readiness** = (70 × compliance score + 30 × % of deployments operational) ÷ 100.
- **Extra consequence of a blocker** for the ranking (setting): shown as a flag (default), compliance component set to zero, or team removed from the ranking.

---

## 7. Regional Opportunity Score (0–100)

> Score = Σ weight × goodness ÷ Σ weight

where goodness is the factor itself for a benefit and (100 − the factor) for a burden. Default weights: market demand 20, growth 15, employee-role suitability 15, infrastructure 10, talent 10, business opportunity 10, expected productivity 10, operating cost 10, competition 10, legal complexity 5, relocation cost 5, regional risk 5. Growth is scaled from −5% (0) to +15% (100); cost multipliers from ×0.6 (0) to ×1.6 (100); relocation multipliers from ×0.6 to ×1.8. At city level the two employee-specific factors are left out.

City figures come from the continent, adjusted by the city: **scores** and **rates** add the city's points (scores kept within 0–100), **multipliers** are multiplied by (1 + city % ÷ 100). Employer contributions, currency costs, partner fees, housing and market entry are set for the whole continent.

---

## 8. Continent benefits and city benefits

Every continent has benefits and disadvantages that apply in all five of its cities. Every city then adds benefits of its **own**, so no two cities of a continent are the same:

- **The city's adjustments** change the continent's figures for that city only (demand, purchasing power, growth, costs, tax, logistics, talent, risk and so on), as described in section 7.
- **The city's role bonus**: within each continent, the five cities favour five different job areas. The bonus is **added** to the continent's bonus for the same job area, and the total is capped at ±20%. It raises the productivity of an employee whose job role is in that area (section 3.1).
- **Special scenario modifiers** (a grant, a trade fair) apply to that city only.

Because a team has only one employee per city, choosing which employee goes to which city is the key decision: the right person in the city that favours their job area.

The sample figures (fictional):

| Continent (benefits in every city) | City | City role bonus | The city's other benefits | The city's disadvantages |
|---|---|---|---|---|
| **Asteria**: finance +10%, technology and data +5% | Aurum City | Finance +10% (+20% in total) | Highest purchasing power (+8) | Most expensive city (operating costs +15%, labour +10%) |
| | Bellhaven | Supply chain +15% | Lower shipping costs (−1 point), logistics +10 | Smaller market (demand −4) |
| | Crestford | Technology and data +10% (+15% in total) | Skilled labour (talent +12) | Crowded market (competition +5) |
| | Dunmere | Operations +15% | Low costs (operating −15%, labour −10%) | Lower purchasing power (−10) |
| | Everwick | Business development +10% | Tax incentive zone (−8 points), little competition (−20) | Small market (demand −10), thin talent pool (−10) |
| **Vespera**: sales +10%, business development +10% | Fairmont | Legal and compliance +15% | Wealthiest customers (purchasing power +12) | Local partner required (VES-02), operating costs +15% |
| | Glenhaven | Finance +10% | Tax −10 points, grant (local costs −10%), simpler regulation (−15) | — |
| | Highcrest | Operations +15% | — | Market volatility (risk +10), weaker infrastructure |
| | Ironvale | Supply chain +10% | Lowest costs (operating −15%, labour −15%) | Long shipment times (logistics −12) |
| | Juniper Bay | Sales +10% (+20% in total) | High demand and growth (+12, +3 points) | Local partner required (VES-02) |
| **Solmera**: supply chain +15%, operations +10% | Kingsport | Supply chain +5% (+20% in total) | Logistics +6, shipping −1 point | Intense competition (+12), operating costs +10% |
| | Larkspur | Operations +10% (+20% in total) | Low costs (operating −15%, labour −10%) | Lower purchasing power (−8), weaker infrastructure (−10) |
| | Meridian | Business development +15% | Trade fair (revenue +5%), business opportunity +15 | — |
| | Northbridge | Strategy and management +10% | Strong distribution (logistics +4, infrastructure +6) | — |
| | Oakridge | Technology and data +15% | Skilled labour (talent +18) | Smaller market (demand −6) |
| **Caldris**: legal and compliance +10%, strategy and management +10%, sales −5% | Pinehurst | Legal and compliance +10% (+20% in total) | Best infrastructure (+15), lower risk (−10) | — |
| | Queenshaven | Supply chain +15% | Shipping −2.5 points, logistics +20 | — |
| | Rosemont | Sales +15% (+10% in total) | High demand (+10), growth +2 points | — |
| | Silverton | Finance +15% | Purchasing power +22 | Very high costs (operating +35%, labour +25%, relocation +20%); local hiring rule (CAL-04) |
| | Thornfield | Operations +15% | Grant (local costs −15%), almost no competition (−20) | Weak infrastructure (−15), logistics −12; local hiring rule (CAL-04) |

Every figure is editable in Team and Continent Setup. The Global Expansion screen shows the continent's and the city's benefits side by side as an operator enters a deployment, with the role bonus that applies.

---

## 9. Ranking

**Weighted mode** (default): four components, each on 0–100:

| Component | Default weight | How it is scored |
|---|---|---|
| Financial performance | 60% | the chosen money figure (default: combined outcome), scaled between the lowest team (0) and the highest (100); all equal → 100 |
| Employee deployment effectiveness | 20% | as in section 5 |
| Compliance and operational readiness | 15% | as in section 6 |
| Budget discipline | 5% | 100 within the expansion budget, falling to 0 at 50% overspend. With no budget set it is not scored and its weight is shared out among the others. |

The weights must total 100%. **Financial mode** ranks on the money figure alone.

**Ties** are broken by the configured rules in order (default: higher operating profit, then fewer compliance violations, then lower expansion costs, then higher combined outcome). Teams still level after every rule **share** the place. Nothing is decided at random.

---

## 10. Checks before locking and finalising

A check that **blocks** must be cleared before Round 1 can be locked or Round 2 finalised. A Super Administrator can change the severity of an *adjustable* check; *fixed* checks cannot be changed.

| Stage | Check | Default | Severity |
|---|---|---|---|
| Configuration | Four teams with unique labels | Blocks | Fixed |
| Configuration | Every team has a valid home continent | Blocks | Fixed |
| Configuration | Home continents are all different | Warning | Adjustable |
| Configuration | Headquarters city lies in the home continent | Blocks | Fixed |
| Configuration | Every city belongs to exactly one valid continent | Blocks | Fixed |
| Configuration | Four continents with five cities each | Warning | Adjustable |
| Configuration | Exactly twenty valid CVs with unique IDs | Blocks | Fixed |
| Configuration | Weights are valid and ranking weights total 100% | Blocks | Fixed |
| Configuration | Multiplier ranges are valid | Blocks | Fixed |
| Configuration | Financial assumptions are complete and not negative | Blocks | Fixed |
| Configuration | Every team has a defined revenue model | Blocks | Fixed |
| Configuration | Job roles and assignment types are valid | Blocks | Fixed |
| Configuration | Compliance rules are valid | Blocks | Fixed |
| Configuration | Every compliance rule is approved by Event Control | Blocks | Adjustable |
| Configuration | Rules based on real law record who verified them | Blocks | Adjustable |
| Round 1 | Each team has exactly the required number of employees | Blocks | Fixed |
| Round 1 | A team goes into Round 2 short-handed (allowed by Event Control) | Warning | Fixed |
| Round 1 | Every CV is sold or explicitly resolved | Blocks | Fixed |
| Round 1 | Every sale is confirmed | Blocks | Fixed |
| Round 1 | Teams within their acquisition budget | Warning | Adjustable |
| Round 1 | Winning bids at or above the starting bid | Warning | Adjustable |
| Round 2 | Round 1 is locked | Blocks | Fixed |
| Round 2 | Each team’s written submission is recorded as received | Warning | Adjustable |
| Round 2 | Every hired employee has a deployment | Blocks | Adjustable |
| Round 2 | Every deployment uses an employee the team hired | Blocks | Fixed |
| Round 2 | Every deployment references a valid employee, city, role and type | Blocks | Fixed |
| Round 2 | No employee in incompatible (overlapping) assignments | Blocks | Fixed |
| Round 2 | Required destination information is present | Blocks | Fixed |
| Round 2 | Assignment type limits (duration, seniority) | Blocks | Adjustable |
| Round 2 | Maximum employees per city | Blocks | Adjustable |
| Round 2 | Maximum employees per continent | Blocks | Adjustable |
| Round 2 | Minimum employees kept in the home continent | Blocks | Adjustable |
| Round 2 | A senior executive stays at headquarters | Blocks | Adjustable |
| Round 2 | Number of foreign continents entered | Blocks | Adjustable |
| Round 2 | At most one employee of a team in each city | Blocks | Fixed |
| Round 2 | Deployment to a city with no prior presence | Blocks | Adjustable |
| Round 2 | Deployment with neither local office nor partner | Blocks | Adjustable |
| Round 2 | Salary at or above the employee’s minimum acceptable salary | Blocks | Adjustable |
| Round 2 | Salary at or above the local market rate | Warning | Adjustable |
| Round 2 | Every applicable mandatory requirement is assessed | Blocks | Fixed |
| Round 2 | Evidence recorded where a rule requires it | Warning | Adjustable |
| Round 2 | Every blocked deployment is resolved or explicitly recorded | Blocks | Fixed |
| Round 2 | Every deployment is approved | Blocks | Adjustable |
| Round 2 | Deployments start inside the evaluation period | Warning | Adjustable |
| Round 2 | Assignments end within the employee’s contract | Warning | Adjustable |
| Round 2 | Disclosed CV risk factors | Warning | Adjustable |
| Round 2 | Relocation package meets the employee’s stated needs | Warning | Adjustable |
| Round 2 | Expansion costs within the expansion budget | Warning | Adjustable |
| Round 2 | Cash stays positive | Warning | Adjustable |
| Round 2 | Regional risk below the risk threshold | Warning | Adjustable |
| Round 2 | Profit margin above the profitability threshold | Warning | Adjustable |
| Round 2 | No invalid or negative financial input | Blocks | Fixed |
| Round 2 | Team totals reconcile with employee and city records | Blocks | Fixed |
| Round 2 | A current calculation has been run | Blocks | Fixed |

Of the deployment rules these checks enforce, only *one employee of a team per city* is switched on in the sample configuration; the others (maximum per continent, minimum kept at home, and so on) are off until Event Control sets them.

---

## 11. Drafts, official results and versions

- **Run calculation** stores a *draft*: a summary, a fingerprint of the full result and a fingerprint of every input that matters. Change any figure afterwards and the draft is marked **outdated** on every screen; finalising is refused until it is run again. Notes and timestamps do not count as inputs.
- **Finalise Round 2** (Super Administrator, every blocking check cleared) stores **official result version 1**, with a copy of every input. A backup is taken automatically.
- **Reopening** for correction needs a reason. The earlier version stays on file, marked as reopened; finalising again stores version 2, and so on.
- **Exports** rebuild the figures from the stored inputs and compare them with the stored fingerprint. If they do not match exactly (for example, because the stored data was altered behind the system's back), the export is refused rather than producing figures that disagree with the record.

The model version is shown on the Financial Calculation Engine screen and in every report (currently 1.1.0). Record any change to a formula or default in `CHANGELOG.md`.
