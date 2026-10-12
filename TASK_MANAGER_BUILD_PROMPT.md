# Build Prompt: Sprint Task Manager (Next.js + Firebase)

You are building an internal, real-time, sprint-based task management web app for a company with 3 products. Read this entire spec before writing any code. Build it in the phases listed at the end, and confirm each phase works (type-checks, builds, runs) before moving to the next.

---

## 1. Product Overview

QA creates sprints and adds tasks (requirements, bugs, enhancements) to them. Developers and QA work on these tasks in a shared, spreadsheet-like table that updates **in real time across all open tabs and devices without page reload** (Notion-like). When a sprint closes, unfinished tasks can be carried forward into the next sprint, keeping their identity and history.

---

## 2. Tech Stack (use exactly this)

- **Next.js 14+ (App Router), TypeScript (strict mode)**
- **Firebase Auth**: email/password only
- **Cloud Firestore**: primary database; all live data via `onSnapshot` listeners
- **Firebase Storage**: image attachments
- **Firebase Admin SDK**: used only inside Next.js Route Handlers (`app/api/...`) for privileged operations
- **Tailwind CSS + shadcn/ui** for UI
- **TanStack Table v8** for the task grid
- **Tiptap** for rich-text description fields
- **Recharts** for dashboard charts
- **react-hook-form + zod** for forms and validation
- **date-fns** for dates
- **browser-image-compression** for client-side image compression before upload

