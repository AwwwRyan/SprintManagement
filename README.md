# Sprint Task Manager

An internal, real-time, sprint-based task manager for teams shipping several products. QA creates sprints and logs requirements, bugs and enhancements. Developers and QA work them in a shared spreadsheet-style table that updates live across every open tab (Notion-like). When a sprint closes, unfinished tasks carry forward with their ID, comments, attachments and history intact.

**Stack:** Next.js 15 (App Router, TypeScript strict) · Firebase Auth + Firestore on the free Spark plan (no Cloud Storage: attachments are stored in Firestore) · Admin SDK in Route Handlers · Tailwind v4 + shadcn/ui · TanStack Table v8 · Tiptap · Recharts · react-hook-form + zod.

## Features
- Email/password sign-in with no sign-up; Admins create users. Deactivated users are kicked out in real time.
- Roles: **Admin**, **QA**, **Developer**, enforced in the UI **and** in Firestore security rules. Everyone can edit any task in an open sprint; sprint management and deleting tasks are QA/Admin-only.
- Invite users by email: they get a link to set their own password (`scripts/invite-users.ts` for bulk).
- Sprints (`planned → active → closed`, one active at a time), with a close-sprint dialog that carries selected tasks forward.
- Task grid: inline editing, keyboard navigation, field-level optimistic writes, filters/search in the URL, sorting, column toggles, sticky columns, quick add, and a row flash when someone else changes a task.
- Notion-style side panel (`?task=TSK-142` links): rich-text description, bug fields, image attachments (picker, drag and drop, **paste screenshots**), lightbox, comments, and a human-readable activity log.
- Presence avatars per sprint and per task, plus an offline/reconnecting indicator with a persistent local cache.
- Live dashboard filtered by App Type, and an immutable, printable sprint report generated at close.

## Quick start (local, no Firebase account needed)
Requires **Node 20+** and **Java 21+**, which the Firebase emulators need (e.g. `winget install EclipseAdoptium.Temurin.21.JRE`).
```bash
npm install
cp .env.emulator .env.local     # emulator settings
npm run emulators               # terminal 1: Auth :9099, Firestore :8080, UI :4000
npm run seed                    # terminal 2: demo users, products, sprints, ~25 tasks
npm run dev                     # terminal 2: http://localhost:3000
```
Sign in as `admin@example.com`, `qa1@example.com` or `dev1@example.com` with password **`password123`**. `npm run emulators:persist` keeps emulator data in `./emulator-data` between runs.

## Using a real Firebase project
Follow **[docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)** (free Spark plan, no billing): project, web app, Email/Password auth, Firestore, service account, rules deploy, `.env.local`, first Admin. In short:
```bash
cp .env.example .env.local      # fill in the 9 values, NEXT_PUBLIC_USE_EMULATORS=false
npx firebase login && npx firebase use --add
npx firebase deploy --only firestore:rules,firestore:indexes
npx tsx scripts/create-admin.ts --email you@company.com --password "a-strong-password" --name "Your Name"
npm run dev
```

## Environment variables
| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_*` (6) | browser | Web app config. Safe to expose. |
| `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` | server only | From the service-account JSON. Never prefix with `NEXT_PUBLIC_`. Keep `\n` in the key. |
| `NEXT_PUBLIC_USE_EMULATORS` | both | `true` → local emulators (Admin SDK needs no credentials). |

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Unit tests (Vitest): permissions, metrics/report, filters, diffing, carry-forward, validation, activity labels |
| `npm run test:rules` | Firestore **security-rules tests** for every role (starts the emulator automatically) |
| `npm run test:e2e` | Playwright end-to-end flows on an emulator-only server (:3001); needs emulators + `npm run seed` |
| `npm run dev:emulator` | Dev server on :3001 forced to the local emulators (what E2E uses) |
| `npm run emulators` | Firebase Emulator Suite |
| `npm run seed` | Seed the emulators (refuses to run against a real project) |
| `npm run create-admin -- --email … --password … --name …` | Bootstrap an Admin |

## Testing
- **Unit:** `npm test` (no emulators needed).
- **Security rules:** `npm run test:rules` covers allowed and denied actions per role: users, master data, sprints (single active, closed read-only, report required to close), tasks (key/counter integrity, developer field restrictions, carry-forward exception), comments, attachments (type/size, chunk integrity, count sync, ownership, closed sprints), activity and presence.
- **End to end:** with `npm run emulators` running, run `npm run seed` then `npm run test:e2e`. It covers login and redirects, role gating, real-time sync between two browsers, presence, quick add, side panel and comments, attachment upload, URL filters, dashboard, Admin user creation, deactivation kick-out, the single-active-sprint rule, and close sprint with carry-forward and report. The suite closes the active sprint at the end, so **re-seed before each run**.

- **Smoke test on the real project:** `npm run test:smoke` (with `npm run dev` running and `.env.local` pointing at Firebase). It creates two temporary users and `[SMOKE]`-tagged data, checks rules, indexes, the Admin API, Firestore-stored attachments and real-time sync, then deletes everything it created. Set `SMOKE_BASE_URL=https://your-app.vercel.app` to run it against the deployed site.
- **Health checks:** `npm run check-env` (validates `.env.local` without printing secrets) and `npm run verify-setup` (admin account, deployed rules, index status).

## Deploying to Vercel
1. Import the GitHub repo in Vercel (framework: Next.js, default build settings).
2. Add the 9 environment variables (Production + Preview). Leave out `NEXT_PUBLIC_USE_EMULATORS`.
3. Deploy, then add the Vercel domain to Firebase → Authentication → Settings → **Authorized domains**.
4. Rules and indexes are deployed with the Firebase CLI (Step 6 of the setup guide), not by Vercel. Re-run that command whenever `firestore.rules` or `firestore.indexes.json` change.

## Project layout
```
app/(auth)/            login, forgot-password (public)
app/(app)/             protected: sprints, sprints/[id], sprints/[id]/report, my-tasks, dashboard, admin/*
app/api/admin/users/   Admin SDK route handlers (create, update role/active, reset password)
components/ui/         shadcn/ui
components/            layout, providers (auth, live data), tasks (grid, panel, editors), sprints, dashboard
lib/firebase/          client init (persistent cache, emulators), admin init, typed refs/converters
lib/services/          ALL Firestore writes (tasks, sprints, comments, attachments, presence, users)
lib/hooks/             onSnapshot hooks (useSprintTasks, useTask, useComments, useAttachments, usePresence…)
lib/                   pure logic: permissions, metrics, filters, diffing, carry-forward, validation
types/                 shared types
scripts/               create-admin, seed
tests/unit · tests/rules · tests/e2e
firestore.rules · firestore.indexes.json · firebase.json
```
See [DECISIONS.md](DECISIONS.md) for design choices and [CLAUDE.md](CLAUDE.md) for the developer and AI-assistant context.
