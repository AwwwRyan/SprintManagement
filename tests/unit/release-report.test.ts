import { describe, expect, it } from "vitest";
import { releaseSummary, type ReportTask } from "@/lib/release-report";
import type { ReportTaskRef } from "@/types";

let n = 0;
const t = (o: Partial<ReportTask>): ReportTask => {
  n += 1;
  return {
    id: `t${n}`,
    taskKey: `TSK-${n}`,
    title: `Item ${n}`,
    type: "bug",
    status: "released",
    priority: "medium",
    appTypeId: "app1",
    assigneeIds: [],
    environment: "Staging",
    ...o,
  };
};
const ref = (id: string): ReportTaskRef => ({ taskId: id, taskKey: id, title: id, appTypeId: "app1", assigneeIds: [], status: "in_progress" });
const users = [
  { id: "u1", name: "Nagma" },
  { id: "u2", name: "Sameeh" },
];
const appTypes = [
  { id: "app1", name: "User App", color: "#111111" },
  { id: "app2", name: "Doctor App", color: "#222222" },
];

describe("releaseSummary", () => {
  const tasks = [
    t({ type: "bug", environment: "Production", priority: "critical", assigneeIds: ["u1"] }),
    t({ type: "bug", appTypeId: "app2", assigneeIds: ["u1", "u2"] }),
    t({ type: "improvement", assigneeIds: ["u2"] }),
    t({ type: "task" }),
    t({ status: "duplicate" }),
    t({ status: "closed", type: "task" }),
  ];
  const report = { carriedOver: [ref("a"), ref("b")], movedToBacklog: [ref("c")], leftIncomplete: [] };
  const s = releaseSummary(tasks, report, users, appTypes);

  it("counts released work by category, and Production bugs fixed", () => {
    expect(s.released).toEqual({ bug: 2, improvement: 1, task: 1, total: 4 });
    expect(s.productionBugsFixed).toBe(1);
  });

  it("splits everything planned into released / carried / Backlog / cancelled", () => {
    expect(s.planned.map((p) => [p.key, p.count])).toEqual([
      ["released", 4],
      ["carried", 2],
      ["backlog", 1],
      ["dropped", 2],
    ]);
  });

  it("breaks released work down by App Type and person (shared tasks count for each)", () => {
    expect(s.byAppType.map((a) => [a.name, a.bug, a.improvement, a.task, a.total])).toEqual([
      ["User App", 1, 1, 1, 3],
      ["Doctor App", 1, 0, 0, 1],
    ]);
    expect(s.byPerson.map((p) => [p.name, p.total])).toEqual([
      ["Nagma", 2],
      ["Sameeh", 2],
      ["Unassigned", 1],
    ]);
  });

  it("lists released items per category, most urgent first", () => {
    expect(s.list.bug.map((x) => x.priority)).toEqual(["critical", "medium"]);
    expect(s.list.task).toHaveLength(1); // the cancelled task isn't listed
    expect(s.releasedBugsByPriority.find((p) => p.key === "critical")?.count).toBe(1);
  });

  it("shows unfinished tasks left behind by older reports as their own segment", () => {
    const old = releaseSummary([], { carriedOver: [], leftIncomplete: [ref("x")] }, users, appTypes);
    expect(old.planned.find((p) => p.key === "left")?.count).toBe(1);
    expect(old.movedToBacklog).toBe(0);
  });
});
