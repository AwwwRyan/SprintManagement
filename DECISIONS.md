# Decisions

Choices made where the spec was ambiguous or where a constraint forced a trade-off. Each entry is the simplest approach consistent with the spec.

## Stack & versions
- **Next.js 15.5 (App Router) + React 19, Tailwind v4, shadcn/ui on Radix** (`radix-nova` style). shadcn's newest default uses Base UI; we picked the Radix base for its mature focus management in dialogs and selects.
- **TanStack Table pinned to v8** (the spec names v8; npm `latest` is v9).
- shadcn now generates `cn()` from the official `cn` package (shadcn-ui/cn). `lib/utils.ts` re-exports it alongside the app helpers.
- **Firebase JS SDK v13 / Admin v14**: modular API only.

## Data model
- **Date-only values** (`startDate`, `endDate`, `dueDate`) are stored as `"YYYY-MM-DD"` strings. This avoids time-zone shifts and makes ordering trivial. Audit times (`createdAt`, etc.) are Firestore Timestamps.
- **`description` is the Tiptap JSON serialized as a string**, not a nested map. Nested lists can exceed Firestore's 20-level map depth limit, and a string also keeps field-level diffing simple. `descriptionText` holds the plain text for search and preview.
- **`order` = `Date.now()` at creation** (ms, monotonic). Sr No is the row's rank by `order` within the sprint, so the order values never need renumbering. Carry-forward appends after `max(now, target sprint's max order)`.
- **`counters/tasks.next`** is the number the *next* task will get. The first task is `TSK-1`, after which the counter becomes 2.
- **`meta/activeSprint { sprintId }`** (extra doc, not in the spec's model) makes "only one active sprint" checkable inside a transaction *and* in security rules, since rules can't run queries.

## Attachments stored in Firestore (no Cloud Storage)
The project runs on the free **Spark** plan by the owner's choice, and new projects can't create a Cloud Storage bucket without Blaze. So instead of Firebase Storage (spec §6.4):
- The image is compressed client-side to **WebP, ~400 KB target, max 1920px** (GIFs are kept as-is to preserve animation). It's then base64-encoded and split into `tasks/{taskId}/attachments/{id}/chunks/{index}` docs of ≤ 900k chars, each well under the 1 MiB doc limit. The stored image is capped at 2.5 MB / 4 chunks.
- The metadata doc holds a **~320px thumbnail data URL**, so thumbnail grids read only metadata. The full image loads on demand in the lightbox and is cached in memory, since chunks are immutable.
- Chunks, metadata, `attachmentCount +1` and the activity entry are **one batch**, so there are no orphans. Delete is also one batch.
- Security is the same Firestore rules: only active users who can edit the task, never in closed sprints. Developers can delete only their own uploads. Chunks can only be created together with brand-new metadata (no tampering later), and the count must rise by exactly 1.
- **Progress**: there's no byte-level upload progress for Firestore writes, so progress covers compression/encoding and finishes when the batch commits. **Cancel** works until the write starts.
- Download needs no CORS setup, because the image is already a data URL in the page.
- Trade-off: it counts against the Spark quotas (1 GiB storage, 50k reads/day). A compressed screenshot is ~0.3–0.5 MB, and viewing one costs 1–4 reads. To move to Cloud Storage later (Blaze), swap `lib/services/attachments.ts` back to `uploadBytesResumable` and add `storage.rules`. The metadata shape is the only other change.

## Team permission change: everyone edits every task (2026-10-12)
The owner asked that **all users can edit any task** and add their own remarks. This overrides the spec's "Developers edit only tasks they created or are assigned to" row.
- Any active user can edit any task in a planned/active sprint, and upload attachments to it (UI `canEditTask` + rules `canEditTaskData`).
- Still restricted: only QA/Admin manage sprints, carry tasks forward, and delete tasks. Developers can't change `sprintId` / `carryOverCount` / `sprintHistory`. Nobody changes `taskKey` / `reporterId`. Developers delete only their own attachments. Comments ("remarks/notes") are edited only by their author, and QA/Admin can delete any. Closed sprints stay read-only for everyone.
- To restore ownership-based editing, re-add the `isOwnTask` check in `canEditTaskData` and the task update rule, and in `lib/permissions.ts#canEditTask`.

