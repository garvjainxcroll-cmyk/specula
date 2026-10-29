# Round 4 Control — administrator guide

For the **Event Control Team** of JACO CORP 2026, Round 4 (International Business Expansion). It explains what to do before, during and after the event, and what to do when something goes wrong. No programming is needed.

Putting the site online is covered in [DEPLOY.md](DEPLOY.md). How every number is calculated is in [MODEL.md](MODEL.md).

---

## 1. Who does what

There are three kinds of account. Teams and judges never get one: teams hand in their decisions on paper or forms, and an operator types them in exactly as submitted.

| Role | Can | Cannot |
|---|---|---|
| **Super Administrator** (the Event Head and a deputy) | everything: configuration, approving rules, locking Round 1, finalising Round 2, corrections after a lock, waivers, reverting edits, sessions, backups and restores, accounts | — |
| **Event Operator** (the people at the laptops) | record auction results, deployments and compliance facts; approve deployments; run the calculation; export; take backups; use practice tools | change the configuration (unless given the *configuration* or *formula* permission), lock, finalise, correct a locked result, waive a requirement, manage accounts |
| **Read-only Control Officer** (checkers) | see every screen, the audit log and the reports | change anything, download a full backup |

Every permission is checked **by the server**, not just by hiding buttons. Every change is written to the **Audit Log** with who, when, the old and new values and the reason.

Give each person their own account. Never share a password. Settings and Backup → *My account* lets anyone change their own password; *Sign out on every device* ends every sign-in at once.

---

## 2. Before the event (allow a week)

1. **Accounts.** Settings and Backup → *Accounts and permissions* → create one account per person. Give passwords privately.
2. **Sessions.** Settings and Backup → *Event sessions*:
   - create the **Official** session (there can be only one active official session);
   - create a **Practice** session for rehearsals. Practice sessions are labelled with a yellow **PRACTICE** band on every screen; nothing done in them can touch the official session.
3. **Review the configuration** in the official session, in this order. Everything starts as fictional sample data and can be edited:
   1. *Event Configuration → Event and period* — event name, currency, the evaluation period (12 months from January 2027).
   2. *Event Configuration → Rules of play* — team size (5), acquisition budget rules, deployment limits.
   3. *Team and Continent Setup* — team labels, home continents, headquarters, business profiles; every continent and city figure.
   4. *Employee CV Repository* — the twenty CVs and their starting bids.
   5. *Legal and Compliance Engine → Rules* — read each rule, then **Approve** it (or *Approve all drafts*). In the official session every rule starts as a draft and does not apply until approved.
   6. *Event Configuration → Financial assumptions* and *Scoring and ranking* — the costs, the ranking weights (they must total 100%) and the tie-break order.
   7. *Event Configuration → Validation checks* — which checks block and which only warn.
   8. *Event Configuration → Visibility and lock* — hide any regional values operators should not see (for example unannounced benefits), then **Lock the formulas**.
4. The **Control Dashboard** must show *Configuration: no blocking issue*.
5. **Rehearse** in a practice session: Settings and Backup → *Practice tools* → *1. Load the sample auction results*, lock Round 1, *3. Load the sample allocations*, then approve, calculate and finalise as you would on the day. To rehearse with the official configuration, use *Duplicate as practice* on the official session.
6. Print or bookmark this guide. Decide who is the Super Administrator on duty for each round.

---

## 3. Round 1 — the CV auction

Open **CV Auction**. For each CV, in the order shown:

1. Click the CV, then **Start auctioning this CV**. Only one CV can be live at a time.
2. As the bidding goes, you may **Record bid** (team and amount) to keep a trail. This is optional.
3. When the hammer falls: **Record the sale…** → choose the winning team, type the winning bid, and confirm. The platform refuses a sale that would:
   - sell a CV that is already sold;
   - give a team a sixth employee;
   - break an enforced budget. If the budget is set to *warn*, you must tick that you have seen the warning.
4. If nobody bids: **Close without a sale**. If a candidate drops out: **Withdraw** (a reason is required).
5. A closed or withdrawn CV must be resolved before Round 1 can be locked. You can **Re-open for auction**; or a Super Administrator can **Allocate by Event Control decision**, or **Leave unallocated**. Both need a reason.

