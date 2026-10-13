// Writes EVENT_HEAD_RUN_SHEET.md from the script and the run sheet, so the printed sheet
// and the console always agree. Usage: node scripts/make-runsheet.mjs
import { writeFileSync } from 'node:fs';
import { SCRIPT } from '../server/script.mjs';
import { RUNSHEET } from '../server/runsheet.mjs';
import { ROUNDS } from '../src/config/rules.mjs';
import { ECONOMIES } from '../src/config/economies.mjs';
import { FORECAST_VARS } from '../src/config/rules.mjs';

const md = [];
md.push('# SPECULA — Event Head run sheet', '');
md.push('> **SECRET.** This sheet contains every crisis. Print it for yourself only; never put it on the projector. The console (`/#/admin`) shows the same notes for the current round.', '');
md.push('## Before the hall fills', '');
md.push('1. Console `/#/admin` open on your laptop (plugged in). Projector on `/#/display`, full screen (F11).');
md.push('2. Console → **Funds**: one line per team → **Save funds and make codes** → **Print** the codes and hand each team its own code, privately.');
md.push('3. Teams open `/#/desk` on their phones and join with the code. The Big Screen shows how many members each fund has signed in.');
md.push('4. While they wait, tell them to read **How to Play** or try **Practice** (two made-up rounds, on their own phone).');
md.push('5. When every fund has at least one member signed in: **Start the game**. (Funds cannot be changed after this.)', '');
md.push('## Results are sealed', '');
md.push('- Teams see **only their own fund**: value, profit and loss line by line, Risk Used, forecast marks. There is no leaderboard on the desks or on the Big Screen.');
md.push('- You see the live standings in the console (Control and Debrief tabs), marked “only you can see this”. Keep the laptop screen away from the hall.');
md.push('- After Round 06: **Publish the final release** (scores stay sealed), then **Reveal the results**. The Big Screen reveals the standings from last place to first; each desk shows its own score and place.', '');
md.push('## Every round, the same rhythm (about 13 minutes)', '');
md.push('| Step | You press | Teams see | You say |', '|---|---|---|---|');
md.push('| 1. Data drop | (it appears when you press Next) | The new figures, headlines and forecast question | The “say” lines below |');
md.push('| 2. Window | **Open the window** (10 min; you can choose 1–15) | The clock starts; the desk unlocks | “Ten minutes. Work out the rules.” |');
md.push('| 3. Crises | **Release now**, whenever you choose — or not at all | A full-screen alert with posts; prices jump | “Check your Risk Used.” |');
md.push('| 4. The bell | nothing: it settles itself at 0:00 (or **Ring the bell now**) | The desk locks; their own results appear | — |');
md.push('| 5. Results | read the Results card; then **Next** | Their own profit and loss, rate decisions, why prices moved | Name the biggest moves and why |', '');
md.push('**Crisis control is yours.** Every crisis is optional: release any, all or none, in any order, at any moment of the window. Only two rules: a second stage follows its first stage, and two crises follow another (the Concord Rescue follows the Run on the Dinar; the Grand Bargain follows the Reckoning). The round settles with whatever you released. A crisis released in the last 15 seconds gives the desk 30 more seconds.', '');
md.push('Controls during the window: **Pause** (orders are refused while paused), **+30 s**, **+2 min**, **Ring the bell now**.', '');
md.push('Times below are what the clock shows (it counts down from 10:00). They are suggestions.', '');
for (const r of ROUNDS) {
  const q = r.n;
  const sq = SCRIPT.quarters[q - 1]; const rs = RUNSHEET[q];
  md.push(`## Round 0${r.n} — ${r.name}`, '');
  md.push(`**Forecast:** ${ECONOMIES[sq.forecast.econ].name}’s ${FORECAST_VARS[sq.forecast.v].label} in the next release.${sq.auction ? ' **Round decision: the Verana Bond Auction** (bids on the Trade tab).' : ''}`, '');
  md.push('**Say:**', ...rs.say.map((s) => `- ${s}`), '');
  md.push(`**Crisis plan (all optional):** ${rs.plan}`, '');
  for (const c of sq.crises || []) {
    md.push(`**Crisis — ${c.title}** (${c.stages.length} stage${c.stages.length > 1 ? 's' : ''})${c.needs ? ` — follows “${sq.crises.flatMap((x) => x.stages).find((s) => s.id === c.needs)?.title}”` : ''}`);
    for (const [k, s] of c.stages.entries()) md.push(`- Stage ${k + 1}: *${s.title}* — “${s.headline}”`);
    if (rs.crises?.[c.id]) md.push(`- **Notes:** ${rs.crises[c.id]}`);
    md.push('');
  }
  md.push(`After the bell the round ends: its crisis rule changes, trading-cost rises and crisis multiplier end with it.`, '');
}
md.push('## After Round 06', '');
md.push('1. Press **Publish the final release (scores stay sealed)**. The last forecast is marked and every SPECULA Score is calculated. The Big Screen says the results are about to be revealed.');
md.push('2. When the hall is ready, press **Reveal the results**. The Big Screen shows the standings from last place to first, then the chart of every fund; each desk shows its own score and place.');
md.push('3. Console → **Debrief**: charts of each economy, every fund’s value, the auction bids against fair value (only you see who bid), and a short “what happened and why” for each round — read these out.');
md.push('4. Console → **Tools** → **Download backup**.', '');
md.push('## If something goes wrong', '');
md.push('| Problem | What to do |', '|---|---|');
md.push('| A team’s phone dies | Another member signs in on their own phone with the same fund code; the desk is shared, nothing is lost. |');
md.push('| The Wi-Fi drops | Desks show a red “Connection lost” bar and catch up by themselves. Orders already accepted are safe. If it is widespread, **Pause** the clock until it is back. |');
md.push('| A team says an order “didn’t go through” | Their **This round’s orders** list on the Trade tab shows every order that reached the market. If it is not there, it did not happen. |');
md.push('| A late order was refused | That is the rule: trades are accepted only while the window is open. |');
md.push('| A dispute over a score | After the reveal, open the team’s row in the console standings and show the working: every step is there. Before the reveal, the team can check its own numbers on its My score tab. Every price, result and score is calculated for all funds at the same moment; there is no judging and no appeal. |');
md.push('| The console laptop crashes or the page is reloaded mid-settlement | Open `/#/admin` on any device and sign in. If it shows **Finish settlement**, press it; the result is exactly the same. |');
md.push('| The projector shows the wrong thing | Reload `/#/display`. It always shows the current state. |');
md.push('| You pressed Release too early | It cannot be undone; carry on. The crisis effects are the same whenever in the window they happen. |');
md.push('| You need to restart after a rehearsal | Console → Tools → Reset everything (type RESET). |', '');
writeFileSync(new URL('../EVENT_HEAD_RUN_SHEET.md', import.meta.url), md.join('\n'));
console.log('Wrote EVENT_HEAD_RUN_SHEET.md');
