# Putting SPECULA online (Netlify) — step by step

You do not need to be a programmer. Allow 20 minutes the first time.

---

## Step 0 — make the GitHub repository private (do this first)

The code includes the **secret script**: every crisis, every headline and the run sheet. If the repository is public, a student could read it before the event.

1. Open https://github.com/garvjainxcroll-cmyk/specula
2. Click **Settings** (top right of the repository page).
3. Scroll right to the bottom, to **Danger Zone** → **Change repository visibility** → **Change to private** → confirm.

Netlify can still deploy a private repository.

---

## Step 1 — deploy (the recommended way: connect GitHub)

This is the most reliable way, because Netlify builds the site **and** the live-game server function for you.

1. Go to https://app.netlify.com and sign in (you can sign in with GitHub).
2. Click **Add new project** (it may say **Add new site**) → **Import an existing project** → **GitHub**.
3. Allow Netlify to see the `specula` repository if it asks, then pick **garvjainxcroll-cmyk/specula**.
4. **Branch to deploy:** choose the branch with the finished game (for example `main` after you merge, or `claude/specula-website-build-cess7i`).
5. Leave the build settings as Netlify fills them in. They come from the `netlify.toml` file in the project:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
6. Click **Deploy**. Wait about one to two minutes until it says **Published**.
7. Optional: under **Domain management** give the site a friendly name, such as `specula-copia.netlify.app`.

Storage (Netlify Blobs) switches itself on. There is nothing to set up.

### The other way: drag and drop
VINCERE was dragged and dropped. SPECULA needs a small server function as well as web pages, and drag-and-drop does not always set that up. If you want to try it:
1. Sign in to Netlify **first**.
2. Drag `specula-netlify.zip` (made with `npm run zip`, or downloaded from this repository) onto the **Deploys** page of your project, or onto https://app.netlify.com/drop.
3. Do the check in Step 2. If it says **Single device**, use the GitHub way above instead. The GitHub way always works.

---

## Step 2 — check it is live

1. Open `https://YOUR-SITE.netlify.app/api/health`. You should see something like
   `{"ok":true,"storage":"blobs",...}`
   - If you see that: the live game works.
   - If you see a “Page not found” page, the server function did not deploy. See “It says Single device” below.
2. Open `https://YOUR-SITE.netlify.app/#/admin`. The first time, it asks you to **choose the Event Head password** (at least 6 characters). Write it down. Only someone with this password can run the game.
   - Alternative: in Netlify go to **Project configuration → Environment variables**, add `SPECULA_ADMIN_PASSWORD` with your password, and redeploy. That password then always works, and the first-visit setup is skipped.
3. Open `https://YOUR-SITE.netlify.app/#/display` on the projector laptop: it shows the join screen.
4. Open `https://YOUR-SITE.netlify.app/#/desk` on a phone: it asks for a fund code.

---

## It says “Single device”

The page shows a gold bar saying **Single device mode** when the website cannot reach its live-game server (`/api/...`). How to Play and Practice still work, but teams cannot trade together.

Work through these in order:
1. **Was it a drag-and-drop?** Re-deploy using “connect GitHub” (Step 1). That is the fix in almost every case.
2. In Netlify open your project → **Logs** (or **Functions**). There should be a function called **store**. If it is missing, the build did not run. Check the **Deploys** log for a red error and that the publish directory is `dist`.
3. Open `/api/health` again after the deploy finishes. It must show `"ok":true`.
4. Still stuck? Deploy log errors almost always mean the build command or publish directory was changed. Put them back to `npm run build` and `dist`.

---

## Step 3 — a dress rehearsal (the day before, 15 minutes)

1. On the console (`/#/admin`) → **Funds**, type three test fund names → **Save funds and make codes**.
2. On two phones and one laptop, join with those codes (`/#/desk`).
3. Put `/#/display` on the projector. Press F11 for full screen.
4. **Start the game** → choose **2 min** next to **Open the window** (shorter for a rehearsal; the real game uses 10 min) → **Open the window** → trade on the phones → **Ring the bell now** → check the Results tab on a phone → **Next**.
5. In Round 02: release a crisis from **Crisis control** and check the takeover appears on every screen. (Crises are optional — in the real game you choose which to release, and when.)
6. Check that a phone's **My score** tab shows only its own fund, and that the Big Screen shows no standings.
   Try a trade without a trading note (the button stays grey), then with one. On a phone, ask for a loan (Fund tab); approve it in console → **Funds**; add ₹100 Cr of capital to another fund. Open console → **Notes** to read the notes.
7. Turn a phone’s Wi-Fi off for 20 seconds, then on again: the red bar appears, then the desk catches up.
8. Console → **Tools** → **Reset everything** (type `RESET`). Tick “keep the same funds” only if you want to reuse the codes.
9. Check **Usage** in Netlify after the rehearsal to see what one game uses. A full event needs a few tens of thousands of function calls; check this against your plan.

## On the day

- Laptop for the console: `/#/admin`, plugged in.
- Projector: `/#/display`, full screen, plugged in, sleep turned off.
- Teams: `/#/desk` on their phones. Hand out each fund code privately.
- Wi-Fi: test it in the hall. Every device needs internet access. Mobile data is a fine backup for a phone.
- If the console laptop crashes: open `/#/admin` on any device and sign in. The game is stored on the server, so nothing is lost. If it shows **Finish settlement**, press it.
- After the event: console → **Tools** → **Download backup** keeps a copy of every result.

## Updating the site later
If you change the code on GitHub, Netlify rebuilds and redeploys by itself. **Do not redeploy during the event.**
