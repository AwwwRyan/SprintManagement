import { describe, expect, it } from "vitest";
import { buildRangeReport, presetRange, rangeBounds, type ReportTask } from "@/lib/range-report";
import { roundedShares, sprintProgress } from "@/lib/metrics";

const ms = (s: string) => new Date(s).getTime();
const task = (o: Partial<ReportTask>): ReportTask => ({
  id: "t",
  taskKey: "TSK-1",
  title: "T",
  appTypeId: "app1",
  type: "task",
  priority: "medium",
  status: "todo",
  assigneeId: "u1",
  reporterId: "u2",
  sprintId: "s1",
  dueDate: null,
  estimatedHours: null,
  actualHours: null,
  descriptionText: "",
  createdAtMs: ms("2026-10-01T10:00:00"),
  ...o,
});
const lookups = {
  userName: (id: string | null) => (id ? ({ u1: "Nagma", u2: "Sreevani" } as Record<string, string>)[id] ?? "?" : "Unassigned"),
  appName: (id: string) => ({ app1: "User App", app2: "Doctor App" } as Record<string, string>)[id] ?? "?",
  sprintName: () => "Sprint 1",
};

describe("presetRange", () => {
  const wed = new Date("2026-10-14T12:00:00"); // a Wednesday
  it("weeks start Monday", () => {
    expect(presetRange("this_week", wed)).toEqual({ from: "2026-10-12", to: "2026-10-14" });
    expect(presetRange("last_week", wed)).toEqual({ from: "2026-10-05", to: "2026-10-11" });
  });
  it("months", () => {
    expect(presetRange("this_month", wed)).toEqual({ from: "2026-10-01", to: "2026-10-14" });
    expect(presetRange("last_month", wed)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
  it("bounds are inclusive of the whole last day", () => {
    const { fromMs, toMs } = rangeBounds("2026-10-01", "2026-10-01");
    expect(toMs - fromMs).toBe(86_400_000 - 1);
  });
});

describe("buildRangeReport", () => {
  const tasks = [
    task({ id: "a", taskKey: "TSK-1", type: "bug", status: "done", actualHours: 3 }),
    task({ id: "b", taskKey: "TSK-2", status: "in_progress", createdAtMs: ms("2026-09-20T10:00:00") }),
    task({ id: "c", taskKey: "TSK-3", status: "done", descriptionText: "x\nImported from Excel: sheet", createdAtMs: ms("2026-10-02T09:00:00") }),
    task({ id: "d", taskKey: "TSK-4", appTypeId: "app2", priority: "critical", status: "blocked", assigneeId: null, dueDate: "2026-10-03" }),
  ];
  const changes = [
    { taskId: "a", atMs: ms("2026-10-05T12:00:00"), actorId: "u2", from: "qa_testing", to: "done" },
    { taskId: "b", atMs: ms("2026-10-06T12:00:00"), actorId: "u1", from: "done", to: "reopened" },
    { taskId: "b", atMs: ms("2026-09-25T12:00:00"), actorId: "u1", from: "todo", to: "done" }, // outside range
  ];
  const r = buildRangeReport({ tasks, changes, from: "2026-10-01", to: "2026-10-31", appTypeId: null, lookups, now: new Date("2026-10-14T12:00:00") });
  const s = Object.fromEntries(r.summary.map((x) => [x.label, x.value]));

  it("counts completions only from status changes inside the range", () => {
    expect(r.completed.map((x) => x["Task ID"])).toEqual(["TSK-1"]);
    expect(r.completed[0]).toMatchObject({ "Completed by": "Sreevani", "Actual h": 3 });
    expect(s["Tasks completed"]).toBe(1);
    expect(s["Bugs fixed"]).toBe(1);
    expect(s["Tasks reopened"]).toBe(1);
  });

  it("separates imported tasks from real creations and never counts them as completed", () => {
    expect(s["Tasks created"]).toBe(2); // a and d (b is from September)
    expect(s["Tasks imported from Excel in this period"]).toBe(1);
    expect(r.completed.some((x) => x["Task ID"] === "TSK-3")).toBe(false);
  });

  it("reports the current open state", () => {
    expect(s["Open tasks now"]).toBe(2);
    expect(s["Critical open now"]).toBe(1);
    expect(s["Blocked now"]).toBe(1);
    expect(s["Overdue now"]).toBe(1);
    expect(r.openNow[0]["Task ID"]).toBe("TSK-4"); // critical first
  });

  it("filters by App Type", () => {
    const only = buildRangeReport({ tasks, changes, from: "2026-10-01", to: "2026-10-31", appTypeId: "app2", lookups });
    expect(only.openNow.map((x) => x["Task ID"])).toEqual(["TSK-4"]);
    expect(only.completed).toHaveLength(0);
    expect(only.byApp.map((x) => x.App)).toEqual(["Doctor App"]);
  });

  it("breaks down by person and app", () => {
    expect(r.byPerson.find((p) => p.Person === "Nagma")).toMatchObject({ "Completed in range": 1, "Open now": 1 });
    expect(r.byApp.find((a) => a.App === "User App")).toMatchObject({ "Completed in range": 1, "Bugs fixed in range": 1 });
  });
});

describe("sprintProgress", () => {
  const sprint = { startDate: "2026-10-06", endDate: "2026-10-19" }; // 14 days
  const t = (status: ReportTask["status"], o: Partial<ReportTask> = {}) => ({ status, priority: "medium" as const, assigneeId: "u", dueDate: null, ...o });

  it("splits tasks into stages whose percentages sum to 100", () => {
    const p = sprintProgress([t("done"), t("done"), t("qa_testing"), t("in_progress"), t("todo"), t("reopened"), t("blocked")], sprint, new Date("2026-10-12T10:00:00"));
    expect(p.stages.map((s) => s.count)).toEqual([2, 1, 1, 2, 1]);
    expect(p.stages.reduce((a, s) => a + s.pct, 0)).toBe(100);
    expect(p.completionPct).toBe(29);
  });

  it("compares completion with time used", () => {
    const p = sprintProgress([t("done"), t("todo"), t("todo"), t("todo")], sprint, new Date("2026-10-12T10:00:00"));
    expect(p.dayOfSprint).toBe(7);
    expect(p.timePct).toBe(50);
    expect(p.paceDelta).toBe(-25);
    expect(p.pace).toBe("behind");
    expect(sprintProgress([t("todo")], sprint, new Date("2026-10-01")).pace).toBe("not_started");
  });

  it("counts overdue, critical, blocked and unassigned open tasks", () => {
    const p = sprintProgress(
      [t("todo", { dueDate: "2026-10-10" }), t("done", { dueDate: "2026-10-01" }), t("blocked", { priority: "critical", assigneeId: null })],
      sprint,
      new Date("2026-10-12T10:00:00"),
    );
    expect(p).toMatchObject({ overdue: 1, criticalOpen: 1, blocked: 1, unassignedOpen: 1 });
  });

  it("roundedShares always totals 100", () => {
    expect(roundedShares([1, 1, 1]).reduce((a, b) => a + b)).toBe(100);
    expect(roundedShares([0, 0])).toEqual([0, 0]);
  });
});
