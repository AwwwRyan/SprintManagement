import { describe, expect, it } from "vitest";
import { buildSprintReport, computeSprintMetrics, daysRemaining, roundedShares, sprintProgress } from "@/lib/metrics";
import type { Task } from "@/types";

type T = Pick<
  Task,
  "id" | "taskKey" | "title" | "status" | "type" | "appTypeId" | "assigneeIds" | "estimatedHours" | "actualHours" | "priority"
> & { createdAtMs: number | null };

let n = 0;
function t(o: Partial<T>): T {
  n += 1;
  return {
    id: `t${n}`,
    taskKey: `TSK-${n}`,
    title: `Task ${n}`,
    status: "pending",
    type: "task",
    appTypeId: "app1",
    assigneeIds: [],
    estimatedHours: null,
    actualHours: null,
    priority: "medium",
    createdAtMs: null,
    ...o,
  };
}

const users = [
  { id: "u1", name: "Alice" },
  { id: "u2", name: "Bob" },
];
const appTypes = [
  { id: "app1", name: "Portal", color: "#111111" },
  { id: "app2", name: "Mobile", color: "#222222" },
];

describe("computeSprintMetrics", () => {
  it("handles an empty sprint", () => {
    const m = computeSprintMetrics([], users, appTypes);
    expect(m.total).toBe(0);
    expect(m.completionPct).toBe(0);
    expect(m.byAppType).toEqual([]);
    expect(m.byPerson).toEqual([]);
  });

  it("computes totals, completion and hour sums", () => {
    const tasks = [
      t({ status: "done", estimatedHours: 2, actualHours: 3, assigneeIds: ["u1"] }),
      t({ status: "released", estimatedHours: 1.5, actualHours: 1, assigneeIds: ["u1"] }),
      t({ status: "in_progress", estimatedHours: 4, assigneeIds: ["u2"] }),
    ];
    const m = computeSprintMetrics(tasks, users, appTypes);
    expect(m.total).toBe(3);
    expect(m.done).toBe(1); // Ready to Release
    expect(m.completionPct).toBe(50); // 1 Ready of 2 in progress scope (Released is left out)
    expect(m.estimatedHours).toBe(7.5);
    expect(m.actualHours).toBe(4);
    expect(m.byStatus.find((s) => s.key === "done")?.count).toBe(1);
    expect(m.byStatus).toHaveLength(8); // On Hold was merged into Backlog
  });

  it("completion = Ready to Release ÷ (In Progress + Fixed + Testing + Ready); other statuses are left out", () => {
    const tasks = [
      t({ status: "done" }),
      t({ status: "testing" }),
      t({ status: "dev_done" }),
      t({ status: "in_progress" }),
      t({ status: "pending" }),
      t({ status: "closed" }),
      t({ status: "duplicate" }),
      t({ status: "released" }),
    ];
    const m = computeSprintMetrics(tasks, users, appTypes);
    expect(m.done).toBe(1);
    expect(m.completionPct).toBe(25);
  });

  it("gives every assignee the task's full hours", () => {
    const m = computeSprintMetrics([t({ assigneeIds: ["u1", "u2"], estimatedHours: 6, status: "done" })], users, appTypes);
    expect(m.byPerson).toHaveLength(2);
    for (const p of m.byPerson) expect(p).toMatchObject({ tasks: 1, done: 1, estimatedHours: 6 });
  });

  it("breaks down by person, with Unassigned last", () => {
    const tasks = [
      t({ assigneeIds: [] }),
      t({ assigneeIds: ["u2"], status: "done", estimatedHours: 1 }),
      t({ assigneeIds: ["u1"] }),
    ];
    const m = computeSprintMetrics(tasks, users, appTypes);
    expect(m.byPerson.map((p) => p.name)).toEqual(["Alice", "Bob", "Unassigned"]);
    expect(m.byPerson[1]).toMatchObject({ tasks: 1, done: 1, estimatedHours: 1 });
  });

  it("breaks down by App Type with completion %", () => {
    const tasks = [t({ appTypeId: "app1", status: "done" }), t({ appTypeId: "app1", status: "testing" }), t({ appTypeId: "app2", status: "in_progress" })];
    const m = computeSprintMetrics(tasks, users, appTypes);
    const portal = m.byAppType.find((a) => a.appTypeId === "app1");
    expect(portal).toMatchObject({ name: "Portal", total: 2, done: 1, completionPct: 50, inProgress: 0, fixed: 0, testing: 1 });
    expect(m.byAppType.find((a) => a.appTypeId === "app2")?.completionPct).toBe(0);
  });

  it("counts only open bugs by priority", () => {
    const tasks = [
      t({ type: "bug", priority: "critical" }),
      t({ type: "bug", priority: "critical", status: "done" }),
      t({ type: "bug", priority: "critical", status: "duplicate" }),
      t({ type: "bug", priority: "low", status: "pending" }), // Backlog (was On Hold)
      t({ type: "task", priority: "critical" }),
    ];
    const m = computeSprintMetrics(tasks, users, appTypes);
    expect(m.openBugsByPriority.find((s) => s.key === "critical")?.count).toBe(1);
    expect(m.openBugsByPriority.find((s) => s.key === "low")?.count).toBe(1);
  });

  it("labels unknown users and app types instead of crashing", () => {
    const m = computeSprintMetrics([t({ assigneeIds: ["ghost"], appTypeId: "gone" })], users, appTypes);
    expect(m.byPerson[0].name).toBe("Unknown user");
    expect(m.byAppType[0].name).toBe("Unknown");
  });
});

