/**
 * Per-category dashboard numbers (Bugs / Improvements / Tasks): status, App Type, priority,
 * people, oldest open items, and a weekly reported-vs-fixed trend. Pure, no Firebase imports.
 */
import { addDays, differenceInCalendarDays, format, startOfWeek } from "date-fns";
import { completionPct, isExcluded, isOpen } from "@/lib/task-model";
import { PRIORITIES, TASK_STATUSES, type AppType, type AppUser, type CountByKey, type Priority, type Task, type TaskType } from "@/types";

export type BreakdownTask = Pick<
  Task,
  "id" | "taskKey" | "title" | "type" | "status" | "priority" | "appTypeId" | "assigneeIds" | "descriptionText"
> & { createdAtMs: number | null };

const inTesting = (s: Task["status"]) => s === "dev_done" || s === "testing";

export interface AppTypeRow {
  appTypeId: string;
  name: string;
  color: string;
  total: number;
  open: number;
  testing: number;
  ready: number;
  released: number;
  completionPct: number;
}

export interface PriorityRow {
  key: Priority;
  open: number;
  total: number;
}

export interface PersonRow {
  userId: string | null;
  name: string;
  open: number;
  testing: number;
  ready: number;
  released: number;
}

export interface OldItem {
  id: string;
  taskKey: string;
  title: string;
  status: Task["status"];
  priority: Priority;
  appTypeId: string;
  ageDays: number;
}

export interface CategoryBreakdown {
  type: TaskType;
  total: number;
  open: number;
  testing: number;
  ready: number;
  released: number;
  dropped: number;
  criticalOpen: number;
  highOpen: number;
  unassignedOpen: number;
  completionPct: number;
  /** average age in days of the open items (null when none are open) */
  avgOpenAgeDays: number | null;
  byStatus: CountByKey[];
  byAppType: AppTypeRow[];
  byPriority: PriorityRow[];
  byPerson: PersonRow[];
  oldestOpen: OldItem[];
}

