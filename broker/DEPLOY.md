# Putting the market online (Netlify): step by step

You do not need to be a programmer. Allow 15 minutes the first time.

The website has two parts: the pages people see, and a small **server function** that keeps one shared market for everybody (prices, accounts, loans, updates). Both deploy together on Netlify, and the data is stored for you by **Netlify Blobs**, which switches itself on.

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
   - Alternative: in Netlify → **Project configuration → Environment variables**, add `HOST_PASSWORD` with your password, then redeploy. That password then always works.
3. Open `https://YOUR-SITE.netlify.app/` on a phone: you see the sign-in page.

## The two links

| Who | Link |
|---|---|
| Investors (everyone playing) | `https://YOUR-SITE.netlify.app/` |
| You, the host | `https://YOUR-SITE.netlify.app/#/host` |

Never share the host link's password.

---

## A rehearsal (the day before, 10 minutes)

1. Host console → **Open market**.
2. On two phones, create two accounts on the sign-in page. Each starts with ₹10,00,000.
3. Buy a stock on one phone. On the console, press **−10%** on that stock: the phone's money drops at once.
4. Console → **Loans**: send ₹10,000 from one phone's account to the other at 10% with a deadline of **1 minute**. Both phones get a notice now, and another when it is repaid.
5. Console → **Updates**: post a test update. It appears on both phones, numbered.
6. Console → **Settings** → **New game** (type `RESET`) to give everyone ₹10,00,000 again before the real event. Accounts are kept.
7. After the rehearsal, look at **Usage** in Netlify. Every open screen asks the server for prices about once every 1.5 seconds, so a two-hour event with 50 players makes roughly 250,000 requests. Check this fits your Netlify plan.

## On the day

- **Before people arrive:** Settings → **New game**, and keep the market **closed** (prices are paused, orders refused).
- Share the investors' link. People sign up with their name, email, phone and school or team.
- Press **Open market** to start. **Close market** pauses everything; open it again to continue.
- If your laptop crashes: open `/#/host` on any device and sign in. Nothing is lost; everything is stored online.
- At the end: **Dataset** → **Download CSV** keeps a copy of every investor and every loan.

## Running it without Netlify (one Wi-Fi network)

On a laptop with Node.js 20 or later installed: open a terminal in the unzipped folder and run `npm install`, then `npm run dev`. The market runs at `http://localhost:8888`. Others on the same Wi-Fi open `http://<this laptop's address>:8888`. Everything is saved in the `.data` folder.

## Updating the site later

With Way 2, Netlify redeploys by itself whenever the branch changes. With Way 1, drag a new zip onto the **Deploys** page. **Do not redeploy during the event.** Redeploying does not lose data: it is stored in Netlify Blobs, not in the files.
