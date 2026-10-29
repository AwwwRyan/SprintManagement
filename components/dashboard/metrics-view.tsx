"use client";

/** Charts + tables shared by the live dashboard and the closed-sprint report. */
import { useTheme } from "next-themes";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  BAR_CHART_COLOR,
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TYPE_CHART_COLORS,
  TASK_TYPE_LABELS,
} from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { ScrollX, useExportMode } from "./export-mode";
import type { SprintMetrics, TaskStatus, TaskType } from "@/types";

const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: { label: string } }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium">{label ?? payload[0].payload.label}</div>
      <div className="text-muted-foreground tabular-nums">
        {payload[0].value} task{payload[0].value === 1 ? "" : "s"}
      </div>
    </div>
  );
}

export function StatTile({ label, value, sub, children }: { label: string; value: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card className="print-break-avoid gap-1 py-4">
      <CardContent className="px-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
        {children}
      </CardContent>
    </Card>
  );
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`print-break-avoid gap-3 py-4 ${className ?? ""}`}>
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}

function useChartMode() {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? "dark" : "light";
}

/** Bar chart of tasks per status; `statuses` limits the bars (default: every status). */
export function StatusChart({ metrics, statuses }: { metrics: SprintMetrics; statuses?: readonly TaskStatus[] }) {
  const barColor = BAR_CHART_COLOR[useChartMode()];
  const statusData = metrics.byStatus
    .filter((s) => !statuses || statuses.includes(s.key as TaskStatus))
    .map((s) => ({
      label: TASK_STATUS_LABELS[s.key as keyof typeof TASK_STATUS_LABELS],
      count: s.count,
    }));
  return (
    <Section title="Tasks by status">
      <div className="h-56" role="img" aria-label="Bar chart of task count by status">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={statusData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap="25%">
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={64} />
            <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
            <Bar dataKey="count" fill={barColor} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Section>
  );
}

export function WorkMix({ metrics, className }: { metrics: SprintMetrics; className?: string }) {
  const mode = useChartMode();
  const typeColors = TYPE_CHART_COLORS[mode];
  const typeData = metrics.byType
    .filter((t) => t.count > 0)
    .map((t) => ({ key: t.key as TaskType, label: TASK_TYPE_LABELS[t.key as TaskType], count: t.count }));
  return (
    <Section title="Work mix by type" className={className}>
      {typeData.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <div className="size-44 shrink-0" role="img" aria-label="Donut chart of tasks by type">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeData}
                  dataKey="count"
                  nameKey="label"
                  innerRadius="62%"
                  outerRadius="100%"
                  isAnimationActive={false}
                >
                  {typeData.map((d) => (
                    <Cell key={d.key} fill={typeColors[d.key]} stroke={mode === "dark" ? "#1a1a19" : "#ffffff"} strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="grid gap-1.5 text-sm" aria-label="Legend">
            {typeData.map((d) => (
              <li key={d.key} className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm" style={{ background: typeColors[d.key] }} aria-hidden />
                <span className="w-28">{d.label}</span>
                <span className="font-medium tabular-nums">{d.count}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  ({metrics.total ? Math.round((d.count / metrics.total) * 100) : 0}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

/** Tasks per App Type and stage. `doneLabel` names the "done" column; the report also shows completion. */
export function AppTypeTable({ metrics, doneLabel = "Completed", completion = true }: { metrics: SprintMetrics; doneLabel?: string; completion?: boolean }) {
  const exportMode = useExportMode();
  const num = "py-2 pl-3 text-right tabular-nums";
  const head = "pb-2 pl-3 text-right font-medium";
  return (
    <Section title="By App Type">
      {metrics.byAppType.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <ScrollX>
          <table className={cn("w-full text-sm", !exportMode && "min-w-[30rem]")}>
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 text-left font-medium">App Type</th>
                <th className={head}>Tasks</th>
                <th className={head}>In Progress</th>
                <th className={head}>Fixed</th>
                <th className={head}>Testing</th>
                <th className={head}>{doneLabel}</th>
                {completion && <th className="w-32 pb-2 pl-4 text-left font-medium">Completion</th>}
              </tr>
            </thead>
            <tbody>
              {metrics.byAppType.map((a) => (
                <tr key={a.appTypeId} className="border-t">
                  <td className="py-2">
                    <span className="inline-flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: a.color }} aria-hidden />
                      {a.name}
                    </span>
                  </td>
                  <td className={num}>{a.total}</td>
                  <td className={num}>{a.inProgress ?? "–"}</td>
                  <td className={num}>{a.fixed ?? "–"}</td>
                  <td className={num}>{a.testing ?? "–"}</td>
                  <td className={`${num} font-medium`}>{a.done}</td>
                  {completion && (
                    <td className="py-2 pl-4">
                      <div className="flex items-center gap-2">
                        <Progress value={a.completionPct} className="h-1.5" aria-label={`${a.name} ${a.completionPct}% complete`} />
                        <span className="w-9 text-right text-xs tabular-nums">{a.completionPct}%</span>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
      )}
    </Section>
  );
}

export function OpenBugs({ metrics }: { metrics: SprintMetrics }) {
  const barColor = BAR_CHART_COLOR[useChartMode()];
  const severityData = metrics.openBugsByPriority.map((s) => ({
    label: PRIORITY_LABELS[s.key as keyof typeof PRIORITY_LABELS],
    count: s.count,
  }));
  const openBugs = severityData.reduce((a, s) => a + s.count, 0);
  return (
    <Section title={`Open bugs by priority (${openBugs})`}>
      {openBugs === 0 ? (
        <p className="text-sm text-muted-foreground">No open bugs.</p>
      ) : (
        <div className="h-44" role="img" aria-label="Bar chart of open bugs by severity">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={severityData} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap="25%">
              <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
              <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="label" tick={axisTick} tickLine={false} axisLine={false} width={64} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
              <Bar dataKey="count" fill={barColor} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Section>
  );
}

export function Workload({ metrics, doneLabel = "Completed", className }: { metrics: SprintMetrics; doneLabel?: string; className?: string }) {
  const exportMode = useExportMode();
  return (
    <Section title="Workload by person" className={className}>
      {metrics.byPerson.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <ScrollX>
          <table className={cn("w-full text-sm", !exportMode && "min-w-[32rem]")}>
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 text-left font-medium">Assignee</th>
                <th className="pb-2 text-right font-medium">Assigned</th>
                <th className="pb-2 text-right font-medium">{doneLabel}</th>
                <th className="pb-2 text-right font-medium">Estimated (h)</th>
                <th className="pb-2 text-right font-medium">Actual (h)</th>
              </tr>
            </thead>
            <tbody>
              {metrics.byPerson.map((p) => (
                <tr key={p.userId ?? "none"} className="border-t">
                  <td className={`py-2 ${p.userId ? "" : "text-muted-foreground"}`}>{p.name}</td>
                  <td className="py-2 text-right tabular-nums">{p.tasks}</td>
                  <td className="py-2 text-right tabular-nums">{p.done}</td>
                  <td className="py-2 text-right tabular-nums">{p.estimatedHours}</td>
                  <td className="py-2 text-right tabular-nums">{p.actualHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
      )}
    </Section>
  );
}

/** Every chart (closed-release report). */
export function MetricsView({ metrics }: { metrics: SprintMetrics }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <StatusChart metrics={metrics} />
      <WorkMix metrics={metrics} />
      <AppTypeTable metrics={metrics} />
      <OpenBugs metrics={metrics} />
      <Workload metrics={metrics} className="lg:col-span-2" />
    </div>
  );
}
