/**
 * Pure metric calculations shared by the live dashboard and the sprint-report snapshot.
 * No Firebase imports here, so it is fully unit-testable.
 */
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  SEVERITIES,
  TASK_STATUSES,
  TASK_TYPES,
  type AppType,
  type AppTypeBreakdown,
  type AppUser,
  type CountByKey,
  type PersonBreakdown,
  type ReportTaskRef,
  type Sprint,
  type SprintMetrics,
  type SprintReport,
  type Task,
  type TaskStatus,
} from "@/types";

type MetricTask = Pick<
  Task,
  "status" | "type" | "appTypeId" | "assigneeId" | "estimatedHours" | "actualHours" | "severity"
>;

const pct = (done: number, total: number) => (total === 0 ? 0 : Math.round((done / total) * 100));
const sum = (ns: (number | null)[]) => ns.reduce<number>((a, n) => a + (n ?? 0), 0);

export function computeSprintMetrics(
  tasks: MetricTask[],
  users: Pick<AppUser, "id" | "name">[],
  appTypes: Pick<AppType, "id" | "name" | "color">[],
): SprintMetrics {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;

  const byStatus: CountByKey[] = TASK_STATUSES.map((key) => ({
    key,
    count: tasks.filter((t) => t.status === key).length,
  }));

  const byType: CountByKey[] = TASK_TYPES.map((key) => ({
    key,
    count: tasks.filter((t) => t.type === key).length,
  }));

  const appTypeIds = Array.from(new Set(tasks.map((t) => t.appTypeId)));
  const byAppType: AppTypeBreakdown[] = appTypeIds
    .map((id) => {
      const subset = tasks.filter((t) => t.appTypeId === id);
      const d = subset.filter((t) => t.status === "done").length;
      const at = appTypes.find((a) => a.id === id);
      return {
        appTypeId: id,
        name: at?.name ?? "Unknown",
        color: at?.color ?? "#64748b",
        total: subset.length,
        done: d,
        completionPct: pct(d, subset.length),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const assigneeIds = Array.from(new Set(tasks.map((t) => t.assigneeId)));
  const byPerson: PersonBreakdown[] = assigneeIds
    .map((userId) => {
      const subset = tasks.filter((t) => t.assigneeId === userId);
      return {
        userId,
        name: userId ? (users.find((u) => u.id === userId)?.name ?? "Unknown user") : "Unassigned",
        tasks: subset.length,
        done: subset.filter((t) => t.status === "done").length,
        estimatedHours: sum(subset.map((t) => t.estimatedHours)),
        actualHours: sum(subset.map((t) => t.actualHours)),
      };
    })
    .sort((a, b) => {
      if (a.userId === null) return 1;
      if (b.userId === null) return -1;
      return a.name.localeCompare(b.name);
    });

  const openBugs = tasks.filter((t) => t.type === "bug" && t.status !== "done");
  const openBugsBySeverity: CountByKey[] = [
    ...SEVERITIES.map((key) => ({ key, count: openBugs.filter((t) => t.severity === key).length })),
    { key: "unset", count: openBugs.filter((t) => !t.severity).length },
  ];

  return {
    total,
    done,
    completionPct: pct(done, total),
    byStatus,
    byType,
    byAppType,
    byPerson,
    openBugsBySeverity,
    estimatedHours: sum(tasks.map((t) => t.estimatedHours)),
    actualHours: sum(tasks.map((t) => t.actualHours)),
  };
}

/* ------------------------------------------------------------------ sprint progress */

export type ProgressStage = "done" | "qa" | "inProgress" | "todo" | "blocked";

export interface SprintProgress {
  total: number;
  /** Tasks per stage, in display order. `pct` values add up to 100 (largest-remainder rounding). */
  stages: { key: ProgressStage; count: number; pct: number }[];
  completionPct: number;
  /** Sprint calendar: day N of M (inclusive), and the % of time used. */
  dayOfSprint: number;
  sprintDays: number;
  timePct: number;
  /** completion % minus time %; negative = behind schedule. Null before the sprint starts. */
  paceDelta: number | null;
  pace: "ahead" | "on_track" | "behind" | "not_started";
  overdue: number;
  criticalOpen: number;
  blocked: number;
  unassignedOpen: number;
}

const STAGE_OF: Record<TaskStatus, ProgressStage> = {
  done: "done",
  ready_for_qa: "qa",
  qa_testing: "qa",
  in_progress: "inProgress",
  todo: "todo",
  reopened: "todo",
  blocked: "blocked",
};
const STAGES: ProgressStage[] = ["done", "qa", "inProgress", "todo", "blocked"];

/** Percentages that always sum to exactly 100 (or 0 for an empty sprint). */
export function roundedShares(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  const raw = counts.map((c) => (c / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

export function sprintProgress(
  tasks: Pick<Task, "status" | "priority" | "assigneeId" | "dueDate">[],
  sprint: Pick<Sprint, "startDate" | "endDate">,
  today: Date = new Date(),
): SprintProgress {
  const counts = STAGES.map((k) => tasks.filter((t) => STAGE_OF[t.status] === k).length);
  const shares = roundedShares(counts);
  const total = tasks.length;
  const done = counts[0];
  const completionPct = total === 0 ? 0 : Math.round((done / total) * 100);

  const start = parseISO(sprint.startDate);
  const sprintDays = Math.max(1, differenceInCalendarDays(parseISO(sprint.endDate), start) + 1);
  const elapsed = differenceInCalendarDays(today, start) + 1; // today counts as a day
  const dayOfSprint = Math.min(Math.max(elapsed, 0), sprintDays);
  const timePct = Math.round((dayOfSprint / sprintDays) * 100);
  const paceDelta = dayOfSprint === 0 ? null : completionPct - timePct;
  const pace = paceDelta === null ? "not_started" : paceDelta >= 10 ? "ahead" : paceDelta >= -10 ? "on_track" : "behind";

  const todayStr = format(today, "yyyy-MM-dd");
  const open = tasks.filter((t) => t.status !== "done");
  return {
    total,
    stages: STAGES.map((key, i) => ({ key, count: counts[i], pct: shares[i] })),
    completionPct,
    dayOfSprint,
    sprintDays,
    timePct,
    paceDelta,
    pace,
    overdue: open.filter((t) => t.dueDate !== null && t.dueDate < todayStr).length,
    criticalOpen: open.filter((t) => t.priority === "critical").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
    unassignedOpen: open.filter((t) => !t.assigneeId).length,
  };
}

/** Calendar days from `today` until `endDate` ("YYYY-MM-DD"); 0 on/after the end date. */
export function daysRemaining(endDate: string, today: Date = new Date()): number {
  return Math.max(0, differenceInCalendarDays(parseISO(endDate), today));
}

export interface ReportInput {
  sprint: Pick<Sprint, "id" | "name" | "goal" | "startDate" | "endDate">;
  /** Every task in the sprint at close time (before carry-forward). */
  tasks: (MetricTask & Pick<Task, "id" | "taskKey" | "title"> & { createdAtMs: number | null })[];
  carriedTaskIds: string[];
  target: { id: string; name: string } | null;
  users: Pick<AppUser, "id" | "name">[];
  appTypes: Pick<AppType, "id" | "name" | "color">[];
  closedAtMs: number;
}

export type ReportSnapshot = Omit<SprintReport, "id" | "createdBy" | "createdAt">;

/** Builds the immutable report saved to sprintReports/{sprintId}. */
export function buildSprintReport(input: ReportInput): ReportSnapshot {
  const { sprint, tasks, carriedTaskIds, target, users, appTypes, closedAtMs } = input;
  const metrics = computeSprintMetrics(tasks, users, appTypes);
  const carried = new Set(carriedTaskIds);

  const ref = (t: ReportInput["tasks"][number]): ReportTaskRef => ({
    taskId: t.id,
    taskKey: t.taskKey,
    title: t.title,
    appTypeId: t.appTypeId,
    assigneeId: t.assigneeId,
    status: t.status,
  });

  const unfinished = tasks.filter((t) => t.status !== "done");
  const carriedOver = unfinished
    .filter((t) => carried.has(t.id))
    .map((t) => ({ ...ref(t), targetSprintId: target?.id ?? "", targetSprintName: target?.name ?? "" }));
  const leftIncomplete = unfinished.filter((t) => !carried.has(t.id)).map(ref);

  const startMs = new Date(`${sprint.startDate}T00:00:00`).getTime();
  const bugs = tasks.filter((t) => t.type === "bug");
  const bugsOpened = bugs.filter(
    (t) => t.createdAtMs !== null && t.createdAtMs >= startMs && t.createdAtMs <= closedAtMs,
  ).length;
  const bugsFixed = bugs.filter((t) => t.status === "done").length;

  return {
    ...metrics,
    sprintId: sprint.id,
    sprintName: sprint.name,
    goal: sprint.goal,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    bugsOpened,
    bugsFixed,
    carriedOver,
    leftIncomplete,
  };
}
