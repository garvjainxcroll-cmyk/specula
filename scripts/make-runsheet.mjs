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
md.push('> **SECRET.** This sheet contains every crisis. Print it for yourself only; never put it on the projector. The console (`/#/admin`) shows the same notes for the current quarter.', '');
md.push('## Before the hall fills', '');
md.push('1. Console `/#/admin` open on your laptop (plugged in). Projector on `/#/display`, full screen (F11).');
md.push('2. Console → **Funds**: one line per team → **Save funds and make codes** → **Print** the codes and hand each team its own code, privately.');
md.push('3. Teams open `/#/desk` on their phones and join with the code. The Big Screen shows how many members each fund has signed in.');
md.push('4. While they wait, tell them to read **How to Play** or try **Practice** (two made-up quarters, on their own phone).');
md.push('5. When every fund has at least one member signed in: **Start the game**. (Funds cannot be changed after this.)', '');
md.push('## Every quarter, the same rhythm (about 2½ minutes)', '');
md.push('| Step | You press | Teams see | You say |', '|---|---|---|---|');
md.push('| 1. Data drop | (it appears when you press Next) | The new figures, headlines and forecast question | The “say” lines below |');
md.push('| 2. Window | **Open the window** (2:00) | The clock starts; the desk unlocks | “Two minutes. Work out the rules.” |');
md.push('| 3. Crisis | **Release now** at the time given below | A full-screen alert with posts; prices jump | “Check your Risk Used.” |');
md.push('| 4. The bell | nothing: it settles itself at 0:00 (or **Ring the bell now**) | The desk locks; results appear | — |');
md.push('| 5. Results | read the Results card; then **Next** | Profit and loss, rate decisions, why prices moved, standings | Name the biggest moves and why |', '');
md.push('Controls during the window: **Pause** (orders are refused while paused), **+30 s**, **Ring the bell now**. A quarter cannot settle until its crisis has been released; if you release it after the bell, the desk reopens for 30 seconds.', '');
for (const r of ROUNDS) {
  md.push(`## Round 0${r.n} — ${r.name}`, '');
  for (const q of r.quarters) {
    const sq = SCRIPT.quarters[q - 1]; const rs = RUNSHEET[q];
    md.push(`### Quarter ${q}`, '');
    md.push(`**Forecast:** ${ECONOMIES[sq.forecast.econ].name}’s ${FORECAST_VARS[sq.forecast.v].label} in the next release.${sq.auction ? ' **Round decision: the Verana Bond Auction** (bids on the Trade tab).' : ''}`, '');
    md.push('**Say:**', ...rs.say.map((s) => `- ${s}`), '');
    for (const c of sq.crises || []) {
      md.push(`**Crisis — ${c.title}** (${c.stages.length} stage${c.stages.length > 1 ? 's' : ''})`);
      for (const [k, s] of c.stages.entries()) md.push(`- Stage ${k + 1}: *${s.title}* — “${s.headline}”`);
      md.push(`- **When to release:** ${rs.fire}`, '');
    }
  }
  md.push(`After Q${r.quarters[3]}: the round ends. Crisis rule changes, trading-cost rises and the crisis multiplier from this round end with it.`, '');
}
md.push('## After Quarter 24', '');
md.push('1. Press **Publish the final release and scores**. The last forecast is marked and the SPECULA Scores appear on every screen; the Big Screen shows the podium.');
md.push('2. Console → **Debrief**: charts of each economy, every fund’s value, the auction bids against fair value, and a short “what happened and why” for each round — read these out.');
md.push('3. Console → **Tools** → **Download backup**.', '');
md.push('## If something goes wrong', '');
md.push('| Problem | What to do |', '|---|---|');
md.push('| A team’s phone dies | Another member signs in on their own phone with the same fund code; the desk is shared, nothing is lost. |');
md.push('| The Wi-Fi drops | Desks show a red “Connection lost” bar and catch up by themselves. Orders already accepted are safe. If it is widespread, **Pause** the clock until it is back. |');
md.push('| A team says an order “didn’t go through” | Their **This quarter’s orders** list on the Trade tab shows every order that reached the market. If it is not there, it did not happen. |');
md.push('| A late order was refused | That is the rule: trades are accepted only while the window is open. |');
md.push('| A dispute over a score | Open the team’s score (Score tab → their row) and show the working: every step is there. Every price, result and score is calculated for all funds at the same moment; there is no judging and no appeal. |');
md.push('| The console laptop crashes or the page is reloaded mid-settlement | Open `/#/admin` on any device and sign in. If it shows **Finish settlement**, press it; the result is exactly the same. |');
md.push('| The projector shows the wrong thing | Reload `/#/display`. It always shows the current state. |');
md.push('| You pressed Release too early | It cannot be undone; carry on. The crisis effects are the same whenever in the window they happen. |');
md.push('| You need to restart after a rehearsal | Console → Tools → Reset everything (type RESET). |', '');
writeFileSync(new URL('../EVENT_HEAD_RUN_SHEET.md', import.meta.url), md.join('\n'));
console.log('Wrote EVENT_HEAD_RUN_SHEET.md');
