import { describe, expect, it } from "vitest";
import { changeFor, planUndo, pushStep, UNDO_LIMIT, type UndoStep } from "@/lib/undo-stack";

const task = (o: Record<string, unknown> = {}) =>
  ({
    id: "t1",
    taskKey: "TSK-1",
    sprintId: "s14",
    type: "bug",
    appTypeId: "a",
    moduleId: "m1",
    environment: "Staging",
    priority: "medium",
    status: "in_progress",
    ...o,
  }) as Parameters<typeof changeFor>[0];

describe("changeFor", () => {
  it("records before/after of the edited field", () => {
    expect(changeFor(task(), { status: "testing" })).toMatchObject({ before: { status: "in_progress" }, after: { status: "testing" }, movedToBacklog: false });
  });
  it("includes side effects, so undo restores them too", () => {
    expect(changeFor(task(), { environment: "Production" })).toMatchObject({
      before: { environment: "Staging", priority: "medium" },
      after: { environment: "Production", priority: "critical" },
    });
    expect(changeFor(task(), { appTypeId: "b" })?.before).toEqual({ appTypeId: "a", moduleId: "m1" });
  });
  it("is null for a no-op, and flags a move to the Backlog", () => {
    expect(changeFor(task(), { status: "in_progress" })).toBeNull();
    expect(changeFor(task(), { status: "pending" })?.movedToBacklog).toBe(true);
  });
});

describe("planUndo", () => {
  const step: UndoStep = { label: "Status", changes: [changeFor(task(), { status: "testing" })!] };

  it("undoes when the task still has the value we set, and redoes after", () => {
    const now = new Map([["t1", task({ status: "testing" })]]);
    expect(planUndo(step, now, "undo").apply[0].patch).toEqual({ status: "in_progress" });
    const back = new Map([["t1", task({ status: "in_progress" })]]);
    expect(planUndo(step, back, "redo").apply[0].patch).toEqual({ status: "testing" });
  });

  it("skips tasks someone changed since, tasks gone from the view, and moves to the Backlog", () => {
    expect(planUndo(step, new Map([["t1", task({ status: "done" })]]), "undo").skipped[0].reason).toBe("Someone changed it since");
    expect(planUndo(step, new Map(), "undo").skipped[0].reason).toBe("It's no longer in this view");
    const toBacklog: UndoStep = { label: "Status", changes: [changeFor(task(), { status: "pending" })!] };
    expect(planUndo(toBacklog, new Map([["t1", task({ status: "pending" })]]), "undo").skipped[0].reason).toMatch(/Backlog/);
  });
});

it("pushStep keeps the newest steps only", () => {
  let stack: UndoStep[] = [];
  for (let i = 0; i < UNDO_LIMIT + 5; i++) stack = pushStep(stack, { label: String(i), changes: [] });
  expect(stack).toHaveLength(UNDO_LIMIT);
  expect(stack.at(-1)?.label).toBe(String(UNDO_LIMIT + 4));
});
