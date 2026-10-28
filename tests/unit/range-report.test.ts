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
  status: "pending",
  assigneeIds: ["u1"],
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
    task({ id: "b", taskKey: "TSK-2", status: "released", createdAtMs: ms("2026-09-20T10:00:00") }),
    task({ id: "c", taskKey: "TSK-3", status: "done", descriptionText: "x\nImported from Excel: sheet", createdAtMs: ms("2026-10-02T09:00:00") }),
    task({ id: "d", taskKey: "TSK-4", appTypeId: "app2", priority: "critical", status: "on_hold", assigneeIds: [], dueDate: "2026-10-03" }),
  ];
  const changes = [
    { taskId: "a", atMs: ms("2026-10-05T12:00:00"), actorId: "u2", from: "testing", to: "done" },
    { taskId: "b", atMs: ms("2026-10-06T12:00:00"), actorId: "u1", from: "done", to: "released" },
    { taskId: "b", atMs: ms("2026-09-25T12:00:00"), actorId: "u1", from: "pending", to: "done" }, // outside range
  ];
  const r = buildRangeReport({ tasks, changes, from: "2026-10-01", to: "2026-10-31", appTypeId: null, lookups, now: new Date("2026-10-14T12:00:00") });
  const s = Object.fromEntries(r.summary.map((x) => [x.label, x.value]));

  it("counts completions only from status changes inside the range", () => {
    expect(r.completed.map((x) => x["Task ID"]).sort()).toEqual(["TSK-1", "TSK-2"]);
    expect(r.completed.find((x) => x["Task ID"] === "TSK-1")).toMatchObject({ "Completed by": "Sreevani", "Actual h": 3 });
    expect(s["Tasks completed"]).toBe(2); // done or released inside the range
    expect(s["Tasks released"]).toBe(1);
    expect(s["Bugs fixed"]).toBe(1);
  });

  it("separates imported tasks from real creations and never counts them as completed", () => {
    expect(s["Tasks created"]).toBe(2); // a and d (b is from September)
    expect(s["Tasks imported from Excel in this period"]).toBe(1);
    expect(r.completed.some((x) => x["Task ID"] === "TSK-3")).toBe(false);
  });

  it("reports the current open state", () => {
    expect(s["Open tasks now"]).toBe(1); // only d: a and c are done, b is released
    expect(s["Critical open now"]).toBe(1);
    expect(s["On hold now"]).toBe(1);
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
    expect(r.byPerson.find((p) => p.Person === "Nagma")).toMatchObject({ "Completed in range": 2, "Open now": 0 });
    expect(r.byApp.find((a) => a.App === "User App")).toMatchObject({ "Completed in range": 2, "Bugs fixed in range": 1 });
  });
});

describe("sprintProgress", () => {
  const sprint = { startDate: "2026-10-06", endDate: "2026-10-19" }; // 14 days
  const t = (status: ReportTask["status"], o: Partial<ReportTask> = {}) => ({ status, priority: "medium" as const, assigneeIds: ["u"], dueDate: null, ...o });

  it("splits tasks into stages whose percentages sum to 100", () => {
    const p = sprintProgress(
      [t("released"), t("done"), t("testing"), t("dev_done"), t("in_progress"), t("pending"), t("on_hold"), t("duplicate")],
      sprint,
      new Date("2026-10-12T10:00:00"),
    );
    // Testing and Fixed (dev done) are separate stages
    expect(p.stages.map((s) => s.key)).toEqual(["released", "done", "testing", "fixed", "inProgress", "pending", "onHold", "dropped"]);
    expect(p.stages.map((s) => s.count)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(p.stages.reduce((a, s) => a + s.pct, 0)).toBe(100);
    expect(p.completionPct).toBe(25); // Released + Duplicate = 2 of 8 (Ready to Release isn't done yet)
  });

  it("compares completion with time used", () => {
    const p = sprintProgress([t("released"), t("pending"), t("pending"), t("pending")], sprint, new Date("2026-10-12T10:00:00"));
    expect(p.dayOfSprint).toBe(7);
    expect(p.timePct).toBe(50);
    expect(p.paceDelta).toBe(-25);
    expect(p.pace).toBe("behind");
    expect(sprintProgress([t("pending")], sprint, new Date("2026-10-01")).pace).toBe("not_started");
  });

  it("counts overdue, critical, on-hold and unassigned open tasks", () => {
    const p = sprintProgress(
      [t("pending", { dueDate: "2026-10-10" }), t("done", { dueDate: "2026-10-01" }), t("on_hold", { priority: "critical", assigneeIds: [] })],
      sprint,
      new Date("2026-10-12T10:00:00"),
    );
    expect(p).toMatchObject({ overdue: 1, criticalOpen: 1, onHold: 1, unassignedOpen: 1 });
  });

  it("roundedShares always totals 100", () => {
    expect(roundedShares([1, 1, 1]).reduce((a, b) => a + b)).toBe(100);
    expect(roundedShares([0, 0])).toEqual([0, 0]);
  });
});
