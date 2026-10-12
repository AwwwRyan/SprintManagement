/** Human-readable activity-log lines (names instead of ids, labels instead of enum values). */
import {
  PRIORITY_LABELS,
  SEVERITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_TYPE_LABELS,
} from "@/lib/constants";
import type { Activity, ActivityValue } from "@/types";

export const FIELD_LABELS: Record<string, string> = {
  appTypeId: "App Type",
  type: "type",
  moduleId: "module",
  title: "title",
  description: "description",
  assigneeId: "assignee",
  priority: "priority",
  severity: "severity",
  estimatedHours: "estimated time",
  actualHours: "actual time",
  status: "status",
  dueDate: "due date",
  environment: "environment",
  remarks: "remarks",
  stepsToReproduce: "steps to reproduce",
  expectedResult: "expected result",
  actualResult: "actual result",
  sprintId: "sprint",
};

export interface Lookups {
  userName: (id: string) => string | undefined;
  appTypeName: (id: string) => string | undefined;
  moduleName: (id: string) => string | undefined;
}

export function formatValue(field: string | null, value: ActivityValue, lookups: Lookups): string {
  if (value === null || value === "") return "none";
  const s = String(value);
  switch (field) {
    case "assigneeId":
      return lookups.userName(s) ?? "unknown user";
    case "appTypeId":
      return lookups.appTypeName(s) ?? "unknown App Type";
    case "moduleId":
      return lookups.moduleName(s) ?? "unknown module";
    case "status":
      return TASK_STATUS_LABELS[s as keyof typeof TASK_STATUS_LABELS] ?? s;
    case "priority":
      return PRIORITY_LABELS[s as keyof typeof PRIORITY_LABELS] ?? s;
    case "severity":
      return SEVERITY_LABELS[s as keyof typeof SEVERITY_LABELS] ?? s;
    case "type":
      return TASK_TYPE_LABELS[s as keyof typeof TASK_TYPE_LABELS] ?? s;
    case "estimatedHours":
    case "actualHours":
      return `${s}h`;
    default:
      return s.length > 80 ? `${s.slice(0, 77)}…` : s;
  }
}

/** The sentence after the actor's name, e.g. "changed status from To Do to Done". */
export function describeActivity(a: Pick<Activity, "action" | "field" | "oldValue" | "newValue">, lookups: Lookups): string {
  switch (a.action) {
    case "created":
      return "created this task";
    case "carried_over":
      return `carried this task over from ${a.oldValue ?? "a closed sprint"} to ${a.newValue ?? "the next sprint"}`;
    case "attachment_added":
      return `added attachment ${a.newValue ?? ""}`.trim();
    case "attachment_removed":
      return `removed attachment ${a.oldValue ?? ""}`.trim();
    case "comment_added":
      return "added a comment";
    case "updated": {
      const label = FIELD_LABELS[a.field ?? ""] ?? a.field ?? "a field";
      if (a.field === "description" || a.field === "stepsToReproduce" || a.field === "expectedResult" || a.field === "actualResult") {
        return `updated ${label}`;
      }
      return `changed ${label} from ${formatValue(a.field, a.oldValue, lookups)} to ${formatValue(a.field, a.newValue, lookups)}`;
    }
    default:
      return "made a change";
  }
}