describe("buildSprintReport", () => {
  const sprint = { id: "s1", name: "Sprint 1", goal: "Ship", startDate: "2026-03-01", endDate: "2026-03-14" };
  const inSprint = new Date("2026-03-05T10:00:00").getTime();
  const before = new Date("2026-02-20T10:00:00").getTime();
  const closedAtMs = new Date("2026-03-14T18:00:00").getTime();

  it("splits unfinished tasks into carried and left incomplete", () => {
    const released = t({ status: "released" });
    const carried = t({ status: "in_progress" });
    const left = t({ status: "pending" });
    const r = buildSprintReport({
      sprint,
      tasks: [released, carried, left],
      carriedTaskIds: [carried.id, released.id], // released tasks are never "carried"
      target: { id: "s2", name: "Sprint 2" },
      users,
      appTypes,
      closedAtMs,
    });
    expect(r.carriedOver.map((x) => x.taskId)).toEqual([carried.id]);
    expect(r.carriedOver[0]).toMatchObject({ targetSprintId: "s2", targetSprintName: "Sprint 2", status: "in_progress" });
    expect(r.leftIncomplete.map((x) => x.taskId)).toEqual([left.id]);
    expect(r.total).toBe(3);
    expect(r.done).toBe(0); // nothing Ready to Release
    expect(r.sprintName).toBe("Sprint 1");
  });

  it("carries Done (tested, not released) tasks", () => {
    const done = t({ status: "done" });
    const r = buildSprintReport({
      sprint,
      tasks: [done],
      carriedTaskIds: [done.id],
      target: { id: "s2", name: "Sprint 2" },
      users,
      appTypes,
      closedAtMs,
    });
    expect(r.carriedOver.map((x) => x.taskId)).toEqual([done.id]);
  });

  it("counts bugs opened during the sprint and bugs fixed", () => {
    const r = buildSprintReport({
      sprint,
      tasks: [
        t({ type: "bug", createdAtMs: inSprint, status: "done" }),
        t({ type: "bug", createdAtMs: inSprint }),
        t({ type: "bug", createdAtMs: before, status: "released" }),
        t({ type: "task", createdAtMs: inSprint }),
      ],
      carriedTaskIds: [],
      target: null,
      users,
      appTypes,
      closedAtMs,
    });
    expect(r.bugsOpened).toBe(2);
    expect(r.bugsFixed).toBe(2);
  });

  it("contains no undefined values (Firestore rejects them)", () => {
    const r = buildSprintReport({
      sprint,
      tasks: [t({ status: "pending" })],
      carriedTaskIds: [],
      target: null,
      users,
      appTypes,
      closedAtMs,
    });
    expect(JSON.stringify(r)).not.toContain("undefined");
    const hasUndefined = (v: unknown): boolean =>
      v === undefined || (typeof v === "object" && v !== null && Object.values(v).some(hasUndefined));
    expect(hasUndefined(r)).toBe(false);
  });
});

describe("daysRemaining", () => {
  it("counts calendar days and never goes negative", () => {
    const today = new Date("2026-03-10T15:00:00");
    expect(daysRemaining("2026-03-14", today)).toBe(4);
    expect(daysRemaining("2026-03-10", today)).toBe(0);
    expect(daysRemaining("2026-03-01", today)).toBe(0);
  });
});

describe("sprintProgress", () => {
  const t = (status: Task["status"]) => ({ status });

  it("counts only In Progress, Fixed, Testing and Ready to Release; completion = Ready ÷ those", () => {
    const p = sprintProgress([t("released"), t("done"), t("testing"), t("dev_done"), t("in_progress"), t("pending"), t("duplicate"), t("closed")]);
    expect(p.stages.map((s) => s.key)).toEqual(["done", "testing", "fixed", "inProgress"]);
    expect(p.stages.map((s) => s.count)).toEqual([1, 1, 1, 1]);
    expect(p.stages.reduce((a, s) => a + s.pct, 0)).toBe(100);
    expect(p.total).toBe(4);
    expect(p.completionPct).toBe(25); // 1 Ready to Release of 4
  });

  it("is 0% with nothing in flight", () => {
    expect(sprintProgress([t("released"), t("pending")])).toMatchObject({ total: 0, completionPct: 0 });
  });

  it("roundedShares always totals 100", () => {
    expect(roundedShares([1, 1, 1]).reduce((a, b) => a + b)).toBe(100);
    expect(roundedShares([0, 0])).toEqual([0, 0]);
  });
});