export function categoryBreakdown(
  all: BreakdownTask[],
  type: TaskType,
  users: Pick<AppUser, "id" | "name">[],
  appTypes: Pick<AppType, "id" | "name" | "color">[],
  today: Date = new Date(),
): CategoryBreakdown {
  const tasks = all.filter((t) => t.type === type);
  const open = tasks.filter((t) => isOpen(t.status));
  const age = (t: BreakdownTask) => (t.createdAtMs === null ? 0 : Math.max(0, differenceInCalendarDays(today, t.createdAtMs)));
  const count = (list: BreakdownTask[], pred: (t: BreakdownTask) => boolean) => list.filter(pred).length;

  const byAppType = Array.from(new Set(tasks.map((t) => t.appTypeId)))
    .map((id): AppTypeRow => {
      const sub = tasks.filter((t) => t.appTypeId === id);
      const at = appTypes.find((a) => a.id === id);
      return {
        appTypeId: id,
        name: at?.name ?? "Unknown",
        color: at?.color ?? "#64748b",
        total: sub.length,
        open: count(sub, (t) => isOpen(t.status)),
        testing: count(sub, (t) => inTesting(t.status)),
        ready: count(sub, (t) => t.status === "done"),
        released: count(sub, (t) => t.status === "released"),
        completionPct: completionPct(sub.map((t) => t.status)),
      };
    })
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  // Each assignee counts the item (shared items count for everyone on them).
  const people: (string | null)[] = Array.from(new Set(tasks.flatMap((t) => t.assigneeIds)));
  if (tasks.some((t) => t.assigneeIds.length === 0)) people.push(null);
  const byPerson = people
    .map((userId): PersonRow => {
      const sub = tasks.filter((t) => (userId === null ? t.assigneeIds.length === 0 : t.assigneeIds.includes(userId)));
      return {
        userId,
        name: userId ? (users.find((u) => u.id === userId)?.name ?? "Unknown user") : "Unassigned",
        open: count(sub, (t) => isOpen(t.status)),
        testing: count(sub, (t) => inTesting(t.status)),
        ready: count(sub, (t) => t.status === "done"),
        released: count(sub, (t) => t.status === "released"),
      };
    })
    .sort((a, b) => {
      if ((a.userId === null) !== (b.userId === null)) return a.userId === null ? 1 : -1;
      return b.open - a.open || a.name.localeCompare(b.name);
    });

  const priorityRank = (p: Priority) => PRIORITIES.indexOf(p);
  const oldestOpen = [...open]
    .sort((a, b) => (a.createdAtMs ?? Infinity) - (b.createdAtMs ?? Infinity) || priorityRank(a.priority) - priorityRank(b.priority))
    .slice(0, 5)
    .map((t) => ({ id: t.id, taskKey: t.taskKey, title: t.title, status: t.status, priority: t.priority, appTypeId: t.appTypeId, ageDays: age(t) }));

  return {
    type,
    total: tasks.length,
    open: open.length,
    testing: count(tasks, (t) => inTesting(t.status)),
    ready: count(tasks, (t) => t.status === "done"),
    released: count(tasks, (t) => t.status === "released"),
    dropped: count(tasks, (t) => isExcluded(t.status)),
    criticalOpen: count(open, (t) => t.priority === "critical"),
    highOpen: count(open, (t) => t.priority === "high"),
    unassignedOpen: count(open, (t) => t.assigneeIds.length === 0),
    completionPct: completionPct(tasks.map((t) => t.status)),
    avgOpenAgeDays: open.length ? Math.round(open.reduce((a, t) => a + age(t), 0) / open.length) : null,
    byStatus: TASK_STATUSES.map((key) => ({ key, count: count(tasks, (t) => t.status === key) })),
    byAppType,
    byPriority: PRIORITIES.map((key) => ({
      key,
      open: count(open, (t) => t.priority === key),
      total: count(tasks, (t) => t.priority === key),
    })),
    byPerson,
    oldestOpen,
  };
}

/* ------------------------------------------------------------------ weekly trend */

export interface StatusChangeLite {
  taskId: string;
  atMs: number;
  from: string | null;
  to: string | null;
}

export interface TrendWeek {
  /** Monday of the week, "YYYY-MM-DD" */
  week: string;
  label: string;
  reported: number;
  fixed: number;
}

const IMPORTED = /Imported from Excel:/;

/**
 * Reported = items created that week (Excel imports excluded: they weren't reported then).
 * Fixed = items that moved from an open status to Ready to Release or Released that week
 * (Ready → Released is not counted again).
 */
export function weeklyTrend(
  all: BreakdownTask[],
  type: TaskType,
  changes: StatusChangeLite[],
  weeks: number,
  today: Date = new Date(),
): TrendWeek[] {
  const tasks = all.filter((t) => t.type === type);
  const ids = new Set(tasks.map((t) => t.id));
  const first = startOfWeek(addDays(today, -7 * (weeks - 1)), { weekStartsOn: 1 });
  const out: TrendWeek[] = Array.from({ length: weeks }, (_, i) => {
    const d = addDays(first, 7 * i);
    return { week: format(d, "yyyy-MM-dd"), label: format(d, "MMM d"), reported: 0, fixed: 0 };
  });
  const slot = (ms: number) => {
    const i = Math.floor(differenceInCalendarDays(ms, first) / 7);
    return i >= 0 && i < weeks ? out[i] : undefined;
  };
  for (const t of tasks) {
    if (t.createdAtMs === null || IMPORTED.test(t.descriptionText)) continue;
    const w = slot(t.createdAtMs);
    if (w) w.reported += 1;
  }
  const isDone = (s: string | null) => s === "done" || s === "released";
  for (const c of changes) {
    if (!ids.has(c.taskId) || !isDone(c.to) || isDone(c.from)) continue;
    const w = slot(c.atMs);
    if (w) w.fixed += 1;
  }
  return out;
}
