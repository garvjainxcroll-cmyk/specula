# Putting the live stock game online (Netlify)

You do not need to be a programmer. Allow 15 minutes the first time.

The live game has three addresses on one website:

| Address | Who opens it |
|---|---|
| `https://YOUR-SITE.netlify.app/` | Every team, on phones or laptops. They join with the PIN and a team name. |
| `https://YOUR-SITE.netlify.app/screen` | The projector. No sign-in. Shows the join PIN, the news, the countdown and the prices. |
| `https://YOUR-SITE.netlify.app/desk` | You, the Event Head. Sign in with the **game key**. |

## The game key

The 45 updates, the price effects and the reasons are inside the site **sealed** (encrypted). Nobody can read them, not even from the code, until you sign in to `/desk` with the game key. The key was given to you privately (it looks like `XXXX-XXXX-XXXX-XXXX`). Keep it like a password. It is not written anywhere in this repository.

## Why not drag and drop

A live game needs a small server (a Netlify *function*) that every team's phone talks to. Netlify only builds functions when the site is connected to GitHub (or deployed with its command-line tool). Drag-and-drop uploads only plain pages, so teams could not play together. Use the GitHub way below.

---

## Step 1: deploy from GitHub

1. Go to https://app.netlify.com and sign in (you can sign in with GitHub).
2. Click **Add new project** (it may say **Add new site**) → **Import an existing project** → **GitHub**.
3. Pick the repository **garvjainxcroll-cmyk/specula** (allow Netlify to see it if it asks).
4. **Branch to deploy:** the branch with the stock game (`claude/affectionate-cerf-or21gw`, or `main` after you merge it).
5. **Base directory:** type `stockgame`. This is the one setting that matters: it tells Netlify to deploy the stock game, not SPECULA.
6. Leave everything else as Netlify fills it in. It reads `stockgame/netlify.toml`:
   - Build command: `node live/build.mjs`
   - Publish directory: `live/dist`
   - Functions directory: `live/netlify/functions`
7. Click **Deploy**. Wait one or two minutes until it says **Published**.
8. Optional: under **Domain management** give the site a short name, for example `jaco-market.netlify.app`. Teams will type it, so short is better.

Storage (Netlify Blobs) switches itself on. There is nothing to set up.

### Without GitHub (someone comfortable with a terminal)
Unzip `jaco-stock-game-netlify.zip`, open a terminal in that folder, then:

```bash
npm install
```

```bash
npx netlify-cli deploy --build --prod
```

It asks you to log in to Netlify and to create or pick a site.

---

## Step 2: check it is live

1. Open `https://YOUR-SITE.netlify.app/api/health`. You should see `{"ok":true,"storage":"blobs",...}`. If you see "Page not found", the function did not deploy: check the Base directory is `stockgame` and redeploy.
2. Open `/desk` and sign in with the game key. The first sign-in opens the sealed game on the server; after that the same key works from any device.
3. Open `/screen` on the projector laptop. It shows the address and the join PIN.
4. Open the site on a phone and join with the PIN.

## Step 3: a dress rehearsal (the day before, 15 minutes)

1. Join with two or three test teams on phones and a laptop. On one phone, use **I have a team code** with a code from another device of the same team.
2. On the desk press **Release news**. Check the story appears on every phone and on the big screen by itself, and that the phones say **Market open** with a countdown.
3. Buy on one phone, **Sell / Short** on another, and place a limit order.
4. Press **Move prices** (it asks first if the window is still running). Check the prices change everywhere, the market says **Closed**, and the limit order filled if the price reached it.
5. Teams tab: the standings are there. Try **Show standings** and **Reveal next place** on the big screen.
6. Guide tab → **Start over** (type `RESET`). This removes the test teams and gives a new PIN.
7. In Netlify, look at **Usage** after the rehearsal. Each open app asks the server for news about every 4 seconds, so a full event with 30 teams over three hours is roughly 100,000 requests. If your plan is close to its limit, upgrade for that month or ask teams to keep one or two devices open each.

## On the day

- Projector: `/screen`, full screen (F11), sleep turned off.
- Your laptop: `/desk`, plugged in.
- Teams: the site address and the PIN (both on the big screen).
- When every team is in, **close joining** on the Teams tab.
- Wi-Fi: test it in the hall. Mobile data works as a backup on phones.
- If your laptop crashes: open `/desk` on any device and sign in with the game key. The game lives on the server, so nothing is lost.
- If a team loses its phone: its team code (Teams tab) signs it in on any device.
- After the event: Teams tab → **Download a backup of every account**.

**Do not redeploy during the event.** A redeploy keeps the game and the teams (they are stored in Netlify Blobs), but there is no reason to risk it.

## Changing the game later

The updates and their effects are sealed into `stockgame/live/server/game-sealed.mjs` from the secret data (see `README.md`). To change a story or a price effect, edit the secret data on the computer that has it, run `node stockgame/live/seal.mjs`, commit the new sealed file, and Netlify redeploys. Do this before the event, then press **Start over** on the desk.
