# Sprint Task Manager: project context

Living context for anyone (human or AI) working on this repo. **Keep it current.** Update the "Status" and "Open items" sections whenever something changes.

- Original spec: `TASK_MANAGER_BUILD_PROMPT.md` (source of truth for features)
- Design decisions / spec interpretations: `DECISIONS.md` (add an entry for every new judgment call)
- Firebase setup guide: `docs/FIREBASE_SETUP.md` · general docs: `README.md`

## What it is
Internal real-time sprint task manager for a company with 3 products. QA creates sprints and tasks. Devs and QA edit tasks in a live spreadsheet-like grid. Closing a sprint carries unfinished tasks forward and snapshots a report. Roles: admin / qa / developer.

## Deployment model (owner's constraints)
- Hosted on **Vercel** by the owner (GitHub repo `AwwwRyan/SprintManagement`). The owner deploys; don't set up deployment pipelines.
- Database and auth are **Firebase on the free Spark plan. The owner won't enable Blaze billing**, so there's **no Cloud Storage**. Attachments are stored in Firestore (base64 chunks; see `lib/attachment-codec.ts`, `lib/services/attachments.ts`, DECISIONS.md).
- **No Docker, no containers, no other infra.**
- Firestore rules and indexes are deployed with `npx firebase deploy --only firestore:rules,firestore:indexes`.

## Stack
Next.js 15.5 App Router · React 19 · TS strict (no `any`) · Tailwind v4 · shadcn/ui (`radix-nova`, Radix primitives; `cn` from the official `cn` package) · Firebase JS v13 + Admin v14 · TanStack Table **v8** (pinned) · Tiptap v3 · Recharts v3 · react-hook-form + zod v4 · date-fns v4 · sonner · next-themes.

