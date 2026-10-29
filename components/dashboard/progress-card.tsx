"use client";

import { useTheme } from "next-themes";
import { Card, CardContent } from "@/components/ui/card";
import { STAGE_CHART_COLORS } from "@/lib/constants";
import type { ProgressStage, SprintProgress } from "@/lib/metrics";

const STAGE_LABEL: Record<ProgressStage, string> = {
  done: "Ready to Release",
  testing: "Testing",
  fixed: "Fixed (to test)",
  inProgress: "In Progress",
};

/** Segmented bar + legend of tasks per workflow stage (also used per category). */
export function StageBar({ stages, total, legendLabel = "Progress legend" }: { stages: SprintProgress["stages"]; total: number; legendLabel?: string }) {
  const { resolvedTheme } = useTheme();
  const colors = STAGE_CHART_COLORS[resolvedTheme === "dark" ? "dark" : "light"];
  return (
    <div>
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={stages.map((s) => `${STAGE_LABEL[s.key]} ${s.count}`).join(", ")}
      >
        {stages
          .filter((s) => s.count > 0)
          .map((s) => (
            <div
              key={s.key}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(s.count / Math.max(1, total)) * 100}%`, background: colors[s.key] }}
              title={`${STAGE_LABEL[s.key]}: ${s.count} (${s.pct}%)`}
            />
          ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs" aria-label={legendLabel}>
        {stages.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: colors[s.key] }} aria-hidden />
            <span>{STAGE_LABEL[s.key]}</span>
            <span className="font-semibold tabular-nums">{s.count}</span>
            <span className="text-muted-foreground tabular-nums">({s.pct}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Release progress: how much of the work in flight is Ready to Release, by stage. */
export function ProgressCard({ progress: p }: { progress: SprintProgress }) {
  const ready = p.stages.find((s) => s.key === "done")?.count ?? 0;
  return (
    <Card className="print-break-avoid gap-4 py-4">
      <CardContent className="grid gap-4 px-4">
        <div>
          <div className="text-xs text-muted-foreground">Release progress</div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            <span className="text-3xl font-semibold tabular-nums">{p.completionPct}%</span>
            <span className="text-sm text-muted-foreground">
              {ready} of {p.total} ready to release
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">Counts In Progress, Fixed, Testing and Ready to Release tasks.</div>
        </div>
        <StageBar stages={p.stages} total={p.total} />
      </CardContent>
    </Card>
  );
}