Configuration comes from environment variables. Create `.env.example` with:

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
```

Never expose Admin SDK credentials to the client.

---

## 3. Authentication & Users

- **No signup page.** The only public pages are Login and Forgot Password.
- Login uses email + password via Firebase Auth.
- Forgot Password uses `sendPasswordResetEmail`.
- All other routes are protected: redirect unauthenticated users to `/login`. Implement an auth context/provider plus a protected layout for the `(app)` route group.
- Deactivated users must be signed out immediately and blocked from logging in. Use Admin SDK `updateUser({ disabled: true })` and also listen to the user's Firestore doc so an open session is kicked out in real time.

### Admin-managed users
- Only Admins create users, from the Admin panel. Fields: name, email, role, designation, initial password.
- User creation, role change, deactivation/reactivation, and password reset go through **Route Handlers using the Admin SDK**. Every handler must verify the caller's Firebase ID token and confirm the caller is an Admin.
- Store the role in **both** a Firebase custom claim (`role`) and the Firestore `users/{uid}` doc. When a role changes, update the claim and force a token refresh on the client.
- Users are **never deleted**, only deactivated, so their names still render on historical tasks.

### Bootstrapping the first Admin
Because there is no signup, create a script `scripts/create-admin.ts` (run with `npx tsx`) that uses the Admin SDK to create the first Admin user (email, password, and name passed as CLI args), set the custom claim, and write the Firestore user doc. Document the command in the README.

### Roles

| Action | Admin | QA | Developer |
|---|:---:|:---:|:---:|
| Manage users | ✅ | ❌ | ❌ |
| Manage App Types & Modules | ✅ | ❌ | ❌ |
| Create / edit / close sprints | ✅ | ✅ | ❌ |
| Carry tasks forward | ✅ | ✅ | ❌ |
| Create tasks | ✅ | ✅ | ✅ |
| Edit any task | ✅ | ✅ | ❌ |
| Edit tasks they created or are assigned to | ✅ | ✅ | ✅ |
| Delete tasks | ✅ | ✅ | ❌ |
| Upload attachments | ✅ | ✅ | ✅ (on tasks they can edit) |
| Delete attachments | ✅ | ✅ | Only their own uploads |
| Comment on any task | ✅ | ✅ | ✅ |
| View dashboard & reports | ✅ | ✅ | ✅ |

The UI should hide or disable actions the user can't perform, **and** Firestore/Storage security rules must enforce the same permissions. Never rely on UI hiding alone.

---

## 4. Master Data (Admin-managed)

- **App Types**: the company's 3 products. Fields: name, short code, color (for badges), active flag.
- **Modules**: each belongs to one App Type. Fields: name, `appTypeId`, active flag.
- In task forms and inline cells, the **Module dropdown only shows modules of the selected App Type**. If App Type changes, clear Module.
- Deactivated App Types/Modules don't appear in dropdowns but still display on existing tasks.

---

## 5. Sprints

**Fields:** name (e.g., "Sprint 14"), goal, startDate, endDate, status, createdBy, createdAt, closedAt, closedBy.

**Status lifecycle:** `planned` → `active` → `closed`
- Only **one** sprint can be `active` at a time. Starting a sprint while another is active must be blocked with a clear message.
- Sprints are shared across all App Types.
- A `closed` sprint is **fully read-only**: no task edits, comments, or attachment changes. Enforce this in security rules too.

---

## 6. Tasks

### 6.1 Fields / table columns

| Column | Field | Details |
|---|---|---|
| Sr No | (computed) | Row number within the sprint based on `order`; display only |
| Task ID | `taskKey` | Permanent global ID like `TSK-142`. Generated with a Firestore transaction on `counters/tasks`. **Never changes**, including when carried forward |
| App Type | `appTypeId` | Required. Rendered as a colored badge |
| Type | `type` | `requirement` / `bug` / `enhancement` / `task` |
| Module | `moduleId` | Filtered by App Type |
| Title | `title` | Required, one line |
| Description | `description` | Rich text (Tiptap JSON), edited in the side panel; table shows a plain-text preview |
| Assigned to | `assigneeId` | Dropdown of active users, showing avatar initials + name |
| Priority | `priority` | `critical` / `high` / `medium` / `low` |
| Severity | `severity` | `blocker` / `major` / `minor` / `trivial`; **only shown/editable when type = bug**, otherwise null |
| Estimated time | `estimatedHours` | Number, 0.5 steps |
| Actual time | `actualHours` | Number, logged by the developer |
| Status | `status` | See 6.2 |
| Attachments | `attachmentCount` | Paperclip icon + count. Click opens the side panel scrolled to the Attachments section. See 6.4 |
| Reported by | `reporterId` | Auto-set to the creator |
| Due date | `dueDate` | Optional |
| Environment / Build | `environment` | Free text, e.g., "Staging v2.3.1" |
| Carried over | `carryOverCount` | Badge "↻ N" shown when > 0 |

Bug-only detail fields (shown in the side panel when type = bug): `stepsToReproduce`, `expectedResult`, `actualResult` (plain multiline text).

Use color-coded badges for Type, Priority, Severity, and Status.

### 6.2 Status values
`todo` → `in_progress` → `ready_for_qa` → `qa_testing` → `done`, plus `reopened` and `blocked`.

Any status can move to any other status; don't enforce a strict state machine. Every change is logged in the activity log.

### 6.3 Task table behavior
- **Inline editing**: click a cell to edit (select, text, number, date, user picker). Saves automatically on blur/select. Escape cancels.
- **Optimistic updates**: the UI updates immediately; on a write failure, revert and show a toast.
- **Field-level writes**: always write only the changed field(s) with `updateDoc`, never the whole document, so concurrent edits to different fields don't overwrite each other (last-write-wins per field).
- **Filters**: App Type, Type, Module, Assigned to, Status, Priority. Multi-select, combinable, with a "Clear filters" button. Persist filters in the URL query string.
- **Sorting** on any column. **Search** across Title, Description (plain text), and Task ID.
- **Quick add row** at the bottom: type a title and press Enter to create a task with sensible defaults (App Type = last used, type = task, status = todo, priority = medium). Then open it in the side panel if needed.
- A "New Task" button opens a full form dialog.
- Column show/hide toggle. Sticky header and sticky first two columns (Sr No, Task ID) on horizontal scroll.
- Rows are not editable for users without edit permission on that task, and nothing is editable in a closed sprint.
- Empty states and loading skeletons throughout.

### 6.4 Attachments (images)
- Available on **all task types**, with the upload area highlighted as relevant for bugs and enhancements (e.g., "Add screenshots").
- **Images only**: PNG, JPG/JPEG, WEBP, GIF. Max **10 MB per file before compression**, max **10 attachments per task**.
- Compress client-side with `browser-image-compression` (target ~1 MB, max dimension 1920px; skip GIFs).
- Upload methods: file picker (multi-select), **drag and drop** onto the attachments area, and **paste from clipboard** (Ctrl/Cmd+V) while the side panel is open. Clipboard paste is essential for screenshots.
- Show per-file upload progress; allow cancelling an in-progress upload.
- Storage path: `tasks/{taskId}/attachments/{attachmentId}-{sanitizedFileName}`.
- Metadata goes in the subcollection `tasks/{taskId}/attachments/{attachmentId}`: fileName, storagePath, downloadURL, contentType, sizeBytes, width, height, uploadedBy, uploadedAt.
- Keep `attachmentCount` on the task doc in sync using `increment()` in the same batch as the metadata write/delete.
- Display as a thumbnail grid in the side panel. Clicking opens a **lightbox** with next/prev navigation, zoom, download, and file name.
- Delete with confirmation, which removes the Storage object and the metadata doc. Log uploads and deletions in the activity log.
- Attachments travel with the task when it's carried forward (they're keyed by task, not sprint).
- **Storage security rules**: only authenticated, active users; image content types only; size ≤ 10 MB; writes allowed only if the user may edit the parent task and its sprint isn't closed. Mirror this logic, reading Firestore from Storage rules via `firestore.get()`.

### 6.5 Task side panel (Notion-style)
Opens from the right when a row is clicked. The URL updates (e.g., `?task=TSK-142`) so it can be linked and shared. Contents:
- Task ID, Title (editable heading), and a copy-link button
- All fields as an editable property list
- Rich-text Description (Tiptap; autosave debounced ~800ms)
- Bug-only fields (steps to reproduce / expected / actual)
- **Attachments** section (6.4)
- **Comments** thread: plain text with line breaks, author avatar, timestamp. Authors can edit/delete their own comments (QA/Admin can delete any). Real time.
- **Activity log**: every change, showing who, which field, old → new value (human-readable labels, e.g., names instead of user IDs), and when. Also covers creation, carry-forward, and attachment add/remove. Newest first.

### 6.6 Activity logging
Write the activity entry **in the same batched write** as the task update so they can't diverge. Collection: `tasks/{taskId}/activity`. Fields: actorId, action (`created` | `updated` | `carried_over` | `attachment_added` | `attachment_removed` | `comment_added`), field, oldValue, newValue, createdAt (serverTimestamp). Debounced description edits log a single "updated description" entry and don't store the full text.

---

## 7. Carry-Forward Flow (Close Sprint)

Triggered by QA/Admin clicking **Close Sprint** on an active sprint:

1. A dialog lists every task whose status ≠ `done`, each with a checkbox (all checked by default), showing Task ID, title, App Type, assignee, and status.
2. QA chooses a target sprint: either an existing `planned` sprint from a dropdown, or **create a new sprint inline** (name, goal, start/end dates).
3. On confirm, run the operation in batched writes (chunk at 450 ops per batch to stay under Firestore's 500 limit):
   - For each selected task: set `sprintId` to the target sprint, append the old sprint to `sprintHistory` (`{ sprintId, sprintName, finalStatusInSprint, movedAt }`), increment `carryOverCount`, reset `order` to append at the end of the target sprint, and add a `carried_over` activity entry.
   - **Status of carried tasks stays as-is** (an in-progress task stays in progress).
   - Unselected unfinished tasks remain in the closed sprint.
   - Generate the **sprint report snapshot** (section 9) **before** moving tasks, so the report reflects the sprint's final state.
   - Set the sprint's `status = closed`, `closedAt`, `closedBy`.
4. Show a success summary: "X completed, Y carried to Sprint N, Z left incomplete."

Because a task is a single document whose `sprintId` changes, its Task ID, comments, attachments, and activity history are all preserved automatically.

---

## 8. Real-Time Behavior (Notion-like)

- All lists and detail views (sprints, tasks, comments, attachments, activity, users, master data, dashboard) use Firestore `onSnapshot` listeners. No polling, no manual refresh.
- Changes made in one tab or by another user appear in all other open tabs instantly.
- Unsubscribe listeners on unmount; avoid duplicate listeners. Create reusable hooks, e.g., `useSprintTasks(sprintId)`, `useTask(taskId)`, `useComments(taskId)`, `useAttachments(taskId)`, `useActivity(taskId)`, `useUsers()`, `useAppTypes()`, `useModules()`.
- Briefly highlight a row (subtle background flash) when it's changed by **another** user.
- If a cell is being edited locally while a remote update arrives for the same field, keep the local edit until the user commits or cancels.
- **Presence**: show avatars of users currently viewing the same sprint (top right of the sprint view). Implement with Firestore `presence/{sprintId}/viewers/{uid}` docs containing `lastSeen`, updated by a 30-second heartbeat. Treat a viewer as offline if `lastSeen` is older than 60 seconds. Remove the doc on unmount and on `beforeunload` (best effort). In the side panel, also show who is viewing the same task.
- Show a small "Offline / Reconnecting…" indicator when the connection drops. Enable Firestore's persistent local cache so the app tolerates brief disconnects.

---

## 9. Dashboard & Sprint Reports

### Active sprint dashboard (`/dashboard`, real time)
- Sprint name, dates, days remaining, completion % (done / total) with a progress bar
- Task count by status (bar chart)
- Bugs vs. requirements vs. enhancements vs. tasks (donut chart)
- Breakdown by App Type (count and completion % per product)
- Per-person workload table: assignee, tasks assigned, done, estimated hours, actual hours
- Open bugs by severity
- Filter the whole dashboard by App Type
- Friendly empty state when there's no active sprint

### Sprint report (generated at close, read-only)
Saved to `sprintReports/{sprintId}` as a **snapshot** so it never changes afterward:
- Total planned tasks vs. completed
- List of carried-over tasks (Task ID, title, target sprint) and tasks left incomplete
- Total estimated vs. actual hours
- Bugs opened during the sprint vs. bugs fixed
- Per-developer breakdown (tasks, done, est/actual hours)
- Per-App-Type breakdown
- Viewable at `/sprints/[sprintId]/report` with the same charts as the dashboard, plus a print-friendly layout (CSS `@media print`)

---

## 10. Screens & Routes

| Route | Screen | Access |
|---|---|---|
| `/login` | Login | Public |
| `/forgot-password` | Password reset | Public |
| `/sprints` | Sprint list: status badges, dates, task counts, completion %; "New Sprint" button (QA/Admin) | All |
| `/sprints/[sprintId]` | **Main sprint view**: task table, filters, presence, side panel, Start/Close Sprint actions | All |
| `/sprints/[sprintId]/report` | Sprint report (closed sprints only) | All |
| `/my-tasks` | Logged-in user's tasks in the active sprint, same table component pre-filtered by assignee | All |
| `/dashboard` | Active sprint dashboard | All |
| `/admin/users` | User management | Admin |
| `/admin/app-types` | App Types CRUD | Admin |
| `/admin/modules` | Modules CRUD, grouped by App Type | Admin |

Layout: collapsible left sidebar (Dashboard, Sprints, My Tasks, Admin section for Admins), top bar with the current user menu (name, role, change password, logout). Redirect `/` to the active sprint if one exists, otherwise `/sprints`.

Support light/dark mode. The app should be usable on tablet; the table scrolls horizontally on smaller screens.

---

## 11. Firestore Data Model

```
users/{uid}
  name, email, role ('admin'|'qa'|'developer'), designation,
  active (bool), initials, createdAt, updatedAt