## Architecture rules (follow these)
- **All Firestore/Storage writes go through `lib/services/*`.** Never write inline in components.
- **Reads are live**: `onSnapshot` via `lib/hooks/use-live.ts` (`useLiveQuery(key, build)` / `useLiveDoc`). `key` identifies the query, and the listener is recreated only when it changes.
- Shared collections (users, appTypes, modules, sprints) have **one listener for the whole app** in `components/providers/data-provider.tsx` (`useData()`). Don't add duplicate listeners for them.
- Auth/profile/role comes from `components/providers/auth-provider.tsx` (`useAuth`, `useCurrentUser` inside the protected layout).
- **Task updates are field-level**: `updateTask(task, patch, uid)` diffs (`lib/task-diff.ts`), writes only changed fields, and writes one activity entry per field **in the same batch**. Optimistic UI = Firestore latency compensation (auto-rollback on reject, so we only toast).
- Permissions: `lib/permissions.ts` (UI) **must mirror** `firestore.rules`. Change both, and add rules tests.
- **Team decision: every active user can edit every task** in an open sprint (not only reporter/assignee). Sprint management, carry-forward and task deletion stay QA/Admin-only. See DECISIONS.md.
- Pure logic lives in `lib/*.ts` with no Firebase imports, so it's unit-testable: metrics, filters, diff, carry-forward, activity-format, sprint-utils, validation.
- Types: `types/index.ts`. Firestore converters and typed refs: `lib/firebase/refs.ts`.
- Admin-only server operations: `app/api/admin/users/**` with `requireAdmin()` (`lib/server/require-admin.ts`), which verifies the ID token **and** the Firestore doc role/active. Admin SDK init: `lib/firebase/admin-core.ts` (also used by scripts), `lib/firebase/admin.ts` (`server-only`).
- Dates: date-only fields are `"YYYY-MM-DD"` strings. `description` = Tiptap JSON **string**. `order` = ms timestamp.
- `meta/activeSprint {sprintId}` enforces the single-active-sprint rule (transaction + rules).
- Charts: colors in `lib/constants.ts` as **hex per theme** (SVG attributes can't read CSS vars), validated with the dataviz palette validator.

## Commands
```bash
npm run dev | build | lint | typecheck
npm test                 # unit (Vitest), tests/unit
npm run test:rules       # rules tests, auto-starts the Firestore emulator (needs Java 21)
npm run emulators        # Auth 9099 · Firestore 8080 · UI 4000
npm run seed             # emulator demo data; all users' password: password123
npm run test:e2e         # Playwright on an emulator-only server at :3001 (dev:emulator); needs emulators + fresh seed
npm run dev:emulator     # dev server on :3001 forced to the emulators (.env.emulator), build dir .next-e2e
npx tsx scripts/invite-users.ts team.json [--apply]   # bulk add team; emails set-password links
npx tsx scripts/create-admin.ts --email … --password … --name "…"
npm run check-env        # validate .env.local (never prints secrets) + Admin SDK connectivity
npm run deploy:firestore # publish firestore.rules with the Admin key (indexes need `firebase deploy`)
npm run verify-setup     # real project: admin account, deployed rules match, index status
npm run test:smoke       # real project smoke test; creates + deletes [SMOKE] data and 2 temp users
```
Env: `.env.local` (git-ignored) now points at the **real project**. `.env.emulator` = emulator preset, which `seed`, `dev:emulator` and E2E always use, so tests can't touch prod. `.env.example` = template.

## Seed data (emulators)
Users: admin@, qa1@, qa2@, dev1@ … dev4@example.com (pw `password123`). App Types WEB / MOB / ADM. Sprint 13 (closed, report, ids s13), Sprint 14 (active, s14, 25 tasks incl. 2 carried TSK-7/8), Sprint 15 (planned, s15). TSK-1…6 live in closed Sprint 13. The next key after seeding is TSK-32.

## Testing status (last full run: 2026-10-12)
- Unit: 59 tests in 7 files, all passing.
- Rules: 60 Firestore rules tests (every role, incl. Firestore-stored attachments), all passing.
- Smoke (real project): 4 flows via `npm run test:smoke`, passing.
- E2E: 15 Playwright flows, all passing (see the README for the list).
- `npm run build` and `npm run lint` are clean.

## Gotchas
- Windows: the emulators need Java 21 on PATH (`JAVA_HOME`). A JRE unzipped by MSYS `unzip` breaks with `UnsatisfiedLinkError`; extract with PowerShell `Expand-Archive` or use an installer.
- Grid cells must not get `position: relative` on focus (breaks sticky columns and swallows clicks). Sticky cells need **opaque** backgrounds (hover uses `color-mix`, not `/40` alpha).
- Geist font variables must sit on `<html>`, since `html { font-family: var(--font-geist-sans) }` is resolved there.
- Recharts `<Cell>` ignores `style`; pass real colors via `fill`.
- Next 15: client pages using `useSearchParams` are wrapped in `<Suspense>`.
- Never run `npm run build` while `npm run dev` is running: both use `.next`, and the dev server breaks (ENOENT `_document.js`). Fix: stop dev, `rm -rf .next`, restart.
- Firestore rules `get()` limit: don't add per-entry task lookups to the activity rule (carry-forward batches have 225 entries).
- Don't reintroduce Firebase Storage (needs Blaze). Mind the Spark quotas: 1 GiB stored, 50k reads/day, 20k writes/day.

## Status
All 12 build phases from the spec are implemented and verified locally against the emulators (build, lint, unit, rules, and E2E).

## Open items
- [x] Owner chose the Spark plan (no Blaze); attachments moved to Firestore (2026-10-12).
- [x] Real project `sprint-task-manager-87a7e` (alias `prod` in .firebaserc). `.env.local` filled in and validated (`npm run check-env`), and Firestore **rules deployed** via `npm run deploy:firestore` (2026-10-12).
- [x] Indexes deployed by the owner (`firebase deploy --only firestore:indexes --project prod`) and READY. The Admin SDK key gets 403 creating indexes, so that step needs the owner's own login.
- [x] Owner's Admin account created (Aryan).
- [x] Smoke test on the real project passed (`npm run test:smoke`, 4/4), with cleanup verified: only the owner's admin remains, and the counter is reset (2026-10-12).
- [x] Real project data: App Types SADM Super Admin, DOC Doctor App, USER User App, SP Service Provider App (2026-10-12). Modules not added yet.
- [x] Team accounts created WITHOUT emails (2026-10-12): Sudharsan (CTO) and Sreevani (Senior QA) are **admins** with Aryan; Prithika and Hariharan are QA; Sameeh and Nagma are developers (emails in git-ignored `team.json`). Nobody but Aryan can sign in yet.
- [ ] **Send invites only when the owner says the app is ready**: `npx tsx scripts/invite-users.ts team.json --send-invites`, or per user via Admin → Users → Send set-password email. Don't send them without being asked. 
- Rules hardened: a stale `meta/activeSprint` pointer to a deleted sprint no longer blocks starting sprints (rules test added, 58 total).
- [ ] Owner: commit/push, deploy to Vercel, and add the Vercel domain to Firebase Auth authorized domains. Optionally run `SMOKE_BASE_URL=https://… npm run test:smoke` afterwards.
- [ ] After the Vercel deploy: add the domain to Firebase Auth authorized domains.
