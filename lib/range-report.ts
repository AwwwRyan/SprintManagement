/**
 * Date-range report ("what happened between <from> and <to>"), exported to Excel from the
 * dashboard. Pure: callers pass tasks + status-change activity; no Firebase imports.
 *
 * "Completed in range" = a status change to Done inside the range (from the activity log).
 * Tasks that were imported already Done have no such change, so they never count as
 * completed in a range (their real completion date isn't known).
 */
import { addDays, endOfDay, endOfMonth, format, startOfDay, startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns";
import { PRIORITY_LABELS, TASK_STATUS_LABELS, TASK_TYPE_LABELS } from "@/lib/constants";
import type { Priority, Task, TaskStatus, TaskType } from "@/types";

export type RangePreset = "this_week" | "last_week" | "this_month" | "last_month" | "custom";

/** Weeks start on Monday. Returns inclusive "YYYY-MM-DD" bounds. */
export function presetRange(preset: Exclude<RangePreset, "custom">, today: Date = new Date()): { from: string; to: string } {
  const d = (x: Date) => format(x, "yyyy-MM-dd");
  const week = (x: Date) => startOfWeek(x, { weekStartsOn: 1 });
  switch (preset) {
    case "this_week":
      return { from: d(week(today)), to: d(today) };
    case "last_week": {
      const s = week(subWeeks(today, 1));
      return { from: d(s), to: d(addDays(s, 6)) };
    }
    case "this_month":
      return { from: d(startOfMonth(today)), to: d(today) };
    case "last_month": {
      const m = subMonths(today, 1);
      return { from: d(startOfMonth(m)), to: d(endOfMonth(m)) };
    }
  }
}

/** Inclusive local-time millisecond bounds for "YYYY-MM-DD" dates. */
export function rangeBounds(from: string, to: string): { fromMs: number; toMs: number } {
  return {
    fromMs: startOfDay(new Date(`${from}T00:00:00`)).getTime(),
    toMs: endOfDay(new Date(`${to}T00:00:00`)).getTime(),
  };
}

export type ReportTask = Pick<
  Task,
  "id" | "taskKey" | "title" | "appTypeId" | "type" | "priority" | "status" | "assigneeId" | "reporterId" | "sprintId" | "dueDate" | "estimatedHours" | "actualHours" | "descriptionText"
> & { createdAtMs: number | null; remarks?: string; releaseDate?: string | null };

export interface StatusChange {
  taskId: string;
  atMs: number;
  actorId: string;
  from: string | null;
  to: string | null;
}

export interface Lookups {
  userName: (id: string | null) => string;
  appName: (id: string) => string;
  sprintName: (id: string) => string;
}

export interface RangeReport {
  from: string;
  to: string;
  appTypeId: string | null;
  generatedAt: string;
  summary: { label: string; value: number | string }[];
  completed: Record<string, string | number>[];
  created: Record<string, string | number>[];
  openNow: Record<string, string | number>[];
  byPerson: Record<string, string | number>[];
  byApp: Record<string, string | number>[];
}

const isImported = (t: ReportTask) => t.descriptionText.includes("Imported from Excel:");
const fmtDate = (ms: number | null) => (ms === null ? "" : format(new Date(ms), "yyyy-MM-dd HH:mm"));

export function buildRangeReport(args: {
  tasks: ReportTask[];
  changes: StatusChange[];
  from: string;
  to: string;
  appTypeId: string | null;
  lookups: Lookups;
  now?: Date;
}): RangeReport {
  const { from, to, appTypeId, lookups } = args;
  const now = args.now ?? new Date();
  const { fromMs, toMs } = rangeBounds(from, to);
  const tasks = appTypeId ? args.tasks.filter((t) => t.appTypeId === appTypeId) : args.tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const inRange = (ms: number | null) => ms !== null && ms >= fromMs && ms <= toMs;
  const changes = args.changes.filter((c) => byId.has(c.taskId) && inRange(c.atMs)).sort((a, b) => a.atMs - b.atMs);

  // Last change to Done within the range, per task
  const doneChange = new Map<string, StatusChange>();
  for (const c of changes) if (c.to === "done") doneChange.set(c.taskId, c);
  const reopenedIds = new Set(changes.filter((c) => c.to === "reopened").map((c) => c.taskId));

  const createdTasks = tasks.filter((t) => inRange(t.createdAtMs));
  const importedCreated = createdTasks.filter(isImported).length;
  const completedTasks = Array.from(doneChange.values()).map((c) => ({ c, t: byId.get(c.taskId)! }));
  const open = tasks.filter((t) => t.status !== "done");
  const today = format(now, "yyyy-MM-dd");

  const row = (t: ReportTask) => ({
    "Task ID": t.taskKey,
    Title: t.title,
    App: lookups.appName(t.appTypeId),
    Type: TASK_TYPE_LABELS[t.type as TaskType],
    Priority: PRIORITY_LABELS[t.priority as Priority],
    Assignee: lookups.userName(t.assigneeId),
    Release: lookups.sprintName(t.sprintId),
    "Release date": t.releaseDate ?? "",
    Remarks: t.remarks ?? "",
  });

  const people = new Set<string | null>([...tasks.map((t) => t.assigneeId)]);
  const byPerson = Array.from(people)
    .map((uid) => {
      const mine = (x: ReportTask) => x.assigneeId === uid;
      return {
        Person: lookups.userName(uid),
        "Completed in range": completedTasks.filter(({ t }) => mine(t)).length,
        "Created in range (assigned)": createdTasks.filter(mine).length,
        "Open now": open.filter(mine).length,
        "Open bugs now": open.filter((t) => mine(t) && t.type === "bug").length,
        "Estimated h (open)": open.filter(mine).reduce((a, t) => a + (t.estimatedHours ?? 0), 0),
        "Actual h (completed in range)": completedTasks.filter(({ t }) => mine(t)).reduce((a, { t }) => a + (t.actualHours ?? 0), 0),
      };
    })
    .filter((r) => (r["Completed in range"] as number) + (r["Created in range (assigned)"] as number) + (r["Open now"] as number) > 0)
    .sort((a, b) => (b["Completed in range"] as number) - (a["Completed in range"] as number) || String(a.Person).localeCompare(String(b.Person)));

  const apps = Array.from(new Set(tasks.map((t) => t.appTypeId)));
  const byApp = apps
    .map((id) => {
      const inApp = (x: ReportTask) => x.appTypeId === id;
      return {
        App: lookups.appName(id),
        "Created in range": createdTasks.filter(inApp).length,
        "Completed in range": completedTasks.filter(({ t }) => inApp(t)).length,
        "Bugs fixed in range": completedTasks.filter(({ t }) => inApp(t) && t.type === "bug").length,
        "Open now": open.filter(inApp).length,
        "Critical open now": open.filter((t) => inApp(t) && t.priority === "critical").length,
      };
    })
    .sort((a, b) => String(a.App).localeCompare(String(b.App)));

  const bugsCreated = createdTasks.filter((t) => t.type === "bug").length;
  const bugsFixed = completedTasks.filter(({ t }) => t.type === "bug").length;

  return {
    from,
    to,
    appTypeId,
    generatedAt: format(now, "yyyy-MM-dd HH:mm"),
    summary: [
      { label: "Period", value: `${from} to ${to}` },
      { label: "App Type", value: appTypeId ? lookups.appName(appTypeId) : "All" },
      { label: "Tasks created", value: createdTasks.length - importedCreated },
      ...(importedCreated ? [{ label: "Tasks imported from Excel in this period", value: importedCreated }] : []),
      { label: "Tasks completed", value: completedTasks.length },
      { label: "Tasks reopened", value: reopenedIds.size },
      { label: "Bugs reported", value: bugsCreated },
      { label: "Bugs fixed", value: bugsFixed },
      { label: "Open tasks now", value: open.length },
      { label: "Critical open now", value: open.filter((t) => t.priority === "critical").length },
      { label: "Blocked now", value: open.filter((t) => t.status === "blocked").length },
      { label: "Overdue now", value: open.filter((t) => t.dueDate !== null && t.dueDate < today).length },
      { label: "Generated", value: format(now, "yyyy-MM-dd HH:mm") },
    ],
    completed: completedTasks
      .sort((a, b) => a.c.atMs - b.c.atMs)
      .map(({ c, t }) => ({ ...row(t), "Completed on": fmtDate(c.atMs), "Completed by": lookups.userName(c.actorId), "Actual h": t.actualHours ?? "" })),
    created: createdTasks
      .sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0))
      .map((t) => ({ ...row(t), "Status now": TASK_STATUS_LABELS[t.status as TaskStatus], "Reported by": lookups.userName(t.reporterId), "Created on": fmtDate(t.createdAtMs) })),
    openNow: open
      .sort((a, b) => ["critical", "high", "medium", "low"].indexOf(a.priority) - ["critical", "high", "medium", "low"].indexOf(b.priority))
      .map((t) => ({ ...row(t), Status: TASK_STATUS_LABELS[t.status as TaskStatus], "Due date": t.dueDate ?? "", "Estimated h": t.estimatedHours ?? "" })),
    byPerson,
    byApp,
  };
}
