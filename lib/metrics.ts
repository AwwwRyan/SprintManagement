/**
 * Pure metric calculations shared by the live dashboard and the sprint-report snapshot.
 * No Firebase imports here, so it is fully unit-testable.
 */
import { differenceInCalendarDays, parseISO } from "date-fns";
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
