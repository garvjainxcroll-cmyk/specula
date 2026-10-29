# Putting Round 4 Control online (Netlify) — step by step

You do not need to be a programmer. Allow 20 minutes the first time.
This is a **separate site** from SPECULA. It needs a small server function and its own
storage, so use the **GitHub** method below (drag-and-drop cannot set up the server part).

---

## Step 0 — keep the repository private
The project contains the confidential sample assumptions. On GitHub, open the repository →
**Settings** → bottom of the page → **Change repository visibility** → **Private**.

## Step 1 — create the site
1. Go to https://app.netlify.com and sign in (you can sign in with GitHub).
2. **Add new project** → **Import an existing project** → **GitHub** → pick the repository.
3. **Branch to deploy:** the branch with this folder (for example `main` after merging).
4. **Base directory:** type `expansion`. This is the important step: it tells Netlify that this site lives in the `expansion` folder.
5. Leave the rest as Netlify fills it in (it reads `expansion/netlify.toml`):
   build command `npm run build`, publish directory `dist`, functions `netlify/functions`.
6. Before the first deploy, open **Site configuration → Environment variables** and add:
   - `JACO_SETUP_CODE` — any secret phrase you choose. Strongly recommended: without it, the first person to open the new site could create the first administrator account.
   - `JACO_TOKEN_SECRET` (optional) — a long random phrase used to sign sign-ins.
7. Click **Deploy**. Wait until it says **Published**.

Storage (Netlify Blobs) switches itself on. There is nothing else to set up.

## Step 2 — check it and create the first account
1. Open `https://YOUR-SITE.netlify.app/api/health`. You should see `{"ok":true,...}`.
   If you see "Page not found", the server function did not deploy: check the Base directory is `expansion`.
2. Open `https://YOUR-SITE.netlify.app/`. The first time it asks for the **setup code** (from step 1.6) and lets you create the **Super Administrator**. Write the password down safely.
3. Settings and Backup → **Accounts and permissions** → create an account for every member of the Event Control Team:
   - **Event Operator** for the people who type in auction results, deployments and compliance;
   - **Read-only Control Officer** for people who only check;
   - more **Super Administrators** only if needed.
4. Settings and Backup → **Event sessions** → create the **Official event** session, and a **Practice** session for rehearsals.

## Step 3 — before the event
1. In the official session: review Event Configuration, Team and Continent Setup, the CVs and the rules. Everything starts as fictional sample data.
2. Legal and Compliance Engine → **Rules**: review each rule, then **Approve** (official sessions start with every rule as a draft).
3. Event Configuration → **Visibility and lock** → **Lock the formulas**.
4. Rehearse the whole event in the practice session (Settings and Backup → Practice tools).

## On the day
- Every operator uses a laptop with the site open and signs in with their own account.
- The site saves every change on the server at once; a crashed laptop loses nothing — sign in on another device.
- After Round 2 is finalised: Reports and Exports → **Complete event archive**, and keep the file safe.
- Do not redeploy the site during the event.

## Running it on one computer (optional)
With Node.js 20 or later installed: open a terminal in this folder, run `npm install`, then `npm run dev`, and open http://localhost:8890. Data is kept in `.data/` on that computer.