appTypes/{appTypeId}
  name, code, color, active, createdAt

modules/{moduleId}
  name, appTypeId, active, createdAt

sprints/{sprintId}
  name, goal, startDate, endDate,
  status ('planned'|'active'|'closed'),
  createdBy, createdAt, closedAt, closedBy

tasks/{taskId}
  taskKey ('TSK-142'), sprintId, order (number),
  appTypeId, type, moduleId, title,
  description (Tiptap JSON), descriptionText (plain, for search/preview),
  assigneeId, priority, severity (nullable),
  estimatedHours, actualHours, status,
  reporterId, dueDate (nullable), environment,
  stepsToReproduce, expectedResult, actualResult,
  attachmentCount, carryOverCount,
  sprintHistory: [{ sprintId, sprintName, finalStatusInSprint, movedAt }],
  createdAt, updatedAt, updatedBy

tasks/{taskId}/comments/{commentId}
  authorId, body, createdAt, editedAt

tasks/{taskId}/attachments/{attachmentId}
  fileName, storagePath, downloadURL, contentType,
  sizeBytes, width, height, uploadedBy, uploadedAt

tasks/{taskId}/activity/{activityId}
  actorId, action, field, oldValue, newValue, createdAt

sprintReports/{sprintId}
  (snapshot of all report metrics + task lists at close time)

