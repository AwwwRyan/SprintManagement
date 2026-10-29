/**
 * Status semantics and legacy-value translation. Pure (no Firebase), so every consumer —
 * dashboard, close-release dialog, carry-forward, reports, export — agrees on the same rules.
 *
 * Team decisions (DECISIONS.md "Workflow statuses"):
 * - Done = testing passed but not yet live; it still carries into the next release.
 * - Released / Closed / Duplicate are finished: never carried forward.
 * - Release progress (owner, 2026-10-29) counts only the work in flight: In Progress, Fixed,
 *   Testing and Ready to Release. Completion % = Ready to Release ÷ those four. Backlog,
 *   Released, Cancelled and Duplicate are left out. One rule everywhere.
 */
import type { TaskStatus, TaskType } from "@/types";

/** Work is complete (counts toward completion %). */
export const isComplete = (s: TaskStatus) => s === "done" || s === "released";

/** Dropped work (Cancelled / Duplicate): never carried forward; counts as done in completion %. */
export const isExcluded = (s: TaskStatus) => s === "closed" || s === "duplicate";

/** Finished for the release: not offered for carry-forward. */
export const isFinished = (s: TaskStatus) => s === "released" || isExcluded(s);

/** Still being worked on (pending, in progress, on hold, dev done, testing). */
export const isOpen = (s: TaskStatus) => !isComplete(s) && !isExcluded(s);

/** The statuses release progress counts, in workflow order. */
export const PROGRESS_STATUSES = ["in_progress", "dev_done", "testing", "done"] as const satisfies readonly TaskStatus[];

/** Counted in release progress (In Progress, Fixed, Testing, Ready to Release). */
export const inProgressScope = (s: TaskStatus) => (PROGRESS_STATUSES as readonly TaskStatus[]).includes(s);

/** Counts as done for release progress: Ready to Release. */
export const countsAsDone = (s: TaskStatus) => s === "done";

/** Completion % (0 for none): Ready to Release ÷ the tasks in progress scope; other statuses are ignored. */
export function completionPct(statuses: TaskStatus[]): number {
  const scoped = statuses.filter(inProgressScope);
  if (scoped.length === 0) return 0;
  return Math.round((scoped.filter(countsAsDone).length / scoped.length) * 100);
}

/* ------------------------------------------------------------------ legacy values */

/** Old status values (before 2026-10-22) → new ones. */
export const LEGACY_STATUS: Record<string, TaskStatus> = {
  todo: "pending",
  ready_for_qa: "dev_done",
  qa_testing: "testing",
  reopened: "in_progress",
  blocked: "pending",
  // 2026-10-29: On Hold was merged into Backlog
  on_hold: "pending",
};

/** Old type values → new categories. */
export const LEGACY_TYPE: Record<string, TaskType> = {
  requirement: "task",
  enhancement: "improvement",
};

/** Human labels for old values that may still appear in activity history. */
export const LEGACY_LABELS: Record<string, string> = {
  todo: "To Do",
  ready_for_qa: "Ready for QA",
  qa_testing: "QA Testing",
  reopened: "Reopened",
  blocked: "Blocked",
  requirement: "Requirement",
  enhancement: "Enhancement",
};

export function normalizeStatus(s: unknown): TaskStatus {
  const v = String(s ?? "");
  return (LEGACY_STATUS[v] ?? v) as TaskStatus;
}

export function normalizeType(t: unknown): TaskType {
  const v = String(t ?? "");
  return (LEGACY_TYPE[v] ?? v) as TaskType;
}

/** assigneeIds from new docs, or [assigneeId] from old ones. */
export function normalizeAssignees(data: { assigneeIds?: unknown; assigneeId?: unknown }): string[] {
  if (Array.isArray(data.assigneeIds)) return data.assigneeIds.filter((x): x is string => typeof x === "string");
  return typeof data.assigneeId === "string" && data.assigneeId ? [data.assigneeId] : [];
}

/** Same members regardless of order. */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

/* ------------------------------------------------------------------ environment */

export const PRODUCTION = "Production";
/** Filter value for tasks with no environment set. */
export const NO_ENVIRONMENT = "__none__";
/** Bugs must say where they were found (owner's rule, 2026-10-27); other categories may leave it empty. */
export const requiresEnvironment = (type: TaskType) => type === "bug";

/** The Backlog status (stored as "pending"): a task with it lives in the Backlog. */
export const BACKLOG_STATUS: TaskStatus = "pending";
