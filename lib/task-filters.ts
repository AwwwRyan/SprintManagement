/** Task table filters: URL <-> state, and the pure filter/search function. */
import { DATE_FIELDS, matchesDate, type DatedTask, type DateFilter } from "@/lib/date-filter";
import {
  PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  type Priority,
  type Task,
  type TaskStatus,
  type TaskType,
} from "@/types";

/** Sentinel used in the assignee filter for tasks with no assignee. */
export const UNASSIGNED = "__none__";

export interface TaskFilters {
  appTypeId: string[];
  type: TaskType[];
  moduleId: string[];
  assigneeId: string[];
  status: TaskStatus[];
  priority: Priority[];
  /** release / Backlog ids (All Tasks) */
  sprintId: string[];
  q: string;
  /** which date (created / due / release) and an inclusive range; null = no date filter */
  date: DateFilter | null;
}

export const EMPTY_FILTERS: TaskFilters = {
  appTypeId: [],
  type: [],
  moduleId: [],
  assigneeId: [],
  status: [],
  priority: [],
  sprintId: [],
  q: "",
  date: null,
};

const LIST_KEYS = ["appTypeId", "type", "moduleId", "assigneeId", "status", "priority", "sprintId"] as const;
type ListKey = (typeof LIST_KEYS)[number];

/** URL param names (short, readable in links). */
const PARAM: Record<ListKey | "q", string> = {
  appTypeId: "app",
  type: "type",
  moduleId: "module",
  assigneeId: "assignee",
  status: "status",
  priority: "priority",
  sprintId: "release",
  q: "q",
};

function oneOf<T extends string>(allowed: readonly T[]) {
  return (v: string): v is T => (allowed as readonly string[]).includes(v);
}

interface ParamsLike {
  get(name: string): string | null;
}

export function parseFilters(params: ParamsLike): TaskFilters {
  const list = (key: ListKey) =>
    (params.get(PARAM[key]) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    appTypeId: list("appTypeId"),
    type: list("type").filter(oneOf(TASK_TYPES)),
    moduleId: list("moduleId"),
    assigneeId: list("assigneeId"),
    status: list("status").filter(oneOf(TASK_STATUSES)),
    priority: list("priority").filter(oneOf(PRIORITIES)),
    sprintId: list("sprintId"),
    q: params.get(PARAM.q) ?? "",
    date: parseDate(params),
  };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** ?date=due&from=2026-10-01&to=2026-10-31 (either end may be missing). */
function parseDate(params: ParamsLike): DateFilter | null {
  const field = params.get("date");
  if (!field || !(DATE_FIELDS as readonly string[]).includes(field)) return null;
  const from = params.get("from");
  const to = params.get("to");
  const ok = (v: string | null) => (v && ISO_DAY.test(v) ? v : null);
  if (!ok(from) && !ok(to)) return null;
  return { field: field as DateFilter["field"], from: ok(from), to: ok(to) };
}

/** Writes filters into `base` (other params such as ?task= are preserved). */
export function writeFilters(base: URLSearchParams, filters: TaskFilters): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const key of LIST_KEYS) {
    const values = filters[key];
    if (values.length) next.set(PARAM[key], values.join(","));
    else next.delete(PARAM[key]);
  }
  if (filters.q.trim()) next.set(PARAM.q, filters.q);
  else next.delete(PARAM.q);
  for (const k of ["date", "from", "to"]) next.delete(k);
  if (filters.date && (filters.date.from || filters.date.to)) {
    next.set("date", filters.date.field);
    if (filters.date.from) next.set("from", filters.date.from);
    if (filters.date.to) next.set("to", filters.date.to);
  }
  return next;
}

export function hasActiveFilters(f: TaskFilters): boolean {
  return LIST_KEYS.some((k) => f[k].length > 0) || f.q.trim() !== "" || !!(f.date && (f.date.from || f.date.to));
}

type FilterableTask = Pick<
  Task,
  "appTypeId" | "type" | "moduleId" | "assigneeIds" | "status" | "priority" | "title" | "descriptionText" | "taskKey" | "sprintId"
> & { remarks?: string } & DatedTask;

export function applyFilters<T extends FilterableTask>(tasks: T[], f: TaskFilters): T[] {
  const q = f.q.trim().toLowerCase();
  return tasks.filter((t) => {
    if (f.appTypeId.length && !f.appTypeId.includes(t.appTypeId)) return false;
    if (f.type.length && !f.type.includes(t.type)) return false;
    if (f.moduleId.length && !(t.moduleId && f.moduleId.includes(t.moduleId))) return false;
    if (f.assigneeId.length) {
      const ids = t.assigneeIds.length ? t.assigneeIds : [UNASSIGNED];
      if (!ids.some((id) => f.assigneeId.includes(id))) return false;
    }
    if (f.status.length && !f.status.includes(t.status)) return false;
    if (f.priority.length && !f.priority.includes(t.priority)) return false;
    if (f.sprintId.length && !f.sprintId.includes(t.sprintId)) return false;
    if (!matchesDate(t, f.date)) return false;
    if (q) {
      const hay = `${t.taskKey} ${t.title} ${t.descriptionText} ${t.remarks ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
