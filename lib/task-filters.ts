/** Task table filters: URL <-> state, and the pure filter/search function. */
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
  q: string;
}

export const EMPTY_FILTERS: TaskFilters = {
  appTypeId: [],
  type: [],
  moduleId: [],
  assigneeId: [],
  status: [],
  priority: [],
  q: "",
};

const LIST_KEYS = ["appTypeId", "type", "moduleId", "assigneeId", "status", "priority"] as const;
type ListKey = (typeof LIST_KEYS)[number];

/** URL param names (short, readable in links). */
const PARAM: Record<ListKey | "q", string> = {
  appTypeId: "app",
  type: "type",
  moduleId: "module",
  assigneeId: "assignee",
  status: "status",
  priority: "priority",
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
    q: params.get(PARAM.q) ?? "",
  };
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
  return next;
}

export function hasActiveFilters(f: TaskFilters): boolean {
  return LIST_KEYS.some((k) => f[k].length > 0) || f.q.trim() !== "";
}

type FilterableTask = Pick<
  Task,
  "appTypeId" | "type" | "moduleId" | "assigneeId" | "status" | "priority" | "title" | "descriptionText" | "taskKey"
> & { remarks?: string };

export function applyFilters<T extends FilterableTask>(tasks: T[], f: TaskFilters): T[] {
  const q = f.q.trim().toLowerCase();
  return tasks.filter((t) => {
    if (f.appTypeId.length && !f.appTypeId.includes(t.appTypeId)) return false;
    if (f.type.length && !f.type.includes(t.type)) return false;
    if (f.moduleId.length && !(t.moduleId && f.moduleId.includes(t.moduleId))) return false;
    if (f.assigneeId.length && !f.assigneeId.includes(t.assigneeId ?? UNASSIGNED)) return false;
    if (f.status.length && !f.status.includes(t.status)) return false;
    if (f.priority.length && !f.priority.includes(t.priority)) return false;
    if (q) {
      const hay = `${t.taskKey} ${t.title} ${t.descriptionText} ${t.remarks ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