The team cards on the right show each team's count (for example 4/5), bids, hiring cost and remaining budget. **Auction Results** shows spending, salaries, capabilities and composition.

**Lock Round 1** (Super Administrator) when every team has five employees and every CV is resolved. If something is missing, the lock is refused with a list of what to fix. Locking:
- preserves the official employee-to-team mapping;
- takes a backup automatically;
- opens Round 2.

**Mistakes:**
- *Before the lock*: a Super Administrator can **Correct this result** or **Cancel the sale**, with a reason.
- *After the lock*: the same correction tool works, with a reason, and the original locked outcome is kept beside the correction.
- *If a team must play with fewer than five* (for example after a withdrawal): a Super Administrator turns on *Allow a team with fewer employees to go into Round 2* under Event Configuration → Rules of play. A reason is required, and the change is logged.

---

## 4. Round 2 — global business expansion

### 4.1 Enter the written allocations
Open **Global Expansion** and choose the team's tab. For each employee on the team's form:
1. **Record deployment**: city, job role, assignment type, annual salary at the destination (in rupees, or in local currency), planned start month, number of months, time share, relocation package, and whether training, a local partner or an office is provided. Optional notes: responsibility, business unit, permits.
2. The form refuses an employee hired by another team, and an assignment that overlaps another for the same person.
3. Tick **Written allocation received** for the team, with the form's reference.

Each saved deployment immediately shows its effective productivity, role suitability, Regional Opportunity Score, revenue, costs and compliance. Click **ⓘ formula** on any figure to see exactly how it was worked out.

### 4.2 Record the compliance facts
Open **Legal and Compliance Engine**. Each deployment lists the requirements that apply to it. For the ones an operator records (permits, registrations, insurance and so on), choose a status:

- **Compliant**: add the evidence reference when the rule asks for one. Without it, the requirement counts as *pending*.
- **Pending documentation**: the paperwork is in progress. This is not the same as a breach.
- **Non-compliant**: a confirmed breach. The rule's penalty applies.
- **Not applicable**: explain why.
- **Administrator review**: a Super Administrator must decide.

*Mark the rest compliant* and *Mark the rest pending* fill in every requirement still unassessed for one deployment. Automatic checks (minimum salary, training, local partner and so on) are worked out by the platform from the deployment itself.

A Super Administrator can **Waive…** a requirement the rule allows to be waived. A documented reason is required, and the waiver appears in the audit log as an override.

### 4.3 Approve
Back in **Global Expansion**:
- **Approve as operational** for each deployment. Approval is refused while a mandatory requirement stops the deployment, or while a mandatory requirement is still unassessed.
- If a deployment is stopped and will stay stopped (for example a permit that will not arrive in time), use **Record as blocked**, with a note. It earns no revenue, but its committed costs remain.
- Editing a deployment's details after approval resets its approval: approve it again.

### 4.4 Calculate, check, finalise
Open **Financial Calculation Engine**:
1. **Run calculation**. The status at the top shows *Calculation current*. If anything changes afterwards it shows *Calculation outdated*: run it again.
2. Work through the **validation list** until no blocking issue remains. Each issue links to the screen where it is fixed.
3. Look at **Team Performance Comparison** and **Final Rankings**. Until finalisation they are marked **draft — do not announce**.
4. **Finalise Round 2** (Super Administrator): type FINALISE to confirm. This stores **official result version 1** and takes a backup.

To correct a finalised result: **Reopen for administrative correction** (a reason is required). Make the correction, run the calculation and finalise again; this creates version 2. Version 1 stays on file.

---

## 5. After the event

1. **Reports and Exports** → **Complete event archive** (every report, the JSON backup and the audit log in one zip file). Keep it safe in two places.
2. Hand the **Round 2 deployment register** and the **team employee allocation sheets** to the staff preparing Round 3 (IHRM crisis exercise).
3. Archive the official session (Settings and Backup → Event sessions) when everything is safe.

The reports available:

