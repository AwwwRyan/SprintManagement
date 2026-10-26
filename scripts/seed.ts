/**
 * Seeds the LOCAL EMULATORS with demo data:
 *   1 Admin, 2 QA, 4 Developers · 3 App Types × 3-4 Modules
 *   1 closed sprint (with report) · 1 active sprint (~25 tasks) · 1 planned sprint
 *
 *   npm run emulators       (in one terminal)
 *   npm run seed            (in another)
 *
 * All seeded users have the password "password123". Refuses to run against a real project.
 */
import { config } from "dotenv";
// Emulator-only: always read the emulator settings, never the real project in .env.local.
config({ path: ".env.emulator", quiet: true });

import { addDays, format, subDays } from "date-fns";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { emulatorsEnabled, getAdminApp } from "../lib/firebase/admin-core";
import { buildSprintReport } from "../lib/metrics";
import { initialsFromName } from "../lib/utils";
import type { Priority, Role, TaskStatus, TaskType } from "../types";

if (!emulatorsEnabled()) {
  console.error("Refusing to seed: NEXT_PUBLIC_USE_EMULATORS is not 'true'. Seeding is for the local emulators only.");
  process.exit(1);
}

const PASSWORD = "password123";
const day = (d: Date) => format(d, "yyyy-MM-dd");

const USERS: { key: string; name: string; email: string; role: Role; designation: string }[] = [
  { key: "admin", name: "Asha Admin", email: "admin@example.com", role: "admin", designation: "Engineering Manager" },
  { key: "qa1", name: "Quinn Tester", email: "qa1@example.com", role: "qa", designation: "QA Lead" },
  { key: "qa2", name: "Priya Shah", email: "qa2@example.com", role: "qa", designation: "QA Engineer" },
  { key: "dev1", name: "Dev Patel", email: "dev1@example.com", role: "developer", designation: "Senior Developer" },
  { key: "dev2", name: "Maya Chen", email: "dev2@example.com", role: "developer", designation: "Frontend Developer" },
  { key: "dev3", name: "Leo Garcia", email: "dev3@example.com", role: "developer", designation: "Backend Developer" },
  { key: "dev4", name: "Sara Kim", email: "dev4@example.com", role: "developer", designation: "Mobile Developer" },
];

const APP_TYPES = [
  { id: "web", name: "Customer Portal", code: "WEB", color: "#2a78d6", modules: ["Login & Accounts", "Billing", "Dashboard", "Notifications"] },
  { id: "mob", name: "Mobile App", code: "MOB", color: "#eb6834", modules: ["Onboarding", "Payments", "Offline Sync"] },
  { id: "adm", name: "Back Office", code: "ADM", color: "#1baf7a", modules: ["Reports", "User Admin", "Inventory", "Audit Log"] },
];

const TITLES: [TaskType, string][] = [
  ["bug", "Login button unresponsive on Safari"],
  ["task", "Add two-factor authentication"],
  ["improvement", "Remember last selected filters"],
  ["task", "Upgrade payment SDK to v5"],
  ["bug", "Invoice PDF shows wrong tax total"],
  ["task", "Export monthly report as CSV"],
  ["bug", "Crash when syncing with no network"],
  ["improvement", "Dark mode for dashboard"],
  ["task", "Write migration for audit log table"],
  ["bug", "Push notifications arrive twice"],
  ["task", "Bulk user import from spreadsheet"],
  ["improvement", "Faster search on inventory list"],
  ["bug", "Date picker off by one day in IST"],
  ["task", "Set up error monitoring alerts"],
  ["task", "Self-service password reset"],
  ["bug", "Onboarding skips step 3 on Android"],
  ["improvement", "Show avatars in assignee dropdown"],
  ["task", "Load-test the billing API"],
  ["bug", "Report totals ignore cancelled orders"],
  ["task", "Inventory low-stock alerts"],
  ["improvement", "Keyboard shortcuts in task table"],
  ["bug", "Profile photo upload fails above 5 MB"],
  ["task", "Document the release checklist"],
  ["task", "Audit trail for role changes"],
  ["bug", "Session expires too early on mobile"],
];

const STATUSES: TaskStatus[] = ["pending", "in_progress", "dev_done", "testing", "done", "released", "on_hold", "done", "in_progress", "released", "pending", "duplicate"];
const PRIORITIES: Priority[] = ["critical", "high", "medium", "medium", "low"];

function doc(text: string) {
  return JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
}

async function clearCollection(db: Firestore, path: string) {
  await db.recursiveDelete(db.collection(path));
}

