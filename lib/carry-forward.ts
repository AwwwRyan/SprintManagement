/** Pure planning for the close-sprint / carry-forward flow (spec §7). */
import { isFinished } from "@/lib/task-model";
import type { Task } from "@/types";

export interface CarryPlanItem {
  taskId: string;
  taskKey: string;
  finalStatusInSprint: Task["status"];
  newOrder: number;
  newCarryOverCount: number;
}

export interface CarryPlan {
  /** Released / Closed / Duplicate: stay in the closing release. */
  completed: number;
  carried: CarryPlanItem[];
  leftIncomplete: number;
}

/**
 * Decides which tasks move. Anything not Released / Closed / Duplicate can be carried
 * (including Done = tested but not live yet); selected ids of finished tasks are ignored. Carried tasks are appended after `startOrder`, keeping their
 * relative order from the closing sprint.
 */
export function planCarryForward(
  tasks: Pick<Task, "id" | "taskKey" | "status" | "order" | "carryOverCount">[],
  selectedIds: Iterable<string>,
  startOrder: number,
): CarryPlan {
  const selected = new Set(selectedIds);
  const unfinished = tasks.filter((t) => !isFinished(t.status)).sort((a, b) => a.order - b.order);
  const carried = unfinished
    .filter((t) => selected.has(t.id))
    .map((t, i) => ({
      taskId: t.id,
      taskKey: t.taskKey,
      finalStatusInSprint: t.status,
      newOrder: startOrder + i + 1,
      newCarryOverCount: (t.carryOverCount ?? 0) + 1,
    }));
  return {
    completed: tasks.length - unfinished.length,
    carried,
    leftIncomplete: unfinished.length - carried.length,
  };
}

export function carrySummary(plan: CarryPlan, targetName: string | null): string {
  const parts = [`${plan.completed} finished`];
  if (plan.carried.length) parts.push(`${plan.carried.length} carried to ${targetName ?? "the next release"}`);
  parts.push(`${plan.leftIncomplete} left incomplete`);
  return parts.join(", ") + ".";
}
