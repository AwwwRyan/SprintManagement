"use client";

/**
 * Dashboard, bottom section: Bugs / Improvements / Tasks. Tap a category card to see its
 * stages, breakdowns (App Type, priority, person) and the individual items. Only the work in
 * flight counts: In Progress, Fixed, Testing and Ready to Release.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Bug, ListChecks, Sparkles, type LucideIcon } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { categoryBreakdown, type BreakdownTask, type CategoryBreakdown, type StageCounts } from "@/lib/category-breakdown";
import { sprintProgress } from "@/lib/metrics";
import { PROGRESS_STATUSES } from "@/lib/task-model";
import { TASK_STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AppTypeBadge, PriorityBadge, StatusBadge } from "@/components/common/badges";
import { StageBar } from "./progress-card";
import { ScrollX, useExportMode } from "./export-mode";
import { TASK_TYPES, type Sprint, type Task, type TaskType } from "@/types";

export const PLURAL: Record<TaskType, string> = { bug: "Bugs", improvement: "Improvements", task: "Tasks" };
export const ICON: Record<TaskType, LucideIcon> = { bug: Bug, improvement: Sparkles, task: ListChecks };
/** Items shown per status before "Show all". */
const LIST_PREVIEW = 8;

function CategoryCard({ type, b, selected, onSelect }: { type: TaskType; b: StageCounts; selected: boolean; onSelect: () => void }) {
  const Icon = ICON[type];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "grid gap-2 rounded-xl border p-4 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected && "border-primary bg-muted/60 ring-1 ring-primary",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        {PLURAL[type]}
        {selected && <span className="ml-auto text-[11px] font-normal text-muted-foreground">Showing</span>}
      </span>
      <span className="text-3xl font-semibold tabular-nums">{b.total}</span>
      <Progress value={b.readyPct} className="h-1.5" aria-label={`${PLURAL[type]}: ${b.readyPct}% ready to release`} />
      <span className="text-xs text-muted-foreground tabular-nums">
        {b.ready} ready to release · {b.readyPct}%
      </span>
    </button>
  );
}

const th = "pb-1.5 text-right font-medium";
const td = "py-1.5 text-right tabular-nums";

/** In Progress / Fixed / Testing / Ready columns for one breakdown. */
function StageTable({ title, first, rows }: { title: string; first: string; rows: { key: string; label: React.ReactNode; c: StageCounts }[] }) {
  return (
    <div className="min-w-0">
      <h4 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h4>
      <ScrollX>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="w-[40%] pb-1.5 text-left font-medium">{first}</th>
              <th className={th}>In Progress</th>
              <th className={th}>Fixed</th>
              <th className={th}>Testing</th>
              <th className={th}>Ready</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="py-1.5">{r.label}</td>
                <td className={td}>{r.c.inProgress}</td>
                <td className={td}>{r.c.fixed}</td>
                <td className={td}>{r.c.testing}</td>
                <td className={`${td} font-medium`}>{r.c.ready}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
    </div>
  );
}

