/**
 * All Tasks paging: 100 tasks per page read from Firestore (newest first). Release / Status /
 * Category filters run in the database; a task number in the search box finds that task anywhere;
 * every other filter and text search apply to the loaded page. Pure, no Firebase imports.
 */
import type { TaskFilters } from "@/lib/task-filters";
import type { TaskStatus, TaskType } from "@/types";

export const ALL_TASKS_PAGE_SIZE = 100;
/** Firestore: the "in" filters of one query may combine into at most 30 value combinations. */
export const MAX_IN_COMBINATIONS = 30;

export interface ServerFilters {
  sprintIds: string[];
  statuses: TaskStatus[];
  types: TaskType[];
}

/**
 * Which of Release / Status / Category go to the database. They're added in that order while the
 * combinations stay within Firestore's limit; anything left over is applied to the loaded page.
 */
export function serverFilters(f: Pick<TaskFilters, "sprintId" | "status" | "type">): { server: ServerFilters; leftInBrowser: string[] } {
  const server: ServerFilters = { sprintIds: [], statuses: [], types: [] };
  const leftInBrowser: string[] = [];
  let combos = 1;
  const take = <T>(values: T[], label: string): T[] => {
    if (!values.length) return [];
    if (values.length > MAX_IN_COMBINATIONS || combos * values.length > MAX_IN_COMBINATIONS) {
      leftInBrowser.push(label);
      return [];
    }
    combos *= values.length;
    return values;
  };
  server.sprintIds = take(f.sprintId, "Release");
  server.statuses = take(f.status, "Status");
  server.types = take(f.type, "Category");
  return { server, leftInBrowser };
}

/** "TSK-142", "tsk 142" or "142" → "TSK-142"; anything else → null. */
export function parseTaskNumber(q: string): string | null {
  const m = /^\s*(?:tsk[\s-]*)?(\d{1,7})\s*$/i.exec(q);
  return m ? `TSK-${Number(m[1])}` : null;
}

/** Stable key for a page query (listener identity). */
export function pageQueryKey(server: ServerFilters, cursor: { createdAtMs: number; id: string } | null): string {
  const part = (v: string[]) => [...v].sort().join(",");
  return `all-tasks|r=${part(server.sprintIds)}|s=${part(server.statuses)}|t=${part(server.types)}|after=${cursor ? `${cursor.createdAtMs}:${cursor.id}` : ""}`;
}
