import fs from "node:fs";
import path from "node:path";
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp } from "firebase/firestore";

export const PROJECT_ID = "demo-sprint-manager";

export const UIDS = {
  admin: "u-admin",
  qa: "u-qa",
  dev: "u-dev",
  dev2: "u-dev2",
  inactive: "u-inactive",
} as const;

const ROLE_OF: Record<string, "admin" | "qa" | "developer"> = {
  [UIDS.admin]: "admin",
  [UIDS.qa]: "qa",
  [UIDS.dev]: "developer",
  [UIDS.dev2]: "developer",
  [UIDS.inactive]: "developer",
};

export async function setupEnv(): Promise<RulesTestEnvironment> {
  const root = process.cwd();
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(root, "firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
}

export function as(env: RulesTestEnvironment, uid: keyof typeof UIDS | null): RulesTestContext {
  if (uid === null) return env.unauthenticatedContext();
  const id = UIDS[uid];
  return env.authenticatedContext(id, { role: ROLE_OF[id] });
}

export function baseTask(overrides: Record<string, unknown> = {}) {
  return {
    taskKey: "TSK-1",
    sprintId: "s-active",
    order: 1,
    appTypeId: "app1",
    type: "task",
    moduleId: null,
    title: "A task",
    description: "",
    descriptionText: "",
    assigneeIds: [UIDS.dev],
    priority: "medium",
    estimatedHours: null,
    actualHours: null,
    status: "pending",
    reporterId: UIDS.qa,
    dueDate: null,
    environment: "",
    stepsToReproduce: "",
    expectedResult: "",
    actualResult: "",
    attachmentCount: 0,
    carryOverCount: 0,
    sprintHistory: [],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    updatedBy: UIDS.qa,
    ...overrides,
  };
}

/** Seeds users, master data, three sprints and two tasks with rules disabled. */
export async function seed(env: RulesTestEnvironment) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [key, uid] of Object.entries(UIDS)) {
      await setDoc(doc(db, "users", uid), {
        name: key,
        email: `${key}@example.com`,
        role: ROLE_OF[uid],
        designation: "",
        active: key !== "inactive",
        initials: key.slice(0, 2).toUpperCase(),
      });
    }
    await setDoc(doc(db, "appTypes", "app1"), { name: "App One", code: "A1", color: "#3b82f6", active: true });
    const sprint = (status: string) => ({
      name: `Sprint ${status}`,
      goal: "",
      startDate: "2026-01-01",
      endDate: "2026-01-14",
      status,
      createdBy: UIDS.qa,
      createdAt: Timestamp.now(),
      closedAt: null,
      closedBy: null,
    });
    await setDoc(doc(db, "sprints", "s-active"), sprint("active"));
    await setDoc(doc(db, "sprints", "s-planned"), sprint("planned"));
    await setDoc(doc(db, "sprints", "s-closed"), sprint("closed"));
    await setDoc(doc(db, "meta", "activeSprint"), { sprintId: "s-active" });
    await setDoc(doc(db, "counters", "tasks"), { next: 3 });
    // t-dev: assigned to dev, reported by qa. t-other: belongs to nobody the developer is.
    await setDoc(doc(db, "tasks", "t-dev"), baseTask());
    await setDoc(doc(db, "tasks", "t-other"), baseTask({ taskKey: "TSK-2", assigneeIds: [UIDS.dev2] }));
    await setDoc(doc(db, "tasks", "t-closed"), baseTask({ taskKey: "TSK-0", sprintId: "s-closed" }));
  });
}
