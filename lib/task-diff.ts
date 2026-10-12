/** Pure helpers for turning a task patch into activity-log entries. */
import type { ActivityValue, Task, TaskPatch } from "@/types";

export interface FieldChange {
  field: string;
  oldValue: ActivityValue;
  newValue: ActivityValue;
}

/** Fields whose values are too large to store in the activity log. */
const SUMMARY_ONLY_FIELDS = new Set(["description", "stepsToReproduce", "expectedResult", "actualResult"]);

/** `descriptionText` is derived from `description`; never log it separately. */
const DERIVED_FIELDS = new Set(["descriptionText"]);

function toActivityValue(v: unknown): ActivityValue {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  return JSON.stringify(v);
}

/**
 * Returns only fields that actually changed, so no-op saves (blur without edit)
 * don't create writes or activity noise.
 */
export function diffPatch(task: Partial<Task>, patch: TaskPatch): { changed: TaskPatch; changes: FieldChange[] } {
  const changed: Record<string, unknown> = {};
  const changes: FieldChange[] = [];
  for (const [field, newValue] of Object.entries(patch) as [keyof TaskPatch, unknown][]) {
    if (newValue === undefined) continue;
    const oldValue = task[field];
    if (oldValue === newValue || (oldValue == null && newValue == null)) continue;
    changed[field] = newValue;
    if (DERIVED_FIELDS.has(field)) continue;
    changes.push(
      SUMMARY_ONLY_FIELDS.has(field)
        ? { field, oldValue: null, newValue: null }
        : { field, oldValue: toActivityValue(oldValue), newValue: toActivityValue(newValue) },
    );
  }
  // descriptionText alone (without description) still needs its write, but description
  // always travels with it, so it never needs its own activity entry.
  return { changed: changed as TaskPatch, changes };
}

/** Applies the bug-only rule: severity is null unless type === "bug". */
export function normalizePatch(task: Pick<Task, "type" | "appTypeId" | "moduleId">, patch: TaskPatch): TaskPatch {
  const out: TaskPatch = { ...patch };
  const nextType = patch.type ?? task.type;
  if (nextType !== "bug") out.severity = null;
  if (patch.appTypeId !== undefined && patch.appTypeId !== task.appTypeId && patch.moduleId === undefined) {
    out.moduleId = null; // App Type changed: the module belongs to the old App Type
  }
  return out;
}
