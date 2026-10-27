import { describe, expect, it } from "vitest";
import { applyFilters, EMPTY_FILTERS, hasActiveFilters, parseFilters, UNASSIGNED, writeFilters } from "@/lib/task-filters";
import { diffPatch, normalizePatch } from "@/lib/task-diff";
import { carrySummary, planCarryForward } from "@/lib/carry-forward";
import { chunk, formatTaskKey, initialsFromName, roundHalf, sanitizeFileName } from "@/lib/utils";
import type { Task } from "@/types";

const task = (o: Partial<Task>) =>
  ({
    id: "x",
    taskKey: "TSK-1",
    appTypeId: "app1",
    type: "task",
    moduleId: null,
    assigneeIds: [],
    status: "pending",
    priority: "medium",
    title: "Login page",
    descriptionText: "",
    order: 1,
    carryOverCount: 0,
    ...o,
  }) as Task;

describe("task filters", () => {
  const tasks = [
    task({ id: "1", taskKey: "TSK-10", title: "Login page", appTypeId: "a", status: "pending", assigneeIds: ["u1"] }),
    task({ id: "2", taskKey: "TSK-11", title: "Crash on save", type: "bug", appTypeId: "b", status: "done", priority: "high" }),
    task({ id: "3", taskKey: "TSK-12", title: "Export", descriptionText: "CSV download for reports", moduleId: "m1", appTypeId: "a" }),
    task({ id: "4", taskKey: "TSK-13", title: "Shared", appTypeId: "c", assigneeIds: ["u1", "u2"] }),
  ];

  it("returns everything with empty filters", () => {
    expect(applyFilters(tasks, EMPTY_FILTERS)).toHaveLength(4);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("combines multi-select filters with AND across fields, OR within a field", () => {
    const r = applyFilters(tasks, { ...EMPTY_FILTERS, appTypeId: ["a"], status: ["pending", "done"] });
    expect(r.map((x) => x.id)).toEqual(["1", "3"]);
  });

  it("filters unassigned tasks via the sentinel", () => {
    const r = applyFilters(tasks, { ...EMPTY_FILTERS, assigneeId: [UNASSIGNED] });
    expect(r.map((x) => x.id)).toEqual(["2", "3"]);
  });

  it("matches a task when any of its assignees is selected", () => {
    expect(applyFilters(tasks, { ...EMPTY_FILTERS, assigneeId: ["u2"] }).map((x) => x.id)).toEqual(["4"]);
    expect(applyFilters(tasks, { ...EMPTY_FILTERS, assigneeId: ["u1"] }).map((x) => x.id)).toEqual(["1", "4"]);
  });

  it("searches title, description text and task id (case-insensitive)", () => {
    expect(applyFilters(tasks, { ...EMPTY_FILTERS, q: "crash" }).map((x) => x.id)).toEqual(["2"]);
    expect(applyFilters(tasks, { ...EMPTY_FILTERS, q: "csv" }).map((x) => x.id)).toEqual(["3"]);
    expect(applyFilters(tasks, { ...EMPTY_FILTERS, q: "tsk-10" }).map((x) => x.id)).toEqual(["1"]);
  });

  it("round-trips through the URL and preserves unrelated params", () => {
    const f = { ...EMPTY_FILTERS, type: ["bug" as const], priority: ["high" as const, "low" as const], q: "save" };
    const params = writeFilters(new URLSearchParams("task=TSK-1"), f);
    expect(params.get("task")).toBe("TSK-1");
    expect(params.get("priority")).toBe("high,low");
    expect(parseFilters(params)).toEqual(f);
  });

  it("drops invalid enum values from the URL", () => {
    const f = parseFilters(new URLSearchParams("status=done,bogus&type=nope"));
    expect(f.status).toEqual(["done"]);
    expect(f.type).toEqual([]);
  });

  it("clearing filters removes their params", () => {
    const params = writeFilters(new URLSearchParams("status=done&q=x&task=TSK-1"), EMPTY_FILTERS);
    expect(params.toString()).toBe("task=TSK-1");
  });
});

describe("diffPatch / normalizePatch", () => {
  const base = task({ title: "Old", status: "pending", estimatedHours: 2, description: "{}" });

  it("keeps only changed fields", () => {
    const { changed, changes } = diffPatch(base, { title: "Old", status: "done" });
    expect(changed).toEqual({ status: "done" });
    expect(changes).toEqual([{ field: "status", oldValue: "pending", newValue: "done" }]);
  });

  it("treats null and undefined as equal (no-op save)", () => {
    expect(diffPatch(task({ dueDate: null }), { dueDate: null }).changes).toHaveLength(0);
  });

  it("does not store full description text in the activity log", () => {
    const { changed, changes } = diffPatch(base, { description: '{"type":"doc"}', descriptionText: "hello" });
    expect(changed).toEqual({ description: '{"type":"doc"}', descriptionText: "hello" });
    expect(changes).toEqual([{ field: "description", oldValue: null, newValue: null }]);
  });

  it("ignores a reordered but identical assignee list", () => {
    const t = task({ assigneeIds: ["u1", "u2"] });
    expect(diffPatch(t, { assigneeIds: ["u2", "u1"] }).changes).toHaveLength(0);
    expect(diffPatch(t, { assigneeIds: ["u1"] }).changes).toEqual([
      { field: "assigneeIds", oldValue: '["u1","u2"]', newValue: '["u1"]' },
    ]);
  });

  it("makes a task Critical when its environment becomes Production, unless a priority is given", () => {
    const t = task({ environment: "", priority: "medium" });
    expect(normalizePatch(t, { environment: "Production" })).toEqual({ environment: "Production", priority: "critical" });
    expect(normalizePatch(t, { environment: "Production", priority: "low" })).toEqual({ environment: "Production", priority: "low" });
    expect(normalizePatch(t, { environment: "Staging" })).toEqual({ environment: "Staging" });
    expect(normalizePatch(task({ environment: "Production", priority: "high" }), { environment: "Production" })).toEqual({ environment: "Production" });
  });

  it("filters by environment, including tasks with none set", () => {
    const list = [task({ id: "p", environment: "Production" }), task({ id: "s", environment: "Staging" }), task({ id: "n", environment: "" })];
    expect(applyFilters(list, { ...EMPTY_FILTERS, environment: ["Production"] }).map((x) => x.id)).toEqual(["p"]);
    expect(applyFilters(list, { ...EMPTY_FILTERS, environment: ["__none__", "Staging"] }).map((x) => x.id)).toEqual(["s", "n"]);
    expect(parseFilters(new URLSearchParams("env=Production")).environment).toEqual(["Production"]);
  });

  it("leaves a category change alone", () => {
    expect(normalizePatch(task({ type: "bug" }), { type: "task" })).toEqual({ type: "task" });
  });

  it("clears the module when the App Type changes", () => {
    const t = task({ appTypeId: "a", moduleId: "m1" });
    expect(normalizePatch(t, { appTypeId: "b" })).toMatchObject({ appTypeId: "b", moduleId: null });
    expect(normalizePatch(t, { appTypeId: "b", moduleId: "m9" })).toMatchObject({ moduleId: "m9" });
  });
});

describe("planCarryForward", () => {
  const tasks = [
    task({ id: "a", status: "released", order: 1 }),
    task({ id: "b", status: "in_progress", order: 3, carryOverCount: 1 }),
    task({ id: "c", status: "done", order: 2 }), // tested but not released: still carries
    task({ id: "d", status: "on_hold", order: 4 }),
    task({ id: "e", status: "duplicate", order: 5 }),
  ];

  it("splits unfinished tasks between the next release and the Backlog, keeping order", () => {
    const plan = planCarryForward(tasks, ["a", "b", "c"], ["d"], 1000, 5000);
    expect(plan.carried.map((c) => c.taskId)).toEqual(["c", "b"]); // "a" is Released: ignored
    expect(plan.carried.map((c) => c.newOrder)).toEqual([1001, 1002]);
    expect(plan.carried.find((c) => c.taskId === "b")).toMatchObject({ finalStatusInSprint: "in_progress", newCarryOverCount: 2 });
    expect(plan.toBacklog.map((c) => [c.taskId, c.newOrder])).toEqual([["d", 5001]]);
    expect(plan.completed).toBe(2);
    expect(plan.unassigned).toEqual([]);
  });

  it("reports unfinished tasks without a destination, and Ready to Release sent to the Backlog", () => {
    expect(planCarryForward(tasks, ["b"], [], 0).unassigned).toHaveLength(2); // c and d have no destination
    const bad = planCarryForward(tasks, ["b", "d"], ["c"], 0);
    expect(bad.notAllowedInBacklog).toHaveLength(1);
    expect(bad.toBacklog).toHaveLength(0);
  });

  it("produces the success summary", () => {
    expect(carrySummary(planCarryForward(tasks, ["b", "c"], ["d"], 0), "Release 15")).toBe(
      "2 finished, 2 carried to Release 15, 1 moved to the Backlog.",
    );
    expect(carrySummary(planCarryForward(tasks, ["b", "c", "d"], [], 0), null)).toBe("2 finished, 3 carried to the next release.");
  });
});

describe("utils", () => {
  it("formats task keys", () => expect(formatTaskKey(142)).toBe("TSK-142"));
  it("derives initials", () => {
    expect(initialsFromName("Aryan Srivastava")).toBe("AS");
    expect(initialsFromName("  madonna ")).toBe("MA");
    expect(initialsFromName("Jean Claude Van Damme")).toBe("JD");
    expect(initialsFromName("")).toBe("?");
  });
  it("chunks arrays (450-op batches)", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk(Array.from({ length: 1000 }), 450).map((c) => c.length)).toEqual([450, 450, 100]);
    expect(() => chunk([1], 0)).toThrow();
  });
  it("sanitizes storage file names", () => {
    expect(sanitizeFileName("Screen Shot 2026-01-01 at 10.00.00.png")).toBe("Screen-Shot-2026-01-01-at-10.00.00.png");
    expect(sanitizeFileName("../../etc/passwd")).toBe("..-..-etc-passwd");
    expect(sanitizeFileName("???")).toBe("image");
  });
  it("rounds to half hours", () => {
    expect(roundHalf(1.26)).toBe(1.5);
    expect(roundHalf(1.24)).toBe(1);
  });
});