async function main() {
  const app = getAdminApp();
  const auth = getAuth(app);
  const db = getFirestore(app);
  console.log("Seeding emulators for project", app.options.projectId);

  for (const c of ["users", "appTypes", "modules", "sprints", "tasks", "sprintReports", "counters", "meta", "presence", "suggestions"]) {
    await clearCollection(db, c);
  }

  // Users
  const uid: Record<string, string> = {};
  for (const u of USERS) {
    let id: string;
    try {
      id = (await auth.getUserByEmail(u.email)).uid;
      await auth.updateUser(id, { password: PASSWORD, displayName: u.name, disabled: false });
    } catch {
      id = (await auth.createUser({ email: u.email, password: PASSWORD, displayName: u.name })).uid;
    }
    await auth.setCustomUserClaims(id, { role: u.role });
    await db.doc(`users/${id}`).set({
      name: u.name,
      email: u.email,
      role: u.role,
      designation: u.designation,
      active: true,
      initials: initialsFromName(u.name),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    uid[u.key] = id;
  }
  const devs = ["dev1", "dev2", "dev3", "dev4"].map((k) => uid[k]);
  const qas = [uid.qa1, uid.qa2];

  // Master data
  const modulesByApp: Record<string, string[]> = {};
  for (const a of APP_TYPES) {
    await db.doc(`appTypes/${a.id}`).set({ name: a.name, code: a.code, color: a.color, active: true, createdAt: Timestamp.now() });
    modulesByApp[a.id] = [];
    for (const m of a.modules) {
      const ref = db.collection("modules").doc();
      await ref.set({ name: m, appTypeId: a.id, active: true, createdAt: Timestamp.now() });
      modulesByApp[a.id].push(ref.id);
    }
  }

  // Sprints
  const today = new Date();
  const sprintDoc = (name: string, goal: string, start: Date, status: "planned" | "active" | "closed") => ({
    name,
    goal,
    startDate: day(start),
    endDate: day(addDays(start, 13)),
    status,
    createdBy: uid.qa1,
    createdAt: Timestamp.fromDate(subDays(start, 2)),
    closedAt: status === "closed" ? Timestamp.fromDate(addDays(start, 13)) : null,
    closedBy: status === "closed" ? uid.qa1 : null,
  });
  const closedStart = subDays(today, 21);
  const activeStart = subDays(today, 6);
  await db.doc("sprints/s13").set(sprintDoc("Release 13", "Stabilize billing and login", closedStart, "closed"));
  await db.doc("sprints/s14").set(sprintDoc("Release 14", "Ship 2FA and mobile offline sync", activeStart, "active"));
  await db.doc("sprints/s15").set(sprintDoc("Release 15", "Reporting improvements", addDays(activeStart, 14), "planned"));
  await db.doc("meta/activeSprint").set({ sprintId: "s14" });
  // The Backlog: a permanent special "release" doc (see BACKLOG_ID in types)
  await db.doc("sprints/backlog").set({
    name: "Backlog",
    goal: "",
    startDate: "",
    endDate: "",
    status: "backlog",
    createdBy: uid.admin,
    createdAt: Timestamp.fromDate(closedStart),
    closedAt: null,
    closedBy: null,
  });

  // Tasks
  let key = 1;
  const makeTask = (i: number, sprintId: string, status: TaskStatus, createdAt: Date) => {
    const [type, title] = TITLES[i % TITLES.length];
    const app = APP_TYPES[i % APP_TYPES.length];
    const mods = modulesByApp[app.id];
    const est = [1, 2, 3, 4, 6, 8][i % 6];
    return {
      taskKey: `TSK-${key++}`,
      sprintId,
      order: createdAt.getTime() + i,
      appTypeId: app.id,
      type,
      moduleId: mods[i % mods.length],
      title,
      description: doc(`Details for "${title}". Acceptance criteria to be confirmed with QA.`),
      descriptionText: `Details for "${title}". Acceptance criteria to be confirmed with QA.`,
      // every 5th task is shared by two developers; every 7th is unassigned
      assigneeIds: i % 7 === 6 ? [] : i % 5 === 2 ? [devs[i % devs.length], devs[(i + 1) % devs.length]] : [devs[i % devs.length]],
      priority: PRIORITIES[i % PRIORITIES.length],
      estimatedHours: est,
      actualHours: status === "done" || status === "released" ? est + ((i % 3) - 1) * 0.5 : status === "pending" ? null : est / 2,
      status,
      reporterId: qas[i % 2],
      dueDate: i % 4 === 0 ? day(addDays(activeStart, 10)) : null,
      environment: i % 3 === 0 ? "Staging" : "",
      stepsToReproduce: type === "bug" ? "1. Open the page\n2. Perform the action\n3. Observe the error" : "",
      expectedResult: type === "bug" ? "The action completes successfully." : "",
      actualResult: type === "bug" ? "An error is shown." : "",
      attachmentCount: 0,
      carryOverCount: 0,
      sprintHistory: [] as unknown[],
      createdAt: Timestamp.fromDate(createdAt),
      updatedAt: Timestamp.fromDate(createdAt),
      updatedBy: qas[i % 2],
    };
  };

  // Closed sprint: 8 tasks, 6 released; 2 carried into the active sprint.
  const closedTasks = Array.from({ length: 8 }, (_, i) => ({
    id: `c${i}`,
    ...makeTask(i + 3, "s13", i < 6 ? "released" : i === 6 ? "in_progress" : "pending", addDays(closedStart, 1)),
  }));
  const carriedIds = ["c6", "c7"];
  const report = buildSprintReport({
    sprint: { id: "s13", name: "Release 13", goal: "Stabilize billing and login", startDate: day(closedStart), endDate: day(addDays(closedStart, 13)) },
    tasks: closedTasks.map((t) => ({ ...t, createdAtMs: t.createdAt.toMillis() })),
    carriedTaskIds: carriedIds,
    target: { id: "s14", name: "Release 14" },
    users: USERS.map((u) => ({ id: uid[u.key], name: u.name })),
    appTypes: APP_TYPES,
    closedAtMs: addDays(closedStart, 13).getTime(),
  });
  await db.doc("sprintReports/s13").set({ ...report, createdBy: uid.qa1, createdAt: Timestamp.fromDate(addDays(closedStart, 13)) });

  const batch = db.batch();
  for (const { id, ...t } of closedTasks) {
    if (carriedIds.includes(id)) {
      batch.set(db.doc(`tasks/${id}`), {
        ...t,
        sprintId: "s14",
        carryOverCount: 1,
        sprintHistory: [{ sprintId: "s13", sprintName: "Release 13", finalStatusInSprint: t.status, movedAt: Timestamp.fromDate(addDays(closedStart, 13)) }],
      });
      batch.set(db.collection(`tasks/${id}/activity`).doc(), {
        actorId: uid.qa1, action: "carried_over", field: "sprintId", oldValue: "Release 13", newValue: "Release 14",
        createdAt: Timestamp.fromDate(addDays(closedStart, 13)),
      });
    } else {
      batch.set(db.doc(`tasks/${id}`), t);
    }
    batch.set(db.collection(`tasks/${id}/activity`).doc(), {
      actorId: t.reporterId, action: "created", field: null, oldValue: null, newValue: t.taskKey, createdAt: t.createdAt,
    });
  }

  // Active sprint: 23 new tasks (+2 carried = 25).
  for (let i = 0; i < 23; i++) {
    const t = makeTask(i, "s14", STATUSES[i % STATUSES.length], addDays(activeStart, i % 5));
    const ref = db.collection("tasks").doc();
    batch.set(ref, t);
    batch.set(ref.collection("activity").doc(), {
      actorId: t.reporterId, action: "created", field: null, oldValue: null, newValue: t.taskKey, createdAt: t.createdAt,
    });
    if (t.status !== "pending") {
      batch.set(ref.collection("activity").doc(), {
        actorId: t.assigneeIds[0] ?? t.reporterId, action: "updated", field: "status", oldValue: "pending", newValue: t.status,
        createdAt: Timestamp.fromDate(addDays(t.createdAt.toDate(), 1)),
      });
    }
    if (i % 4 === 0) {
      batch.set(ref.collection("comments").doc(), {
        authorId: t.reporterId, body: "Please check this against the latest build.\nThanks!",
        createdAt: Timestamp.fromDate(addDays(t.createdAt.toDate(), 1)), editedAt: null,
      });
    }
  }
  // Backlog: 3 tasks not planned into a release yet
  for (let i = 0; i < 3; i++) {
    const t = makeTask(30 + i, "backlog", i === 2 ? "on_hold" : "pending", addDays(activeStart, i));
    const ref = db.collection("tasks").doc();
    batch.set(ref, t);
    batch.set(ref.collection("activity").doc(), {
      actorId: t.reporterId, action: "created", field: null, oldValue: null, newValue: t.taskKey, createdAt: t.createdAt,
    });
  }
  await batch.commit();
  await db.doc("counters/tasks").set({ next: key });

  // Suggestion box: one new, one not planned (no pictures)
  const suggestionBase = { imageCount: 0, coverThumb: "", taskId: null, taskKey: null, sprintId: null, sprintName: null };
  await db.doc("suggestions/sg-due").set({
    ...suggestionBase,
    title: "Show due dates on My Tasks",
    details: "I check My Tasks every morning and would like to see what is due first.",
    kind: "idea",
    status: "new",
    authorId: uid.dev1,
    declineReason: "",
    handledBy: null,
    createdAt: Timestamp.fromDate(addDays(activeStart, 2)),
    updatedAt: Timestamp.fromDate(addDays(activeStart, 2)),
  });
  await db.doc("suggestions/sg-sound").set({
    ...suggestionBase,
    title: "Play a sound when a task is assigned to me",
    details: "",
    kind: "idea",
    status: "not_planned",
    authorId: uid.dev4,
    declineReason: "Browsers block sounds on pages that are not open",
    handledBy: uid.qa1,
    createdAt: Timestamp.fromDate(addDays(activeStart, 1)),
    updatedAt: Timestamp.fromDate(addDays(activeStart, 3)),
  });

  console.log(`Seeded ${USERS.length} users, ${APP_TYPES.length} App Types, 3 sprints, ${key - 1} tasks, 2 suggestions.`);
  console.log(`Sign in with any of: ${USERS.map((u) => u.email).join(", ")}  (password: ${PASSWORD})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