function ItemGroup({ status, items, sprint }: { status: Task["status"]; items: BreakdownTask[]; sprint: Sprint }) {
  const { appTypeById, userById } = useData();
  const exportMode = useExportMode();
  const [all, setAll] = useState(false);
  const shown = all || exportMode ? items : items.slice(0, LIST_PREVIEW);
  return (
    <section aria-label={`${TASK_STATUS_LABELS[status]} (${items.length})`}>
      <h5 className="mb-1 flex items-center gap-2 text-xs font-medium">
        <StatusBadge status={status} />
        <span className="text-muted-foreground tabular-nums">{items.length}</span>
      </h5>
      {items.length === 0 ? (
        <p className="px-1.5 pb-2 text-xs text-muted-foreground">None.</p>
      ) : (
        <ul className="grid gap-0.5">
          {shown.map((t) => (
            <li key={t.id}>
              <Link
                href={`/releases/${sprint.id}?task=${t.taskKey}`}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted"
              >
                <span className="w-16 shrink-0 text-xs font-medium text-muted-foreground tabular-nums">{t.taskKey}</span>
                <span className="min-w-0 flex-1 basis-48">{t.title}</span>
                <span className="flex items-center gap-1">
                  <AppTypeBadge appType={appTypeById.get(t.appTypeId)} />
                  <PriorityBadge priority={t.priority} />
                  <span className="max-w-48 truncate text-xs whitespace-nowrap text-muted-foreground">
                    {t.assigneeIds.length ? t.assigneeIds.map((id) => userById.get(id)?.name ?? "Unknown").join(", ") : "Unassigned"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > LIST_PREVIEW && !exportMode && (
        <Button variant="ghost" size="sm" className="mt-0.5 h-7 text-xs" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </Button>
      )}
    </section>
  );
}

/** One category: stage bar, App Type / priority / person tables and every item. */
export function CategoryDetail({ b, sprint }: { b: CategoryBreakdown; sprint: Sprint }) {
  const exportMode = useExportMode();
  const progress = useMemo(() => sprintProgress(b.items), [b.items]);
  const name = PLURAL[b.type].toLowerCase();
  if (b.total === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No {name} in progress in this view.</p>;

  return (
    <div className="grid gap-5">
      <StageBar stages={progress.stages} total={progress.total} legendLabel={`${PLURAL[b.type]} by stage`} />

      {/* one under the other, full width */}
      <div className="grid gap-5">
        <StageTable
          title="By App Type"
          first="App Type"
          rows={b.byAppType.map((a) => ({
            key: a.appTypeId,
            c: a,
            label: (
              <span className="inline-flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.color }} aria-hidden />
                {a.name}
              </span>
            ),
          }))}
        />
        <StageTable
          title="By priority"
          first="Priority"
          rows={b.byPriority.filter((p) => p.total > 0).map((p) => ({ key: p.key, c: p, label: <PriorityBadge priority={p.key} /> }))}
        />
        <StageTable
          title="By person"
          first="Assignee"
          rows={b.byPerson.map((p) => ({
            key: p.userId ?? "none",
            c: p,
            label: <span className={p.userId ? "" : "text-muted-foreground"}>{p.name}</span>,
          }))}
        />
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">
          All {b.total} {name}
          {!exportMode && ", click one to open it"}
        </h4>
        <div className="grid gap-3">
          {PROGRESS_STATUSES.map((s) => (
            <ItemGroup key={s} status={s} items={b.items.filter((t) => t.status === s)} sprint={sprint} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function CategoryBreakdownCard({ tasks, sprint, only }: { tasks: Task[]; sprint: Sprint; only: TaskType | null }) {
  const { users, appTypes } = useData();
  const breakdowns = useMemo(
    () => Object.fromEntries(TASK_TYPES.map((ty) => [ty, categoryBreakdown(tasks, ty, users, appTypes)])) as Record<TaskType, CategoryBreakdown>,
    [tasks, users, appTypes],
  );
  const [tab, setTab] = useState<TaskType>("bug");
  const active = only ?? tab;
  const types = only ? [only] : [...TASK_TYPES];

  return (
    <Card className="print-break-avoid gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium">{only ? `${PLURAL[only]} in detail` : "Bugs, improvements and tasks in detail"}</CardTitle>
        {!only && <CardDescription className="text-xs">Tap a card to see its breakdown and every item.</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-5 px-4">
        <div className={cn("grid gap-3", types.length > 1 && "sm:grid-cols-3")} role="group" aria-label="Category">
          {types.map((ty) => (
            <CategoryCard key={ty} type={ty} b={breakdowns[ty]} selected={ty === active} onSelect={() => setTab(ty)} />
          ))}
        </div>
        <CategoryDetail key={active} b={breakdowns[active]} sprint={sprint} />
      </CardContent>
    </Card>
  );
}
