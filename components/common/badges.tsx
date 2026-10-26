import { cn, readableTextColor } from "@/lib/utils";
import {
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  SPRINT_STATUS_COLORS,
  SPRINT_STATUS_LABELS,
  TASK_STATUS_COLORS,
  TASK_STATUS_LABELS,
  TASK_TYPE_COLORS,
  TASK_TYPE_LABELS,
} from "@/lib/constants";
import type { AppType, Priority, Sprint, SprintStatus, TaskStatus, TaskType } from "@/types";

const base = "inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium";

export function TypeBadge({ type }: { type: TaskType }) {
  return <span className={cn(base, TASK_TYPE_COLORS[type])}>{TASK_TYPE_LABELS[type]}</span>;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={cn(base, TASK_STATUS_COLORS[status])}>{TASK_STATUS_LABELS[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={cn(base, PRIORITY_COLORS[priority])}>{PRIORITY_LABELS[priority]}</span>;
}

export function SprintStatusBadge({ status }: { status: SprintStatus | "backlog" }) {
  return <span className={cn(base, SPRINT_STATUS_COLORS[status])}>{SPRINT_STATUS_LABELS[status]}</span>;
}

/** App Type badge: solid admin-chosen color, with black or white text, whichever reads better. */
export function AppTypeBadge({ appType, className }: { appType: AppType | undefined; className?: string }) {
  if (!appType) return <span className={cn(base, "bg-muted text-muted-foreground", className)}>Unknown</span>;
  return (
    <span
      className={cn(base, "font-semibold", className)}
      style={{ backgroundColor: appType.color, color: readableTextColor(appType.color) }}
      title={appType.name}
    >
      {appType.code}
      {!appType.active && <span className="ml-1 opacity-60">(inactive)</span>}
    </span>
  );
}

export function CarryBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(base, "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300")}
      title={`Carried over ${count} time${count === 1 ? "" : "s"}`}
    >
      ↻ {count}
    </span>
  );
}

/** Where a task lives: a release name, or "Backlog" (amber). Closed releases are muted. */
export function ReleaseChip({ sprint }: { sprint: Pick<Sprint, "name" | "status"> | undefined }) {
  if (!sprint) return <span className="text-xs text-muted-foreground">Unknown</span>;
  if (sprint.status === "backlog") return <span className={cn(base, SPRINT_STATUS_COLORS.backlog)}>Backlog</span>;
  return (
    <span className={cn("truncate text-sm", sprint.status === "closed" && "text-muted-foreground")} title={sprint.name}>
      {sprint.name}
    </span>
  );
}
