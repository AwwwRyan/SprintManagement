/** Pure planning for the close-release flow (spec §7). */
import { canGoToBacklog } from "@/lib/move-plan";
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
  /** to the next release */
  carried: CarryPlanItem[];
  /** to the Backlog */
  toBacklog: CarryPlanItem[];
  /** unfinished tasks with no destination; closing is refused while there are any */
  unassigned: string[];
  /** Ready to Release / Released tasks someone tried to send to the Backlog */
  notAllowedInBacklog: string[];
}

/**
 * Every unfinished task (anything not Released / Closed / Duplicate, including Ready to Release)
 * must go either to the next release or to the Backlog. Ready to Release tasks can only go to a
 * release. Moved tasks are appended after the destination's last order, keeping their order.
 */
export function planCarryForward(
  tasks: Pick<Task, "id" | "taskKey" | "status" | "order" | "carryOverCount">[],
  releaseIds: Iterable<string>,
  backlogIds: Iterable<string>,
  startOrder: number,
  backlogStartOrder: number = startOrder,
): CarryPlan {
  const toRelease = new Set(releaseIds);
  const toBacklogSet = new Set(backlogIds);
  const unfinished = tasks.filter((t) => !isFinished(t.status)).sort((a, b) => a.order - b.order);
  const item = (t: (typeof unfinished)[number], order: number): CarryPlanItem => ({
    taskId: t.id,
    taskKey: t.taskKey,
    finalStatusInSprint: t.status,
    newOrder: order,
    newCarryOverCount: (t.carryOverCount ?? 0) + 1,
  });
  const carried = unfinished.filter((t) => toRelease.has(t.id)).map((t, i) => item(t, startOrder + i + 1));
  const backlogged = unfinished.filter((t) => !toRelease.has(t.id) && toBacklogSet.has(t.id));
  return {
    completed: tasks.length - unfinished.length,
    carried,
    toBacklog: backlogged.filter((t) => canGoToBacklog(t.status)).map((t, i) => item(t, backlogStartOrder + i + 1)),
    unassigned: unfinished.filter((t) => !toRelease.has(t.id) && !toBacklogSet.has(t.id)).map((t) => t.taskKey),
    notAllowedInBacklog: backlogged.filter((t) => !canGoToBacklog(t.status)).map((t) => t.taskKey),
  };
}

export function carrySummary(plan: Pick<CarryPlan, "completed" | "carried" | "toBacklog">, targetName: string | null): string {
  const parts = [`${plan.completed} finished`];
  if (plan.carried.length) parts.push(`${plan.carried.length} carried to ${targetName ?? "the next release"}`);
  if (plan.toBacklog.length) parts.push(`${plan.toBacklog.length} moved to the Backlog`);
  return parts.join(", ") + ".";
}