describe("readableTextColor (solid App Type badges)", () => {
  it("picks white on dark/saturated colors and dark text on light ones", async () => {
    const { readableTextColor } = await import("@/lib/utils");
    expect(readableTextColor("#2a78d6")).toBe("#ffffff"); // SADM blue
    expect(readableTextColor("#eda100")).toBe("#111111"); // SP yellow
    expect(readableTextColor("#ffffff")).toBe("#111111");
    expect(readableTextColor("#000000")).toBe("#ffffff");
    expect(readableTextColor("not-a-color")).toBe("#ffffff");
  });
});

describe("remarks", () => {
  it("search matches text in remarks", () => {
    const tasks = [
      task({ id: "r1", title: "A", remarks: "waiting on backend deploy" }),
      task({ id: "r2", title: "B", remarks: "" }),
    ];
    expect(applyFilters(tasks, { ...EMPTY_FILTERS, q: "backend deploy" }).map((t) => t.id)).toEqual(["r1"]);
  });
  it("remarks edits are logged with old and new values", () => {
    const { changed, changes } = diffPatch(task({ remarks: "old note" }), { remarks: "new note" });
    expect(changed).toEqual({ remarks: "new note" });
    expect(changes).toEqual([{ field: "remarks", oldValue: "old note", newValue: "new note" }]);
  });
});
