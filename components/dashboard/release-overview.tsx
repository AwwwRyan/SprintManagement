"use client";

import type { SprintProgress } from "@/lib/metrics";
import { PROGRESS_STATUSES } from "@/lib/task-model";
import { cn } from "@/lib/utils";
import type { SprintMetrics } from "@/types";
import { AppTypeTable, OpenBugs, StatusChart, WorkMix, Workload } from "./metrics-view";
import { ProgressCard } from "./progress-card";

/**
 * The release as a whole: progress with the work-mix pie beside it, then the charts.
 * `fixedColumns` keeps the two-column layout regardless of screen width (PDF report).
 */
export function ReleaseOverview({ metrics, progress, fixedColumns = false }: { metrics: SprintMetrics; progress: SprintProgress; fixedColumns?: boolean }) {
  return (
    <>
      <div className={cn("grid gap-4", fixedColumns ? "grid-cols-[3fr_2fr]" : "lg:grid-cols-[3fr_2fr]")}>
        <ProgressCard progress={progress} />
        <WorkMix metrics={metrics} />
      </div>
      <div className={cn("grid gap-4", fixedColumns ? "grid-cols-2" : "lg:grid-cols-2")}>
        <StatusChart metrics={metrics} statuses={PROGRESS_STATUSES} />
        <AppTypeTable metrics={metrics} doneLabel="Ready to Release" completion={false} />
        <OpenBugs metrics={metrics} />
        <Workload metrics={metrics} doneLabel="Ready to Release" />
      </div>
    </>
  );
}
