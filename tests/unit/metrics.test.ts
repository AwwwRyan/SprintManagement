import { describe, expect, it } from "vitest";
import { buildSprintReport, computeSprintMetrics, daysRemaining } from "@/lib/metrics";
import type { Task } from "@/types";

type T = Pick<
  Task,
  "id" | "taskKey" | "title" | "status" | "type" | "appTypeId" | "assigneeId" | "estimatedHours" | "actualHours" | "severity"
> & { createdAtMs: number | null };

let n = 0;
function t(o: Partial<T>): T {
  n += 1;
  return {
    id: `t${n}`,
    taskKey: `TSK-${n}`,
    title: `Task ${n}`,
    status: "todo",
    type: "task",
    appTypeId: "app1",
    assigneeId: null,
    estimatedHours: null,
    actualHours: null,
    severity: null,
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
      t({ status: "done", estimatedHours: 2, actualHours: 3, assigneeId: "u1" }),
      t({ status: "done", estimatedHours: 1.5, actualHours: 1, assigneeId: "u1" }),
      t({ status: "in_progress", estimatedHours: 4, assigneeId: "u2" }),
    ];
    const m = computeSprintMetrics(tasks, users, appTypes);
    expect(m.total).toBe(3);
    expect(m.done).toBe(2);
    expect(m.completionPct).toBe(67);
    expect(m.estimatedHours).toBe(7.5);
    expect(m.actualHours).toBe(4);
    expect(m.byStatus.find((s) => s.key === "done")?.count).toBe(2);
    expect(m.byStatus).toHaveLength(7);
  });

  it("breaks down by person, with Unassigned last", () => {
    const tasks = [
      t({ assigneeId: null }),
      t({ assigneeId: "u2", status: "done", estimatedHours: 1 }),
      t({ assigneeId: "u1" }),
    ];
    const m = computeSprintMetrics(tasks, users, appTypes);
    expect(m.byPerson.map((p) => p.name)).toEqual(["Alice", "Bob", "Unassigned"]);
    expect(m.byPerson[1]).toMatchObject({ tasks: 1, done: 1, estimatedHours: 1 });
  });

  it("breaks down by App Type with completion %", () => {
    const tasks = [t({ appTypeId: "app1", status: "done" }), t({ appTypeId: "app1" }), t({ appTypeId: "app2" })];
    const m = computeSprintMetrics(tasks, users, appTypes);
    const portal = m.byAppType.find((a) => a.appTypeId === "app1");
    expect(portal).toMatchObject({ name: "Portal", total: 2, done: 1, completionPct: 50 });
    expect(m.byAppType.find((a) => a.appTypeId === "app2")?.completionPct).toBe(0);
  });

  it("counts only open bugs by severity", () => {
    const tasks = [
      t({ type: "bug", severity: "blocker" }),
      t({ type: "bug", severity: "blocker", status: "done" }),
      t({ type: "bug", severity: null }),
      t({ type: "task" }),
    ];
    const m = computeSprintMetrics(tasks, users, appTypes);
    expect(m.openBugsBySeverity.find((s) => s.key === "blocker")?.count).toBe(1);
    expect(m.openBugsBySeverity.find((s) => s.key === "unset")?.count).toBe(1);
  });

  it("labels unknown users and app types instead of crashing", () => {
    const m = computeSprintMetrics([t({ assigneeId: "ghost", appTypeId: "gone" })], users, appTypes);
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
    const done = t({ status: "done" });
    const carried = t({ status: "in_progress" });
    const left = t({ status: "todo" });
    const r = buildSprintReport({
      sprint,
      tasks: [done, carried, left],
      carriedTaskIds: [carried.id, done.id], // done tasks are never "carried"
      target: { id: "s2", name: "Sprint 2" },
      users,
      appTypes,
      closedAtMs,
    });
    expect(r.carriedOver.map((x) => x.taskId)).toEqual([carried.id]);
    expect(r.carriedOver[0]).toMatchObject({ targetSprintId: "s2", targetSprintName: "Sprint 2", status: "in_progress" });
    expect(r.leftIncomplete.map((x) => x.taskId)).toEqual([left.id]);
    expect(r.total).toBe(3);
    expect(r.done).toBe(1);
    expect(r.sprintName).toBe("Sprint 1");
  });

  it("counts bugs opened during the sprint and bugs fixed", () => {
    const r = buildSprintReport({
      sprint,
      tasks: [
        t({ type: "bug", createdAtMs: inSprint, status: "done" }),
        t({ type: "bug", createdAtMs: inSprint }),
        t({ type: "bug", createdAtMs: before, status: "done" }),
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
      tasks: [t({ status: "todo" })],
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