## Invites instead of admin-chosen passwords
Admin → Users → Add user defaults to **"Email them a link to set their own password"**. The account gets a random password, and Firebase sends its *Password reset* email (`identitytoolkit accounts:sendOobCode`). Admins can resend it from the row menu. Bulk version: `scripts/invite-users.ts team.json [--apply]`. Choosing a password manually is still possible.

## Excel import (2026-10-12)
`scripts/import-xlsx.ts` imported the team's "Medicpassport Bug list Aug 2026.xlsx" (8 sheets, 256 rows with a description, including filter-hidden rows; 49 ID-only rows skipped) into one active sprint, **"Sprint 1 (imported from Excel)"**, as TSK-1 to TSK-256. The owner chose one sprint; unfinished tasks carry forward when it closes.
- App: from the sheet (Dr App → DOCTOR, Patient App → USER, …), from the per-row App column, or from a per-row override for Back log and plain "Backend" rows (listed in the script's `MAPPING.rowApp`).
- Status: open/pending/blank → To Do · testing → QA Testing · hold → Blocked · completed → Done · cancelled → **Done** with a comment (the app has no Cancelled status). Priority 1/2/3 → High/Medium/Low. **"Production issues" → Bug + Critical.** Type: Bug; Enhancement/UI/Change → Enhancement; New/Request/Requirement → Requirement.
- Owner: the first matching team member is the assignee. Multiple owners, unknown people and "QA" are kept in a comment. Remarks, hold/cancelled notes and the original owner text go into one "From the Excel sheet" comment. Backend/Android/iOS release status → Environment. Each description ends with its source sheet, ID and row.
- Reporter and comment author: the importing admin (Aryan). Admin-SDK writes were verified against the same constraints as `validTask` in the rules.
- The script refuses to import into an existing sprint of the same name, so it can't run twice by accident.

## Dashboard progress + date-range export
- The progress card (`sprintProgress` in lib/metrics.ts) groups statuses into Done / In QA / In progress / To do (incl. reopened) / Blocked. Pace = completion % minus sprint-time %: ±10 counts as "on track". No extra reads: it uses the dashboard's live task list.
- Export (Admin only): presets This week (Mon–today) / Last week / This month / Last month / Custom, plus an App Type filter. It covers **all sprints**. "Completed in range" = a status change to Done in the activity log during the range (collection-group query on `activity`: index `field + createdAt`, read rule `/{path=**}/activity`). Imported tasks were created as Done, have no such change, and never count as completed. The file is built client-side with exceljs, which is dynamically imported, so it doesn't weigh down page loads. Cost: one read per task plus one per status change in the range.
- Scheduled automatic emails would need Cloud Functions (Blaze), so exports are on demand.

## Workflow statuses, Category, Priority, multiple assignees (2026-10-22)
Decided with the owner:
- **Category** (was "Type"): Bug, Improvement, Task. Old values map requirement → Task, enhancement → Improvement.
- **Statuses**: Pending, In Progress, On Hold, Dev Done, Testing in Progress, Done, Released, Closed, Duplicate. Blocked and Reopened are gone (blocked → On Hold, reopened → In Progress; todo → Pending, ready_for_qa → Dev Done, qa_testing → Testing in Progress).
- **Done = testing finished but not live yet.** Done tasks still carry into the next release. Only Released, Closed and Duplicate are "finished" (`lib/task-model.ts`).
- **Completion % = (Done + Released) ÷ (all − Closed − Duplicate).** Closed and Duplicate drop out of the total.
- **One Priority** (Critical / High / Medium / Low). Severity was removed; the dashboard shows open bugs by priority.
- **Multiple assignees** (`assigneeIds`, max 20). In person breakdowns each assignee gets the task's full hours (not split). My Tasks uses `array-contains`. The cell editor saves once when the picker closes, so one write and one activity entry.
- The grid has no Description column; Title is shown as **Task**. Description stays in the side panel.
- The Firestore converter normalises unmigrated docs (`LEGACY_*` maps), so old data and old activity entries still read correctly.
- Live data: `scripts/migrate-workflow.ts` (preview by default, `--apply` to write). Imported "done" tasks → Released (CANCELLED ones → Closed). All Excel owners are restored as assignees; the owner "QA" (TSK-96/172/177) is a team, not a person, so it isn't mapped. Imported titles get the full text (≤ 300 chars), and the duplicated description is reduced to the import footer.

## Site metadata / link previews (2026-10-22)
- Name, description and URL live in `lib/site.ts`. The base URL is `NEXT_PUBLIC_SITE_URL`, else Vercel's `VERCEL_PROJECT_PRODUCTION_URL`, so previews use absolute URLs without extra setup.
- The favicon, Apple icon and 1200×630 share image are generated with `next/og` (`app/icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`, `twitter-image.tsx`). No binary assets; the "RT" mark matches the sidebar.
- `robots: noindex, nofollow`: it's an internal tool, so link previews work but search engines shouldn't list it.

## Drag-and-drop task order (2026-10-22)
- **Everyone can reorder** tasks in an open release (matches "everyone can edit every task"). Order is shared, so a move changes it for everybody, live.
- **Reorders aren't logged** in Activity (owner's call; they'd be noise).
- A moved task gets `order` halfway between its new neighbours: one write per move (`lib/reorder.ts`). When the gap runs out (orders are ms timestamps, so after ~20 drops into the same spot), the release is renumbered once in 1000-steps, anchored at the current last order so new tasks still land at the bottom.
- Native HTML5 drag with a grip in the Sr No cell (no library; nothing gets `position`/transforms, so sticky columns stay intact). Keyboard: Alt+↑/↓ on a focused row.
- Only in the release view, and only when sorted by Sr No (or unsorted); sorting by another column hides the grips. Not in My Tasks, where a personal list would silently rearrange the shared order.

## Sprints renamed "Releases" (2026-10-22)
- **UI only:** every visible "Sprint" is now "Release", including the app name (Release Task Manager), the nav, pages, dialogs, the dashboard, reports and the export file name (`Release-report_…`). Routes moved from `/sprints/…` to `/releases/…`, and `next.config.ts` permanently redirects old `/sprints` links, including `?task=` deep links.
- **Code and data keep "sprint"**: the `sprints` collection, `sprintId`, `meta/activeSprint`, types and services. Nothing was migrated. The live release was renamed "Release 1 (imported from Excel)", and the seed uses "Release 13/14/15".

## Release date and Environment (2026-10-22)
- `tasks.releaseDate` ("YYYY-MM-DD" or null): a new column after Due date, plus the side panel and New Task form. Rules accept it as optional, and it's included in the export.
- Environment is a dropdown with **Staging / Production** (`ENVIRONMENTS` in constants). Any other existing value is kept and shown as an extra option, and "None" stores "". In live data, "production" was normalized to "Production", and 7 imported Backend/Android/iOS release-status notes moved from Environment into Remarks. The importer now writes release status to Remarks.

## Remarks field (2026-10-13)
`tasks.remarks` is one free-text note per task (up to 2,000 characters), separate from the comment thread. It has its own table column right after Status (multi-line editor: Enter saves, Shift+Enter adds a line), plus a box in the side panel and the New Task form. Anyone can edit it in open sprints (the same rule as other fields; closed sprints are read-only). It's included in search, the activity log and the Excel export. The rules accept the field as optional, since older docs lack it. The 97 Excel "Remark:" lines saved in the import comments were copied into `remarks`, each with an activity entry.

## App Type codes
Codes may be up to 20 characters with single hyphens (e.g. SERVICE-PROVIDER), enforced by zod and the rules. Badges use the App Type color as a solid fill, with black or white text picked by WCAG contrast (`readableTextColor`).

## Auth & users
- Route protection is client-side (Firebase Auth state only exists in the browser). `(app)/layout.tsx` redirects to `/login?next=…`, and the server-side guard is the security rules plus Admin-API token checks.
- A user may always read **their own** `users/{uid}` doc, even when deactivated, so an open session can see the deactivation and sign itself out. All other reads require `active == true`.
- Deactivation: the Admin API sets `disabled: true`, revokes refresh tokens, and flips `active: false`. The client's live listener on its own user doc signs out immediately.
- Role changes: the API updates the custom claim *and* the doc. The client sees the doc's role differ from its token claim and calls `getIdToken(true)`.
- `requireAdmin` checks both the token claim **and** the Firestore doc (`role == admin && active`), so a just-demoted admin's still-valid token is rejected.
- Admins can't deactivate or demote themselves, so the last Admin can never lock everyone out.
- Forgot-password always shows the same confirmation, so the form doesn't reveal which emails have accounts.

## Task table UX
- **Click behaviour**: clicking Sr No, Task ID, Title, Description or Files opens the side panel; clicking any other editable cell edits inline. Title is edited inline with Enter/F2/double-click, or in the panel heading. Read-only rows open the panel on click.
- **Optimistic updates** use Firestore latency compensation: the local cache updates instantly and Firestore rolls it back automatically if the server rejects the write, at which point we show a toast. No separate optimistic state is kept.
- **Local edits win**: every editor holds its own draft, so remote snapshots for the same field don't replace what you're typing until you commit or cancel.
- **Row flash** triggers for `modified` doc changes with no pending local writes and `updatedBy !== me`.
- Quick add uses the last App Type used (localStorage), else the first active one. In My Tasks it also assigns the task to you.
- Column visibility is per view (sprint vs my-tasks) and stored in localStorage.

## Sprints & carry-forward
- Close-sprint order: (1) create the target sprint if new, (2) write the report snapshot, (3) move tasks in chunks of 225 tasks × 2 writes = **450 ops per batch**, (4) close the sprint and clear `meta/activeSprint`. The sprint stays active until the last step, so a failed close can be retried. A report that already exists is reused.
- "Bugs opened during the sprint" = bug tasks in the sprint whose `createdAt` falls between the start date and the close time. "Bugs fixed" = bug tasks that are Done or Released at close.
- Unselected unfinished tasks stay in the closed sprint and appear as "left incomplete" in the report.
- Sprint list counts are **live** for planned and active sprints (one `in` query, up to 30 sprints). Closed sprints use their immutable report snapshot.

## Security rules
- **Activity entries aren't gated on sprint state** and don't `get()` the parent task. Every entry is written in the same batch as a change that *is* gated, and per-entry task lookups would exceed the rules `get()` limit on 225-task carry-forward batches. They remain create-only, `actorId == uid`, with `createdAt == request.time`.
- New tasks must use the key just reserved from the counter (`getAfter(counters/tasks).next == key + 1`), and the counter can only move by +1 per write. Together this guarantees unique keys.
- The `attachmentCount <= 10` cap is enforced by the task rule. The attachment rule requires `getAfter(task).attachmentCount == get(task).attachmentCount + 1`, so the count stays in sync.
- Deleting a task deletes its attachments (chunks + metadata) and comments. Activity docs are append-only by rule, so they remain orphaned.

## Charts
- Colors were validated with the dataviz palette validator. Category uses 3 categorical slots in a fixed order, with separate light and dark steps. Status and open-bugs-by-priority charts are single-series, using one hue with labeled axes, so color never carries meaning on its own. Every chart has a table or legend with values next to it.
- Chart colors are hex (picked by the resolved theme), because SVG presentation attributes don't resolve CSS `var()`.

## Out of scope (kept extensible)
- Kanban: `status` is a plain enum, and `order` is per-sprint, so a board view can group by status without schema changes.
- Email notifications: every change already lands in `tasks/{id}/activity`, which a Cloud Function could fan out later.
