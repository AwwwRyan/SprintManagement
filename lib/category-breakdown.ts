/**
 * Per-category dashboard numbers (Bugs / Improvements / Tasks). Like release progress, only the
 * work in flight counts: In Progress, Fixed, Testing and Ready to Release (owner, 2026-10-29).
 * Pure, no Firebase imports.
 */
import { completionPct, inProgressScope, PROGRESS_STATUSES } from "@/lib/task-model";
import { PRIORITIES, type AppType, type AppUser, type Priority, type Task, type TaskType } from "@/types";

export type BreakdownTask = Pick<Task, "id" | "taskKey" | "title" | "type" | "status" | "priority" | "appTypeId" | "assigneeIds">;

/** Tasks per progress status, plus the share that is Ready to Release. */
export interface StageCounts {
  total: number;
  inProgress: number;
  /** Fixed (dev done, waiting for QA) */
  fixed: number;
  /** Testing in Progress */
  testing: number;
  /** Ready to Release */
  ready: number;
  readyPct: number;
}

export interface AppTypeRow extends StageCounts {
  appTypeId: string;
  name: string;
  color: string;
}

export interface PriorityRow extends StageCounts {
  key: Priority;
}

export interface PersonRow extends StageCounts {
  userId: string | null;
  name: string;
}

export interface CategoryBreakdown extends StageCounts {
  type: TaskType;
  byAppType: AppTypeRow[];
  byPriority: PriorityRow[];
  byPerson: PersonRow[];
  /** the items themselves, by status (workflow order), then priority, then task number */
  items: BreakdownTask[];
}

export function stageCounts(tasks: Pick<Task, "status">[]): StageCounts {
  const n = (s: Task["status"]) => tasks.filter((t) => t.status === s).length;
  const statuses = tasks.map((t) => t.status);
  return {
    total: statuses.filter(inProgressScope).length,
    inProgress: n("in_progress"),
    fixed: n("dev_done"),
    testing: n("testing"),
    ready: n("done"),
    readyPct: completionPct(statuses),
  };
}

const keyNumber = (k: string) => Number(k.replace(/\D/g, "")) || 0;

export function categoryBreakdown(
  all: BreakdownTask[],
  type: TaskType,
  users: Pick<AppUser, "id" | "name">[],
  appTypes: Pick<AppType, "id" | "name" | "color">[],
): CategoryBreakdown {
  const tasks = all.filter((t) => t.type === type && inProgressScope(t.status));

  const byAppType = Array.from(new Set(tasks.map((t) => t.appTypeId)))
    .map((id): AppTypeRow => {
      const at = appTypes.find((a) => a.id === id);
      return { appTypeId: id, name: at?.name ?? "Unknown", color: at?.color ?? "#64748b", ...stageCounts(tasks.filter((t) => t.appTypeId === id)) };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  // Each assignee counts the item (shared items count for everyone on them).
  const people: (string | null)[] = Array.from(new Set(tasks.flatMap((t) => t.assigneeIds)));
  if (tasks.some((t) => t.assigneeIds.length === 0)) people.push(null);
  const byPerson = people
    .map(
      (userId): PersonRow => ({
        userId,
        name: userId ? (users.find((u) => u.id === userId)?.name ?? "Unknown user") : "Unassigned",
        ...stageCounts(tasks.filter((t) => (userId === null ? t.assigneeIds.length === 0 : t.assigneeIds.includes(userId)))),
      }),
    )
    .sort((a, b) => {
      if ((a.userId === null) !== (b.userId === null)) return a.userId === null ? 1 : -1;
      return b.total - a.total || a.name.localeCompare(b.name);
    });

  const statusRank = (s: Task["status"]) => (PROGRESS_STATUSES as readonly string[]).indexOf(s);
  const items = [...tasks].sort(
    (a, b) =>
      statusRank(a.status) - statusRank(b.status) ||
      PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
      keyNumber(a.taskKey) - keyNumber(b.taskKey),
  );

  return {
    type,
    ...stageCounts(tasks),
    byAppType,
    byPriority: PRIORITIES.map((key) => ({ key, ...stageCounts(tasks.filter((t) => t.priority === key)) })),
    byPerson,
    items,
  };
}
