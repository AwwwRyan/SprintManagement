/**
 * Moving tasks between releases and the Backlog (QA/Admin). Pure, no Firebase imports.
 * Rule (owner's call): Ready to Release and Released tasks never go to the Backlog.
 */
import { BACKLOG_ID, type Task, type TaskStatus } from "@/types";

export const canGoToBacklog = (status: TaskStatus) => status !== "done" && status !== "released";

export interface MoveItem {
  taskId: string;
  taskKey: string;
  fromSprintId: string;
  status: TaskStatus;
  newOrder: number;
}

export interface MovePlan {
  moving: MoveItem[];
  skipped: { taskKey: string; reason: string }[];
}

/** Plans moving `tasks` into `targetId`, appended after `startOrder` in their current relative order. */
export function planTaskMove(
  tasks: Pick<Task, "id" | "taskKey" | "status" | "sprintId" | "order">[],
  targetId: string,
  startOrder: number,
): MovePlan {
  const skipped: MovePlan["skipped"] = [];
  const ok = [...tasks]
    .sort((a, b) => a.order - b.order)
    .filter((t) => {
      if (t.sprintId === targetId) {
        skipped.push({ taskKey: t.taskKey, reason: "already there" });
        return false;
      }
      if (targetId === BACKLOG_ID && !canGoToBacklog(t.status)) {
        skipped.push({ taskKey: t.taskKey, reason: t.status === "done" ? "Ready to Release tasks stay in a release" : "Released tasks stay in their release" });
        return false;
      }
      return true;
    });
  return {
    moving: ok.map((t, i) => ({ taskId: t.id, taskKey: t.taskKey, fromSprintId: t.sprintId, status: t.status, newOrder: startOrder + i + 1 })),
    skipped,
  };
}