counters/tasks
  next (number)

presence/{sprintId}/viewers/{uid}
  name, initials, viewingTaskId (nullable), lastSeen
```

Create `firestore.indexes.json` with the composite indexes the queries need (e.g., tasks by `sprintId` + `order`, tasks by `sprintId` + `assigneeId`).

Define all types in `types/` and share them across the app. Use Firestore converters (`withConverter`) for type safety.

---

## 12. Security Rules

Write `firestore.rules` and `storage.rules` implementing section 3's permission table. Requirements:
- Every read/write requires an authenticated user whose `users/{uid}.active == true`.
- Read the role from the custom claim (`request.auth.token.role`).
- Only Admins write `users` (via the Admin SDK, which bypasses rules anyway), `appTypes`, and `modules`.
- Only QA/Admin create/update sprints. Developers have no sprint writes.
- Tasks: create allowed for all roles if the target sprint isn't closed and `reporterId == request.auth.uid`. Update allowed for QA/Admin, or Developers where `reporterId == uid || assigneeId == uid`. Delete allowed for QA/Admin only. **No writes at all** to tasks in a closed sprint, except the carry-forward update performed by QA/Admin.
- Developers can't change `taskKey`, `reporterId`, `sprintId`, `carryOverCount`, or `sprintHistory`.
- Comments: any active user can create on tasks in non-closed sprints; authors edit/delete their own; QA/Admin can delete any.
- Activity: create-only (no update/delete), and `actorId` must equal the requester.
- `sprintReports`: create by QA/Admin only, never updated.
- `counters`: only incremented by 1 inside a transaction.
- Presence: users can write only their own viewer doc.
- Validate field types and enum values in rules where practical.

Include `firebase.json` configured for rules, indexes, and the **Firebase Emulator Suite** (Auth, Firestore, Storage) so the app can be developed locally. Add a toggle env var `NEXT_PUBLIC_USE_EMULATORS=true`.

---

## 13. Code Quality

- Clean folder structure: `app/`, `components/` (with `ui/` for shadcn), `lib/firebase/` (client + admin init), `lib/hooks/`, `lib/services/` (all Firestore writes go through service functions, never inline in components), `types/`, `scripts/`.
- Strict TypeScript, no `any`. zod schemas for all form inputs and API route bodies.
- Centralized error handling with toast notifications (shadcn `sonner`).
- Accessible components: keyboard navigation in the table (arrow keys move between cells, Enter edits), focus management in dialogs and the side panel.
- No secrets in client code.
- A **seed script** `scripts/seed.ts` that, against the emulator, creates: 1 Admin, 2 QA, 4 Developers, 3 App Types, 3–4 Modules per App Type, 1 closed sprint with a report, 1 active sprint with ~25 mixed tasks, and 1 planned sprint.
- A `README.md` covering Firebase project setup (enable Email/Password auth, Firestore, Storage), env vars, running emulators, creating the first admin, seeding, deploying rules/indexes, and deploying the app to Vercel.

---

## 14. Out of Scope for v1 (keep the model extensible)

Kanban board view, email notifications, signup/self-registration. Don't build these, but don't make design choices that would block them later.

---

## 15. Build Phases

Work through these in order. After each phase, run `npm run build` and `npm run lint`, fix all errors, and briefly summarize what was done before continuing.

1. **Setup**: Next.js + TypeScript + Tailwind + shadcn/ui, Firebase client/admin init, emulator config, folder structure, shared types.
2. **Auth & Users**: login, forgot password, auth provider, protected routes, custom claims, `create-admin` script, Admin user management screens and API routes, deactivation kick-out.
3. **Master data**: App Types and Modules admin CRUD, plus the shared hooks.
4. **Sprints**: list, create/edit, start (single active rule), sprint detail shell.
5. **Task table**: TanStack table with all columns, inline editing, optimistic field-level updates, Task ID transaction, quick add, filters/sort/search with URL state, row highlighting on remote change.
6. **Side panel**: all fields, Tiptap description, bug fields, comments, activity log (batched with updates).
7. **Attachments**: upload (picker, drag-drop, paste), compression, progress, thumbnails, lightbox, delete, count sync, Storage rules.
8. **Presence & offline**: viewer avatars, task-level presence, offline indicator, persistent cache.
9. **Close sprint & carry-forward**: dialog, inline new sprint, batched moves, report snapshot generation.
10. **Dashboard & reports**: live dashboard with App Type filter, sprint report page with print layout.
11. **Security rules & indexes**: complete `firestore.rules` and `storage.rules`, indexes, and rules unit tests with `@firebase/rules-unit-testing` covering each role's allowed and denied actions.
12. **Seed, polish & docs**: seed script, empty/loading states, dark mode, responsive checks, README.

If anything in this spec is ambiguous, choose the simplest approach consistent with it, and note the decision in `DECISIONS.md`.
