# Putting the market online (Netlify): step by step

You do not need to be a programmer. Allow 15 minutes the first time.

The website has two parts: the pages people see, and a small **server function** that keeps one shared market for everybody (prices, teams, loans, updates). Both deploy together on Netlify, and the data is stored for you by **Netlify Blobs**, which switches itself on.

---

## Way 1: drag and drop the zip (quickest)

1. Sign in at https://app.netlify.com first. **You must be signed in**: Netlify only builds the server for drops by signed-in users.
2. Click **Add new project** → **Deploy manually**, or open https://app.netlify.com/drop.
3. Drag **`market-netlify.zip`** onto the page. Do not unzip it.
4. Wait until it says **Published** (one to two minutes: Netlify installs, builds and starts the server).
5. Do the check in Step 3 below.

If you see a page saying **"The website is online, but its server did not start"**, Netlify published the files without building them. Use Way 2: it always works.

## Way 2: connect GitHub (most reliable)

1. Go to https://app.netlify.com → **Add new project** → **Import an existing project** → **GitHub**.
2. Pick the repository **garvjainxcroll-cmyk/specula**.
3. **Branch to deploy:** the branch with this market (for example `main` after merging, or `claude/quirky-cannon-qzqjtr`).
4. **Base directory:** type **`broker`**. This matters: the market lives in the `broker` folder.
5. Leave everything else as Netlify fills it in. It comes from `broker/netlify.toml`: build command `npm run build`, publish directory `dist`, functions `netlify/functions`.
6. Click **Deploy**.

> This is a separate Netlify project from SPECULA. Keep the repository **private** if it also holds the SPECULA secret script.

---

## Step 3: check it is live

1. Open `https://YOUR-SITE.netlify.app/api/health`. You should see `{"ok":true,"storage":"blobs",...}`.
2. Open `https://YOUR-SITE.netlify.app/#/host`. The first time, it asks you to **choose the host password** (at least 6 characters). **Do this before you share the link**, because the first person to open this page chooses the password. Write it down.
   - Alternative: in Netlify → **Project configuration → Environment variables**, add `HOST_PASSWORD` with your password, then redeploy (Way 1: drag the zip onto the **Deploys** page again; Way 2: **Deploys → Trigger deploy**). That password then always works.
   - **If the console asks you to sign in with a password you never chose**, someone opened it before you, or you forgot yours. Set `HOST_PASSWORD` as above, redeploy, and sign in once with it: it then replaces the old password for good and signs everyone else out of the console.
3. Open `https://YOUR-SITE.netlify.app/` on a phone: you see the Home page. **Team Desk** asks for a team code.

## The links

| Who | Link |
|---|---|
| Everyone (Home, How to Play) | `https://YOUR-SITE.netlify.app/` |
| Teams | `https://YOUR-SITE.netlify.app/#/desk` (with their team code) |
| The projector | `https://YOUR-SITE.netlify.app/#/display` (press F11 for full screen) |
| You, the host | `https://YOUR-SITE.netlify.app/#/host` |

Never share the host password. Give each team only its own code.

---

## A rehearsal (the day before, 15 minutes)

1. Console → **Game**: type a name (or leave it empty), set **Number of teams** to 3, press **Save teams and make codes**.
2. On two phones, open Team Desk and join two different teams with their codes. On a laptop, open the Big Screen: it shows the teams signing in.
3. Console → **Start the game** with a 5-minute session. The clock appears on the desks and the Big Screen.
4. Buy a stock on one phone. Console → **Market**: press **−10%** on that stock: the phone's money drops at once.
5. Console → **Loans**: send ₹10,000 from one team to the other at 10% with a deadline of **1 minute**. Both phones get a notice now, and another when it is repaid.
6. Console → **Updates**: post a test update. It appears on both phones and the Big Screen, numbered.
7. Console → **Game** → **End the game**, then **Reveal the results**: the Big Screen shows the standings.
8. Console → **Tools** → **New game (keep the teams)** (type `RESET`). Every team is back to ₹10,00,000 with the same codes. Or **Delete everything** to start from scratch.
9. Look at **Usage** in Netlify. Every open screen asks the server for prices about once every 1.5 seconds, so a two-hour event with 50 devices makes roughly 250,000 requests. Check this fits your Netlify plan.

## On the day

- **Before people arrive:** create the game and the teams, print the codes (Game → **Print**), and put the Big Screen on the projector. Teams can join while the game waits in the lobby; prices are paused and no orders can be placed until you start the game.
- Hand each team its code privately. Members join at Team Desk with the code and their name.
- Press **Start the game**. **Close the market** pauses everything; **Open the market** carries on (with a new session length if you like).
- If a code leaks: Game → **New code** for that team. Everyone signed in to that team is signed out at once and joins again with the new code. To sign out just one person: Dataset → click the team → **Sign out** next to their name. Signed-out people stay in the Dataset and its CSV, marked as signed out.
- If your laptop crashes: open `/#/host` on any device and sign in. Nothing is lost; everything is stored online. Every device on the hall Wi-Fi shares one count of wrong host passwords (ten in any ten minutes), so if a player has used them up, sign in over mobile data or wait a few minutes. Keeping the console signed in on a second device avoids this.
- At the end: **End the game**, then **Reveal the results**. In Dataset, press **Download CSV** in each of its three lists (teams, everyone who joined, loans) to keep a copy of everything.

## Running it without Netlify (one Wi-Fi network)

On a laptop with Node.js 20 or later installed: open a terminal in the unzipped folder and run `npm install`, then `npm run dev`. The market runs at `http://localhost:8888`. Others on the same Wi-Fi open `http://<this laptop's address>:8888`. Everything is saved in the `.data` folder. Forgot the host password? Stop the server (Ctrl+C) and start it again with the new password, then sign in once with it (after that, plain `npm run dev` keeps it):
  - Mac or Linux: `HOST_PASSWORD=yournewpassword npm run dev`
  - Windows PowerShell (the usual Windows terminal): `$env:HOST_PASSWORD="yournewpassword"; npm run dev`
  - Windows Command Prompt: `set HOST_PASSWORD=yournewpassword` and then `npm run dev`

## Updating the site later

With Way 2, Netlify redeploys by itself whenever the branch changes. With Way 1, drag a new zip onto the **Deploys** page. **Do not redeploy during the event.** Redeploying does not lose data: it is stored in Netlify Blobs, not in the files.
