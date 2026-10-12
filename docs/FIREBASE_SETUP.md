# Firebase setup: end to end (free Spark plan)

This walks you from an empty Google account to the app running locally against your real Firebase project, ready for Vercel. Allow about 20 minutes. **No billing is needed.** The app runs entirely on the free **Spark** plan: Auth, Firestore and the Admin SDK. Image attachments are stored in Firestore itself, so there's **no Cloud Storage bucket** (that would require the Blaze plan).

You'll end up with 9 values for `.env.local` (and later for Vercel). They're collected in **Step 7**.

---

## Step 1: Create the project
1. Go to <https://console.firebase.google.com> → **Create a project**.
2. Name it, e.g. `sprint-task-manager`. Note the **Project ID** shown under the name (e.g. `sprint-task-manager-a1b2c`).
3. Google Analytics: optional. The app doesn't use it.
4. Stay on the **Spark (free)** plan. Don't upgrade.

## Step 2: Register the web app (gives the 6 public values)
1. Project Overview → **</>** (Web) icon → app nickname `web` → **Register app**. Leave Firebase Hosting unchecked; we deploy to Vercel.
2. Copy the `firebaseConfig` values shown:

| firebaseConfig key | env var |
|---|---|
| `apiKey` | `NEXT_PUBLIC_FIREBASE_API_KEY` |
| `authDomain` | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `storageBucket` | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` (not used by the app; fill it in anyway) |
| `messagingSenderId` | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `NEXT_PUBLIC_FIREBASE_APP_ID` |

These are safe to expose in the browser. Security comes from the rules, not from hiding these.

## Step 3: Enable Email/Password sign-in
1. Build → **Authentication** → **Get started**.
2. **Sign-in method** tab → **Email/Password** → enable the first toggle only (leave "Email link" off) → Save.
3. **Settings** tab → **User actions**: turn **off** "Enable create (sign-up)". There's no sign-up page, and this also blocks sign-up through the raw API. Admins create users via the Admin SDK, which this setting doesn't affect.
4. **Settings** tab → **Authorized domains**: `localhost` is already there. After deploying, add your Vercel domain (Step 10).
5. Optional: **Templates** tab → **Password reset**. This is the email sent by "Forgot password?" and works fine as-is. If you like, click the ✏️ pencil to:
   - set **Sender name** to e.g. `Sprint Task Manager` (otherwise it's `noreply`),
   - edit the **Subject** / message text.

   Leave the **From** address, **Reply-to** and **Action URL** at their defaults; Firebase hosts the reset page. Changing the From domain requires DNS setup, so skip that.

## Step 4: Create the Firestore database
1. Build → **Firestore Database** → **Create database**.
2. Edition: **Standard**. Database ID: leave as `(default)`.
3. **Location**: pick the region closest to your team (e.g. `asia-south1` Mumbai, `europe-west1`, `us-central1`). **This can't be changed later.**
4. Start in **production mode**. Our rules replace the defaults in Step 6.

> Skip **Storage** in the console entirely. It isn't used.

## Step 5: Service account key (gives the 3 server-only values)
1. ⚙️ **Project settings** → **Service accounts** → **Generate new private key** → **Generate key**. A JSON file downloads.
2. From that JSON:

| JSON field | env var |
|---|---|
| `project_id` | `FIREBASE_ADMIN_PROJECT_ID` |
| `client_email` | `FIREBASE_ADMIN_CLIENT_EMAIL` |
| `private_key` | `FIREBASE_ADMIN_PRIVATE_KEY` |

3. **Treat this file like a password.** Never commit it (`.gitignore` already covers `.env*`). Delete the downloaded JSON once the values are saved.
4. For `FIREBASE_ADMIN_PRIVATE_KEY`, paste the value on **one line, in double quotes, keeping the `\n` sequences** exactly as they appear in the JSON:
   ```
   FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
   ```

## Step 6: Deploy security rules and indexes
From the project folder:
```bash
npx firebase login                      # opens a browser once
npx firebase use --add                  # pick your project, alias it "prod"
npx firebase deploy --only firestore:rules,firestore:indexes
```
- Indexes take a few minutes to build. Check under Firestore → Indexes.
- Shortcut once `.env.local` is filled in (Step 7): `npm run check-env` validates the values without printing them, and `npm run deploy:firestore` publishes the **rules** using the Admin key, no login needed. Creating **indexes** needs your own account (the CLI command above), because the Admin key isn't allowed to create indexes.
- `firebase use --add` writes your project into `.firebaserc`. The `default` alias stays `demo-sprint-manager` for the emulators.

## Step 7: Fill in `.env.local`
```bash
cp .env.example .env.local
```
Fill in the 9 values from Steps 2 and 5 and set:
```
NEXT_PUBLIC_USE_EMULATORS=false
```
(`.env.local` currently holds emulator settings. The same values are kept in `.env.emulator`, so `cp .env.emulator .env.local` switches back.)

## Step 8: Create your first Admin
There's no sign-up page, so bootstrap yourself:
```bash
npx tsx scripts/create-admin.ts --email you@company.com --password "a-strong-password" --name "Your Name"
```
It should print `Target: project <your-project-id>`. Running it again for an existing email just promotes that user to Admin.

## Step 9: Run locally against Firebase
```bash
npm run dev
```
Open <http://localhost:3000>, sign in, then as Admin:
1. **Admin → App Types**: add your 3 products (name, short code, color).
2. **Admin → Modules**: add modules under each product.
3. **Admin → Users**: add your QA and developers (each gets the initial password you set).
4. A QA/Admin creates a sprint on **Sprints** and starts it.

## Step 10: After deploying to Vercel
1. Vercel → Project → Settings → **Environment Variables**: add all 9 variables (Production + Preview). Paste `FIREBASE_ADMIN_PRIVATE_KEY` **without** the surrounding quotes but **with** the `\n` sequences. The app converts `\n` back to newlines. Don't add `NEXT_PUBLIC_USE_EMULATORS` (or set it to `false`).
2. Firebase → Authentication → Settings → **Authorized domains** → add `your-app.vercel.app` (and any custom domain). Without this, password-reset links and sign-in from that domain are blocked.

## Free-plan limits to know about
Spark is generous for a team tool, but it's worth knowing the ceilings (daily quotas reset at midnight Pacific time):

| Resource | Free limit | What uses it |
|---|---|---|
| Firestore storage | 1 GiB | Tasks, comments, activity, and **attachments** (~0.3–0.5 MB per compressed screenshot ≈ 2,000+ screenshots) |
| Document reads | 50,000 / day | Opening sprints, live updates, opening an image in the lightbox (thumbnails are free, since they're part of the attachment list) |
| Document writes | 20,000 / day | Edits, comments, uploads, presence heartbeats (one per open tab every 30s) |
| Auth users | Unlimited (email/password) | |

If you ever hit a limit, the app keeps working from its local cache until the quota resets. Usage is under Firestore → **Usage**.

## Troubleshooting
| Symptom | Fix |
|---|---|
| "Missing or insufficient permissions" everywhere | Rules not deployed (Step 6), or your `users/{uid}` doc is missing or `active: false`. Re-run `create-admin`. |
| Signed in but immediately signed out with "account is not set up" | The Auth user exists but has no `users/{uid}` doc. Create users from Admin → Users or `create-admin`, not the Firebase console. |
| Admin API returns 500 "Missing Firebase Admin credentials" | One of `FIREBASE_ADMIN_*` is empty, or the private key lost its `\n` / quotes. |
| A query error mentions "requires an index" | Indexes are still building or weren't deployed: `npx firebase deploy --only firestore:indexes`. |
| An upload fails with "still larger than 2.5 MB after compression" | Only happens with large animated GIFs (they can't be recompressed). Use a shorter GIF or a PNG/JPG screenshot. |
| Password reset email never arrives | Check spam; make sure the domain is authorized (Step 10). |
