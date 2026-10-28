"use client";

/** Option lists for task fields, shared by the table cells, side panel and task form. */
import {
  PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  type AppType,
  type AppUser,
  type Module,
} from "@/types";
import { ENVIRONMENTS, PRIORITY_LABELS, TASK_STATUS_LABELS, TASK_TYPE_LABELS } from "@/lib/constants";
import { AppTypeBadge, PriorityBadge, StatusBadge, TypeBadge } from "@/components/common/badges";
import { UserChip } from "@/components/common/user-avatar";
import { isAssignable } from "@/lib/permissions";

export interface Option {
  value: string;
  label: string;
  node?: React.ReactNode;
}

/** Radix Select can't use "" as a value, so null is represented by this sentinel. */
export const NONE = "__none__";

export const statusOptions: Option[] = TASK_STATUSES.map((s) => ({
  value: s,
  label: TASK_STATUS_LABELS[s],
  node: <StatusBadge status={s} />,
}));

export const typeOptions: Option[] = TASK_TYPES.map((t) => ({
  value: t,
  label: TASK_TYPE_LABELS[t],
  node: <TypeBadge type={t} />,
}));

export const priorityOptions: Option[] = PRIORITIES.map((p) => ({
  value: p,
  label: PRIORITY_LABELS[p],
  node: <PriorityBadge priority={p} />,
}));

/** Staging / Production, plus the task's current value if it's something else (older data). */
export function environmentOptions(current?: string | null): Option[] {
  const base: string[] = [...ENVIRONMENTS];
  if (current && !base.includes(current)) base.push(current);
  return base.map((e) => ({ value: e, label: e }));
}

/** Active App Types, plus the current one even if it has been deactivated. */
export function appTypeOptions(appTypes: AppType[], currentId?: string | null): Option[] {
  return appTypes
    .filter((a) => a.active || a.id === currentId)
    .map((a) => ({
      value: a.id,
      label: a.name,
      node: (
        <span className="flex items-center gap-2.5 whitespace-nowrap">
          <AppTypeBadge appType={a} />
          <span>{a.name}</span>
        </span>
      ),
    }));
}

/** Active modules of the given App Type only (plus the current one). */
export function moduleOptions(modules: Module[], appTypeId: string | null | undefined, currentId?: string | null): Option[] {
  return modules
    .filter((m) => m.appTypeId === appTypeId && (m.active || m.id === currentId))
    .map((m) => ({ value: m.id, label: m.active ? m.name : `${m.name} (inactive)` }));
}

/** Active users, plus the current assignee even if deactivated. */
/** People offered as assignees (and in the Assignee filter). */
export function userOptions(users: AppUser[], currentId?: string | null): Option[] {
  return users
    .filter((u) => isAssignable(u) || u.id === currentId)
    .map((u) => ({ value: u.id, label: u.name, node: <UserChip user={u} /> }));
}
