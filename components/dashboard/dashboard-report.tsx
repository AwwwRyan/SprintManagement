"use client";

/**
 * The dashboard laid out for the PDF (rendered off-screen while exporting): a plain header
 * instead of the controls, the release section, then Bugs, Improvements and Tasks one after
 * another with every table in full and every item listed.
 */
import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { useData } from "@/components/providers/data-provider";
import { categoryBreakdown } from "@/lib/category-breakdown";
import type { SprintProgress } from "@/lib/metrics";
import { TASK_TYPES, type Sprint, type SprintMetrics, type Task, type TaskType } from "@/types";
import { CategoryDetail, ICON, PLURAL } from "./category-breakdown";
import { ExportModeContext } from "./export-mode";
import { ReleaseOverview } from "./release-overview";

/** Width the report is laid out at (px), so the PDF looks the same from any screen. */
export const REPORT_WIDTH = 1200;

export function DashboardReport({
  ref,
  release,
  totalTasks,
  filters,
  metrics,
  progress,
  breakdownTasks,
  only,
}: {
  ref: React.Ref<HTMLDivElement>;
  release: Sprint;
  /** every task in the release, whatever its status */
  totalTasks: number;
  /** active dashboard filters, in words (empty = none) */
  filters: string[];
  metrics: SprintMetrics;
  progress: SprintProgress;
  /** tasks for the category sections (App Type and date filters applied) */
  breakdownTasks: Task[];
  only: TaskType | null;
}) {
  const { users, appTypes } = useData();
  const breakdowns = useMemo(
    () => (only ? [only] : [...TASK_TYPES]).map((ty) => categoryBreakdown(breakdownTasks, ty, users, appTypes)),
    [breakdownTasks, only, users, appTypes],
  );
  const fmt = (d: string) => format(parseISO(d), "MMM d, yyyy");

  return (
    <ExportModeContext.Provider value={true}>
      <div ref={ref} className="grid gap-4 bg-background p-6 text-foreground" style={{ width: REPORT_WIDTH }}>
        <header className="grid gap-1 border-b pb-4">
          <h1 className="text-2xl font-semibold">{release.name}</h1>
          <p className="text-sm text-muted-foreground">
            {fmt(release.startDate)} to {fmt(release.endDate)} · {totalTasks} tasks in this release · exported{" "}
            {format(new Date(), "MMM d, yyyy, h:mm a")}
          </p>
          {filters.length > 0 && <p className="text-sm">Filtered: {filters.join(" · ")}</p>}
        </header>

        <ReleaseOverview metrics={metrics} progress={progress} fixedColumns />

        {breakdowns.map((b) => {
          const Icon = ICON[b.type];
          return (
            <section key={b.type} className="grid gap-4 rounded-xl border p-4">
              <h2 className="flex items-baseline gap-3 border-b pb-3">
                <Icon className="size-5 self-center text-muted-foreground" aria-hidden />
                <span className="text-xl font-semibold">{PLURAL[b.type]}</span>
                <span className="text-xl font-semibold tabular-nums">{b.total}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {b.ready} ready to release · {b.readyPct}%
                </span>
              </h2>
              <CategoryDetail b={b} sprint={release} />
            </section>
          );
        })}
      </div>
    </ExportModeContext.Provider>
  );
}
