import { describe, expect, it } from "vitest";
import { categoryBreakdown, weeklyTrend, type BreakdownTask } from "@/lib/category-breakdown";

const ms = (s: string) => new Date(s).getTime();
let n = 0;
const t = (o: Partial<BreakdownTask>): BreakdownTask => {
  n += 1;
  return {
    id: `t${n}`,
    taskKey: `TSK-${n}`,
    title: `Item ${n}`,
    type: "bug",
    status: "pending",
    priority: "medium",
    appTypeId: "app1",
    assigneeIds: [],
    descriptionText: "",
    createdAtMs: ms("2026-10-20T10:00:00"),
    ...o,
  };
};
const users = [
  { id: "u1", name: "Nagma" },
  { id: "u2", name: "Sameeh" },
];
const appTypes = [
  { id: "app1", name: "User App", color: "#111111" },
  { id: "app2", name: "Doctor App", color: "#222222" },
];
const today = new Date("2026-10-26T12:00:00");

describe("categoryBreakdown", () => {
  const tasks = [
    t({ status: "pending", priority: "critical", assigneeIds: ["u1"], createdAtMs: ms("2026-10-01T10:00:00") }),
    t({ status: "testing", appTypeId: "app2", assigneeIds: ["u1", "u2"] }),
    t({ status: "done", assigneeIds: ["u2"] }),
    t({ status: "released", appTypeId: "app2" }),
    t({ status: "duplicate" }),
    t({ type: "improvement", status: "pending" }),
  ];
  const b = categoryBreakdown(tasks, "bug", users, appTypes, today);

  it("only counts the chosen category", () => {
    expect(b.total).toBe(5);
    expect(categoryBreakdown(tasks, "improvement", users, appTypes, today).total).toBe(1);
  });

  it("splits open / testing / ready / released and leaves duplicates out of completion", () => {
    expect(b).toMatchObject({ open: 2, fixed: 0, testing: 1, ready: 1, released: 1, dropped: 1, criticalOpen: 1, unassignedOpen: 0 });
    expect(b.completionPct).toBe(50); // (ready + released) / (5 - 1 duplicate)
  });

  it("counts Fixed (dev done) and Testing separately", () => {
    const x = categoryBreakdown([t({ status: "dev_done" }), t({ status: "dev_done" }), t({ status: "testing" })], "bug", users, appTypes, today);
    expect(x).toMatchObject({ fixed: 2, testing: 1, open: 3 });
    expect(x.byAppType[0]).toMatchObject({ fixed: 2, testing: 1 });
  });

  it("breaks down by App Type, most open first (ties by name)", () => {
    expect(b.byAppType.map((a) => [a.name, a.open, a.testing, a.ready, a.released])).toEqual([
      ["Doctor App", 1, 1, 0, 1],
      ["User App", 1, 0, 1, 0],
    ]);
  });

  it("counts open items per priority", () => {
    expect(b.byPriority.find((p) => p.key === "critical")).toEqual({ key: "critical", open: 1, total: 1 });
    expect(b.byPriority.find((p) => p.key === "medium")).toEqual({ key: "medium", open: 1, total: 4 });
  });

  it("counts shared items for every assignee, Unassigned last", () => {
    expect(b.byPerson.map((p) => [p.name, p.open, p.testing, p.ready])).toEqual([
      ["Nagma", 2, 1, 0],
      ["Sameeh", 1, 1, 1],
      ["Unassigned", 0, 0, 0],
    ]);
  });

  it("lists the oldest open items with their age", () => {
    expect(b.oldestOpen.map((x) => x.ageDays)).toEqual([25, 6]);
    expect(b.avgOpenAgeDays).toBe(16);
  });

  it("handles a category with nothing in it", () => {
    const empty = categoryBreakdown([], "task", users, appTypes, today);
    expect(empty).toMatchObject({ total: 0, open: 0, completionPct: 0, avgOpenAgeDays: null, byAppType: [], oldestOpen: [] });
  });
});

describe("weeklyTrend", () => {
  // today (2026-10-26) is a Monday, so the current week starts today
  const a = t({ id: "a", createdAtMs: ms("2026-10-20T09:00:00") }); // last week (Mon 19th)
  const b = t({ id: "b", createdAtMs: ms("2026-10-13T09:00:00") }); // two weeks ago
  const imported = t({ id: "c", createdAtMs: ms("2026-10-20T09:00:00"), descriptionText: "Imported from Excel: sheet \"X\" (row 2)." });
  const other = t({ id: "d", type: "improvement", createdAtMs: ms("2026-10-20T09:00:00") });
  const changes = [
    { taskId: "a", atMs: ms("2026-10-21T10:00:00"), from: "testing", to: "done" },
    { taskId: "a", atMs: ms("2026-10-22T10:00:00"), from: "done", to: "released" }, // not counted twice
    { taskId: "b", atMs: ms("2026-10-14T10:00:00"), from: "pending", to: "released" },
    { taskId: "d", atMs: ms("2026-10-21T10:00:00"), from: "pending", to: "done" }, // other category
    { taskId: "zz", atMs: ms("2026-10-21T10:00:00"), from: "pending", to: "done" }, // not in view
  ];
  const w = weeklyTrend([a, b, imported, other], "bug", changes, 4, today);

  it("has one row per week, oldest first, starting Monday", () => {
    expect(w.map((x) => x.week)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
  });

  it("counts reported (excluding Excel imports) and fixed per week", () => {
    expect(w.map((x) => [x.reported, x.fixed])).toEqual([
      [0, 0],
      [1, 1],
      [1, 1],
      [0, 0],
    ]);
  });
});