| Report | Formats |
|---|---|
| Round 1 auction results | Excel, PDF |
| Employee CV repository | Excel |
| Team employee allocation sheets | Excel, PDF |
| Round 2 deployment register | Excel |
| Legal compliance report | Excel, PDF |
| Detailed financial report (one team) | PDF, Excel |
| Four-team comparison | Excel, PDF |
| Final rankings | PDF, Excel |
| Configuration snapshot | Excel, JSON |
| Audit log | Excel, CSV |
| JSON backup of the event data | JSON |
| Complete event archive | ZIP |

Round 2 reports always come from a stored calculation:
- the **official** result once finalised;
- the **draft** before that, clearly marked DRAFT.

Each report is rebuilt and checked against the stored result before it is produced. Excel files contain working formulas, labelled assumptions and reconciliation checks that read TRUE. No export ever contains passwords or sign-in data.

---

## 6. When something goes wrong

| What happened | What to do |
|---|---|
| A laptop crashes or the browser closes | Nothing is lost: every change is saved on the server at once. Sign in on another device. |
| Two operators edited the same thing | The second save is refused with “Someone else changed this record a moment ago”. The screen refreshes: check it and save again. |
| A wrong entry in a deployment, compliance record or setting | **Audit Log** → find the entry → **Revert** (Super Administrator, with a reason). If the record has been changed again since, revert the later change first or edit it directly. |
| A wrong auction result | CV Auction → **Correct this result** (Super Administrator, with a reason). This works before or after the lock. |
| A rule of play must change during the event | Super Administrator only. The change asks for a reason and is logged as a **scenario change**. Formula and scoring settings must be unlocked first (also with a reason). |
| “Calculation outdated” | Something changed after the calculation. Run it again. |
| An export says the official result “could not be reproduced” | The stored data was changed outside the platform. Do not use the figures. Restore the backup taken at finalisation (Settings and Backup → Backups and recovery) and export again. |
| Everything needs to go back to an earlier moment | Settings and Backup → *Backups and recovery* → choose a backup → **Restore** (type RESTORE). The current state is backed up first, and the audit log is kept. |
| Someone is locked out | After five wrong passwords an account is locked for ten minutes. A Super Administrator can **Unlock** it or **Reset password** under Accounts and permissions. |
| A screen looks out of date | Press **Refresh** at the top. Screens also refresh themselves every few seconds. |
| The site will not load | Check https://YOUR-SITE.netlify.app/api/health. If it does not show `"ok":true`, see DEPLOY.md. Do not redeploy during the event. |

**Backups** are taken automatically when Round 1 is locked or unlocked, and when Round 2 is finalised or reopened. They are also taken before any restore, reset or deletion. You can **Take a backup now** at any time, for example at the end of each round. The last 80 backups of each session are kept.

---

## 7. Messages you may see

| Message (short form) | Meaning |
|---|---|
| A reason is required | Corrections, waivers, scenario changes, unlocking and reopening all need a written reason for the audit log. |
| The round is live: only a Super Administrator may authorise a scenario change | Configuration is frozen for operators once the auction starts. |
| Round 1 is locked | Auction results can now be changed only through a correction. |
| Round 2 is finalised | Nothing that affects the result can change until a Super Administrator reopens Round 2. |
| The formulas … are locked | Unlock them first (Event Configuration → Visibility and lock), with a reason. |
| Confirm … | The action is irreversible or important; tick or type the confirmation. |
| Only a Super Administrator can edit continents and cities | Some regional values are hidden from operators, so operators cannot save region forms. |
| This deployment cannot be approved | A mandatory requirement stops it, or a mandatory requirement is unassessed. Fix it, or record the deployment as blocked. |

---

## 8. Security checklist

- The GitHub repository is **private** (it contains the confidential sample assumptions).
- `JACO_SETUP_CODE` was set before the first deploy, so only you could create the first Super Administrator.
- Every member of the team has their own account. Nobody outside Event Control has one.
- Passwords are at least 10 characters with letters and a number, and are given out privately.
- Laptops are signed out (or locked) when unattended. **Sign out on every device** ends every sign-in at once.
- Hidden regional values are set under *Visibility and lock* before operators sign in.
- The rankings are announced only after **Finalise Round 2**. Until then every results screen says *draft — do not announce*.
