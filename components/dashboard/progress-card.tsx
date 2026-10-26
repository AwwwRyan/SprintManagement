"use client";

import { format, parseISO } from "date-fns";
import { AlertTriangle, CalendarClock, CircleAlert, Gauge, OctagonPause, TrendingDown, TrendingUp, UserX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ProgressStage, SprintProgress } from "@/lib/metrics";
import type { Sprint } from "@/types";

const STAGE_META: Record<ProgressStage, { label: string; bar: string; dot: string }> = {
  released: { label: "Released", bar: "bg-emerald-600", dot: "bg-emerald-600" },
  done: { label: "Ready to release", bar: "bg-emerald-400", dot: "bg-emerald-400" },
  qa: { label: "Dev done / testing", bar: "bg-purple-500", dot: "bg-purple-500" },
  inProgress: { label: "In progress", bar: "bg-blue-500", dot: "bg-blue-500" },
  pending: { label: "Pending", bar: "bg-slate-300 dark:bg-slate-600", dot: "bg-slate-400" },
  onHold: { label: "On hold", bar: "bg-orange-500", dot: "bg-orange-500" },
  dropped: { label: "Closed / duplicate", bar: "bg-zinc-200 dark:bg-zinc-700", dot: "bg-zinc-300 dark:bg-zinc-600" },
};

function PaceBadge({ p }: { p: SprintProgress }) {
  if (p.pace === "not_started")
    return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="size-3.5" /> Not started yet</span>;
  const meta = {
    ahead: { icon: TrendingUp, label: `Ahead of schedule by ${p.paceDelta}%`, cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
    on_track: { icon: Gauge, label: "On track", cls: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
    behind: { icon: TrendingDown, label: `Behind schedule by ${Math.abs(p.paceDelta ?? 0)}%`, cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  }[p.pace];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium", meta.cls)}>
      <meta.icon className="size-3.5" /> {meta.label}
    </span>
  );
}

function Flag({ icon: Icon, label, value, tone }: { icon: typeof AlertTriangle; label: string; value: number; tone: "red" | "amber" | "muted" }) {
  const toneCls = value === 0 ? "text-muted-foreground" : tone === "red" ? "text-red-600 dark:text-red-400" : tone === "amber" ? "text-amber-700 dark:text-amber-300" : "";
  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
      <Icon className={cn("size-4 shrink-0", toneCls)} />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("ml-auto text-sm font-semibold tabular-nums", toneCls)}>{value}</span>
    </div>
  );
}

/** Detailed sprint progress: stage breakdown, time used vs work done, and warning counts. */
export function ProgressCard({ progress: p, sprint }: { progress: SprintProgress; sprint: Sprint }) {
  const done = p.stages[0].count + p.stages[1].count; // released + done
  return (
    <Card className="print-break-avoid gap-4 py-4">
      <CardContent className="grid gap-4 px-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-xs text-muted-foreground">Release progress</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{p.completionPct}%</span>
              <span className="text-sm text-muted-foreground">
                {done} of {p.total - p.stages[6].count} tasks done
              </span>
            </div>
          </div>
          <PaceBadge p={p} />
        </div>

        {/* Work: segmented by stage */}
        <div>
          <div
            className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={p.stages.map((s) => `${STAGE_META[s.key].label} ${s.count}`).join(", ")}
          >
            {p.stages
              .filter((s) => s.count > 0)
              .map((s) => (
                <div
                  key={s.key}
                  className={cn("h-full first:rounded-l-full last:rounded-r-full", STAGE_META[s.key].bar)}
                  style={{ width: `${(s.count / Math.max(1, p.total)) * 100}%` }}
                  title={`${STAGE_META[s.key].label}: ${s.count} (${s.pct}%)`}
                />
              ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs" aria-label="Progress legend">
            {p.stages.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-sm", STAGE_META[s.key].dot)} aria-hidden />
                <span>{STAGE_META[s.key].label}</span>
                <span className="font-semibold tabular-nums">{s.count}</span>
                <span className="text-muted-foreground tabular-nums">({s.pct}%)</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Time: how much of the sprint has elapsed */}
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>
              Release time: day {p.dayOfSprint} of {p.sprintDays}
            </span>
            <span>
              {format(parseISO(sprint.startDate), "MMM d")} to {format(parseISO(sprint.endDate), "MMM d")} · {p.timePct}% used
            </span>
          </div>
          <div className="relative h-1.5 w-full rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground/40" style={{ width: `${p.timePct}%` }} />
            <div
              className="absolute -top-1 h-3.5 w-0.5 rounded bg-emerald-600"
              style={{ left: `calc(${p.completionPct}% - 1px)` }}
              title={`Work done: ${p.completionPct}%`}
              aria-hidden
            />
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">Green marker = work done, so a marker behind the grey bar means behind schedule.</div>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Flag icon={CircleAlert} label="Critical open" value={p.criticalOpen} tone="red" />
          <Flag icon={OctagonPause} label="On hold" value={p.onHold} tone="amber" />
          <Flag icon={AlertTriangle} label="Overdue" value={p.overdue} tone="amber" />
          <Flag icon={UserX} label="Unassigned (open)" value={p.unassignedOpen} tone="amber" />
        </div>
      </CardContent>
    </Card>
  );
}
