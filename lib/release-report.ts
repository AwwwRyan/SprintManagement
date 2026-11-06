/**
 * Closed-release report: what was released, by category, App Type, person and priority, and
 * where everything planned ended up. Released (and Cancelled / Duplicate) tasks stay in their
 * release when it closes, so the report reads them live; carried-over and Backlog counts come
 * from the snapshot saved at close. Pure, no Firebase imports.
 */
import { PRODUCTION } from "@/lib/task-model";
import { PRIORITIES, TASK_TYPES, type AppType, type AppUser, type Priority, type SprintReport, type Task, type TaskType } from "@/types";

export type ReportTask = Pick<Task, "id" | "taskKey" | "title" | "type" | "status" | "priority" | "appTypeId" | "assigneeIds" | "environment">;

export type ByCategory = Record<TaskType, number> & { total: number };

export interface CategoryRow extends ByCategory {
  key: string;
  name: string;
  /** App Type colour (App Type rows) */
  color?: string;
}

export interface PlannedSegment {
  key: "released" | "carried" | "backlog" | "left" | "dropped";
  label: string;
  count: number;
}

export interface ReleaseSummary {
  released: ByCategory;
  productionBugsFixed: number;
  carried: number;
  movedToBacklog: number;
  dropped: number;
  planned: PlannedSegment[];
  byAppType: CategoryRow[];
  byPerson: CategoryRow[];
  releasedBugsByPriority: { key: Priority; count: number }[];
  /** released tasks per category, by priority then task number */
  list: Record<TaskType, ReportTask[]>;
}

const emptyCounts = (): ByCategory => ({ bug: 0, improvement: 0, task: 0, total: 0 });
function countByCategory(tasks: ReportTask[]): ByCategory {
  const c = emptyCounts();
  for (const t of tasks) {
    c[t.type] += 1;
    c.total += 1;
  }
  return c;
}
const keyNumber = (k: string) => Number(k.replace(/\D/g, "")) || 0;

export function releaseSummary(
  tasks: ReportTask[],
  report: Pick<SprintReport, "carriedOver" | "movedToBacklog" | "leftIncomplete">,
  users: Pick<AppUser, "id" | "name">[],
  appTypes: Pick<AppType, "id" | "name" | "color">[],
): ReleaseSummary {
  const released = tasks.filter((t) => t.status === "released");
  const dropped = tasks.filter((t) => t.status === "closed" || t.status === "duplicate").length;
  const carried = report.carriedOver.length;
  const movedToBacklog = report.movedToBacklog?.length ?? 0;

  const byAppType = Array.from(new Set(released.map((t) => t.appTypeId)))
    .map((id): CategoryRow => {
      const at = appTypes.find((a) => a.id === id);
      return { key: id, name: at?.name ?? "Unknown", color: at?.color, ...countByCategory(released.filter((t) => t.appTypeId === id)) };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  // a task with several assignees counts for each of them
  const people: (string | null)[] = Array.from(new Set(released.flatMap((t) => t.assigneeIds)));
  if (released.some((t) => t.assigneeIds.length === 0)) people.push(null);
  const byPerson = people
    .map(
      (id): CategoryRow => ({
        key: id ?? "none",
        name: id ? (users.find((u) => u.id === id)?.name ?? "Unknown user") : "Unassigned",
        ...countByCategory(released.filter((t) => (id === null ? t.assigneeIds.length === 0 : t.assigneeIds.includes(id)))),
      }),
    )
    .sort((a, b) => {
      if ((a.key === "none") !== (b.key === "none")) return a.key === "none" ? 1 : -1;
      return b.total - a.total || a.name.localeCompare(b.name);
    });

  const order = (a: ReportTask, b: ReportTask) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || keyNumber(a.taskKey) - keyNumber(b.taskKey);
  const list = Object.fromEntries(TASK_TYPES.map((ty) => [ty, released.filter((t) => t.type === ty).sort(order)])) as Record<TaskType, ReportTask[]>;
  const bugs = released.filter((t) => t.type === "bug");

  return {
    released: countByCategory(released),
    productionBugsFixed: bugs.filter((t) => t.environment === PRODUCTION).length,
    carried,
    movedToBacklog,
    dropped,
    planned: [
      { key: "released", label: "Released", count: released.length },
      { key: "carried", label: "Carried to the next release", count: carried },
      { key: "backlog", label: "Moved to the Backlog", count: movedToBacklog },
      // older reports: unfinished tasks could stay behind in the closed release
      ...(report.leftIncomplete.length ? [{ key: "left" as const, label: "Left unfinished", count: report.leftIncomplete.length }] : []),
      { key: "dropped", label: "Cancelled / duplicate", count: dropped },
    ],
    byAppType,
    byPerson,
    releasedBugsByPriority: PRIORITIES.map((key) => ({ key, count: bugs.filter((t) => t.priority === key).length })),
    list,
  };
}
