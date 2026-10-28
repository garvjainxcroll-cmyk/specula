# Putting Artha Vyūha online — step by step

You do not need to be a programmer. Allow 20 minutes the first time. It works the same way as SPECULA: one website plus one small server function on Netlify, with the game stored in Netlify Blobs.

---

## Step 1 — deploy on Netlify (connect GitHub)

The poker game lives in the **`poker` folder** of the `specula` repository, so you tell Netlify to look in that folder.

1. Go to https://app.netlify.com and sign in.
2. **Add new project** (or **Add new site**) → **Import an existing project** → **GitHub** → pick **garvjainxcroll-cmyk/specula**.
3. **Branch to deploy:** the branch with the poker game (for example `claude/modest-feynman-rvofyb`, or `main` after you merge it).
4. **Base directory:** type `poker`. This is the important one. Leave the rest as Netlify fills it in from `poker/netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist` (Netlify shows `poker/dist`)
   - Functions directory: `netlify/functions`
5. Click **Deploy**. Wait one to two minutes until it says **Published**.
6. Optional: under **Domain management** give it a name, such as `artha-vyuha.netlify.app`.

This makes a **second Netlify project**, separate from SPECULA. SPECULA is not changed.

## Step 2 — check it is live

1. Open `https://YOUR-SITE.netlify.app/api/health`. You should see `{"ok":true,"app":"artha",...}`.
   If you see “Page not found”, the server function did not deploy: check the **Base directory** is `poker` and redeploy.
2. Open `https://YOUR-SITE.netlify.app/#/host`. The first time, it asks you to **choose the Event Head password** (at least 6 characters). Write it down.
   - Alternative: in Netlify → **Project configuration → Environment variables**, add `ARTHA_ADMIN_PASSWORD`, then redeploy. That password then always works.
3. Open `https://YOUR-SITE.netlify.app/#/lobby` on a phone: you should see the lobby.

## Step 3 — a dress rehearsal (the day before, 15 minutes)

1. Event Head desk → **New game** → *Cash-style table* → name it, blinds 10/20, 9 seats → **Open the table**. Note its code.
2. On two phones: open the lobby → **Join by code** → **Sit here** → choose a name → **Sit down**. Play a few hands.
3. On the projector laptop: Event Head desk → **Tables** → **Big Screen** (or `/#/screen/CODE`). Press F11 for full screen. Check that no player’s cards are visible until a showdown.
4. Turn one phone’s Wi-Fi off for 20 seconds, then on: the red bar appears, then the table catches up. Its seat and chips are still there. (If it was that phone’s turn, it checked or folded when its clock ran out.)
5. On one phone press **Leave table**: the chips go back to that account (the chip count in the top bar).
6. Event Head desk → **Chip audit**: all four lines should say **Balanced**.
7. Try a tournament: **New game** → *Tournament* → put **3** in “Test bots” → **Create the tournament**. Register from a phone (Lobby → Register). In **Tables → Manage** press **Start the tournament**. Use **Next level now** and **Pause** to see them work.
8. **Tools → Reset everything** (type `RESET`). Tick “keep accounts” only if players should keep their names and chips.
9. In Netlify, look at **Usage** after the rehearsal (see “How much does it use?” below).

## On the day

- Event Head laptop: `/#/host`, plugged in. Projector: the Big Screen of the main table or the tournament, full screen, sleep turned off.
- Players: the lobby on their phones. Give out the table or tournament code (it is also on the Big Screen).
- For a tournament: create it, let everyone register, then **Start**. Players are seated automatically and moved between tables to keep them even. The blinds rise on the clock; **Pause**, **Next level now** and **+2 minutes** are in **Manage**.
- If something goes wrong in a hand (a crash, a dispute): **Manage → Cancel this hand** gives everyone back what they started the hand with. Use it sparingly.
- If the Event Head laptop crashes: open `/#/host` on any device and sign in. Everything is stored on the server.
- After the event: **Tools → Download backup** keeps every result and hand history.

## How much does it use?

Phones at a table ask the server for news about once a second during a hand (less often otherwise). Each ask is one Netlify function call. A rough guide: **30 players for 2 hours ≈ 150,000–200,000 calls**. Netlify plans have monthly limits, so check **Usage** after the rehearsal and compare with your plan. If you expect a very large event, the option below has no per-call cost.

## The other way: drag and drop the zip

`artha-vyuha-netlify.zip` (made with `npm run zip`) is the finished website plus its server function in one file. Nothing needs building.

1. Sign in to Netlify **first**.
2. **Add new project** → **Deploy manually** (drag and drop), or open an existing project's **Deploys** page.
3. Drag the zip file onto it (do not unzip it). Wait until it says **Published**.
4. Do the check in Step 2: open `/api/health`.
   - `{"ok":true,"app":"artha",...}` → the live game works. Carry on with Step 2.
   - “Page not found” → drag-and-drop did not set up the server function on your account. The site still opens, but shows **Single device** (practice only). Use Step 1 (connect GitHub) instead; that way always works.
5. To update later, drag the new zip onto the same project's **Deploys** page. Your games and accounts stay (they are stored in Netlify Blobs, not in the zip).

## The other way: any Node.js host (instant updates)

The same project can run as an ordinary server. Tables then update instantly (the server pushes changes) and time-outs happen on the dot. Services such as Render, Railway or Fly.io can run it:

- Root / base directory: `poker`
- Build command: `npm install`
- Start command: `npm start`
- Settings: `PORT` (the service usually sets it), `ARTHA_ADMIN_PASSWORD` (optional), and `ARTHA_DATA_DIR` pointing to a **persistent disk** (otherwise the games are lost when the service restarts).

## It says “Single device”

A gold bar saying **Single device mode** means the website cannot reach its server (`/api/...`). Practice against bots still works on that device, but people cannot play together. Fixes, in order:
1. Was it drag-and-drop? Use “connect GitHub” (Step 1); it always sets up the function.
2. Is the **Base directory** `poker`? Without it Netlify builds SPECULA instead.
3. Open `/api/health` again after the deploy finishes. It must show `"app":"artha"`.

## Updating the site later

When the code on GitHub changes, Netlify rebuilds by itself. **Do not redeploy during the event.**
