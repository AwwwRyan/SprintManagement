import { describe, expect, it } from "vitest";
import { categoryBreakdown, stageCounts, type BreakdownTask } from "@/lib/category-breakdown";

let n = 0;
const t = (o: Partial<BreakdownTask>): BreakdownTask => {
  n += 1;
  return {
    id: `t${n}`,
    taskKey: `TSK-${n}`,
    title: `Item ${n}`,
    type: "bug",
    status: "in_progress",
    priority: "medium",
    appTypeId: "app1",
    assigneeIds: [],
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

describe("categoryBreakdown", () => {
  const tasks = [
    t({ status: "in_progress", priority: "critical", assigneeIds: ["u1"] }),
    t({ status: "testing", appTypeId: "app2", assigneeIds: ["u1", "u2"] }),
    t({ status: "done", assigneeIds: ["u2"] }),
    t({ status: "dev_done", appTypeId: "app2" }),
    t({ status: "released", appTypeId: "app2" }), // left out
    t({ status: "pending" }), // Backlog: left out
    t({ status: "duplicate" }), // left out
    t({ type: "improvement", status: "in_progress" }),
  ];
  const b = categoryBreakdown(tasks, "bug", users, appTypes);

  it("counts only the chosen category, in the four progress statuses", () => {
    expect(b).toMatchObject({ total: 4, inProgress: 1, fixed: 1, testing: 1, ready: 1, readyPct: 25 });
    expect(categoryBreakdown(tasks, "improvement", users, appTypes).total).toBe(1);
  });

  it("breaks down by App Type, largest first", () => {
    expect(b.byAppType.map((a) => [a.name, a.total, a.inProgress, a.fixed, a.testing, a.ready])).toEqual([
      ["Doctor App", 2, 0, 1, 1, 0],
      ["User App", 2, 1, 0, 0, 1],
    ]);
  });

  it("breaks down by priority", () => {
    expect(b.byPriority.find((p) => p.key === "critical")).toMatchObject({ total: 1, inProgress: 1 });
    expect(b.byPriority.find((p) => p.key === "medium")).toMatchObject({ total: 3, ready: 1, readyPct: 33 });
  });

  it("counts shared items for every assignee, Unassigned last", () => {
    expect(b.byPerson.map((p) => [p.name, p.total, p.ready])).toEqual([
      ["Nagma", 2, 0],
      ["Sameeh", 2, 1],
      ["Unassigned", 1, 0],
    ]);
  });

  it("lists the items in workflow order, then by priority", () => {
    expect(b.items.map((i) => i.status)).toEqual(["in_progress", "dev_done", "testing", "done"]);
    const x = categoryBreakdown([t({ priority: "low" }), t({ priority: "critical" })], "bug", users, appTypes);
    expect(x.items.map((i) => i.priority)).toEqual(["critical", "low"]);
  });

  it("handles a category with nothing in it", () => {
    expect(categoryBreakdown([], "task", users, appTypes)).toMatchObject({ total: 0, readyPct: 0, byAppType: [], items: [] });
    expect(stageCounts([{ status: "released" }])).toMatchObject({ total: 0, readyPct: 0 });
  });
});
