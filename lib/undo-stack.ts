/**
 * Undo / redo for edits made in the task table (Ctrl+Z, Ctrl+Y). Each step is one edit or one
 * whole paste, with the before and after value of every field it changed (including the side
 * effects normalizePatch adds, e.g. Production → Critical). Pure, no Firebase imports.
 */
import { normalizePatch } from "@/lib/task-diff";
import { BACKLOG_STATUS } from "@/lib/task-model";
import { BACKLOG_ID, type Task, type TaskPatch } from "@/types";

export interface UndoChange {
  taskId: string;
  taskKey: string;
  before: TaskPatch;
  after: TaskPatch;
  /** the edit sent the task to the Backlog (setting the Backlog status moves it there) */
  movedToBacklog: boolean;
}

export interface UndoStep {
  /** what was done, for the toast ("Status of TSK-12", "Paste into Status (4 tasks)") */
  label: string;
  changes: UndoChange[];
}

/** Undo history keeps this many steps. */
export const UNDO_LIMIT = 50;

const same = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x) => b.includes(x)) : (a ?? null) === (b ?? null);

type EditableTask = Pick<Task, "id" | "taskKey" | "sprintId" | "type" | "appTypeId" | "moduleId" | "environment" | "priority">;
const valueOf = (t: EditableTask, k: string): unknown => (t as unknown as Record<string, unknown>)[k];

/** The change one edit makes to one task (null when it changes nothing). */
export function changeFor(task: EditableTask, patch: TaskPatch): UndoChange | null {
  const full = normalizePatch(task, patch) as Record<string, unknown>;
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(full)) {
    if (same(valueOf(task, k), v)) continue;
    before[k] = valueOf(task, k) ?? null;
    after[k] = v;
  }
  if (Object.keys(after).length === 0) return null;
  return {
    taskId: task.id,
    taskKey: task.taskKey,
    before: before as TaskPatch,
    after: after as TaskPatch,
    movedToBacklog: after.status === BACKLOG_STATUS && task.sprintId !== BACKLOG_ID,
  };
}

export interface UndoPlan<T extends EditableTask = EditableTask> {
  /** patches to write now */
  apply: { task: T; patch: TaskPatch }[];
  /** tasks left alone, with why */
  skipped: { taskKey: string; reason: string }[];
}

/**
 * Plans undoing (`direction` "undo": write `before`) or redoing ("redo": write `after`) a step
 * against the tasks as they are now. A task someone has changed since, or that has left this
 * view, is skipped rather than overwritten.
 */
export function planUndo<T extends EditableTask>(step: UndoStep, current: Map<string, T>, direction: "undo" | "redo"): UndoPlan<T> {
  const plan: UndoPlan<T> = { apply: [], skipped: [] };
  for (const ch of step.changes) {
    const task = current.get(ch.taskId);
    if (direction === "undo" && ch.movedToBacklog) {
      plan.skipped.push({ taskKey: ch.taskKey, reason: "It moved to the Backlog; use Move to… to bring it back" });
      continue;
    }
    if (!task) {
      plan.skipped.push({ taskKey: ch.taskKey, reason: "It's no longer in this view" });
      continue;
    }
    const expected = (direction === "undo" ? ch.after : ch.before) as Record<string, unknown>;
    const target = direction === "undo" ? ch.before : ch.after;
    if (Object.entries(expected).some(([k, v]) => !same(valueOf(task, k), v))) {
      plan.skipped.push({ taskKey: ch.taskKey, reason: "Someone changed it since" });
      continue;
    }
    plan.apply.push({ task, patch: target });
  }
  return plan;
}

/** Adds a step to the undo history (oldest dropped past the limit). */
export function pushStep(stack: UndoStep[], step: UndoStep): UndoStep[] {
  return [...stack, step].slice(-UNDO_LIMIT);
}
