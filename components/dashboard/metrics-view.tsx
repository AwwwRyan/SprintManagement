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
import type { SprintMetrics, TaskType } from "@/types";

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

export function MetricsView({ metrics }: { metrics: SprintMetrics }) {
  const { resolvedTheme } = useTheme();
  const mode = resolvedTheme === "dark" ? "dark" : "light";
  const barColor = BAR_CHART_COLOR[mode];
  const typeColors = TYPE_CHART_COLORS[mode];
  const statusData = metrics.byStatus.map((s) => ({
    label: TASK_STATUS_LABELS[s.key as keyof typeof TASK_STATUS_LABELS],
    count: s.count,
  }));
  const typeData = metrics.byType
    .filter((t) => t.count > 0)
    .map((t) => ({ key: t.key as TaskType, label: TASK_TYPE_LABELS[t.key as TaskType], count: t.count }));
  const severityData = metrics.openBugsByPriority.map((s) => ({
    label: PRIORITY_LABELS[s.key as keyof typeof PRIORITY_LABELS],
    count: s.count,
  }));
  const openBugs = severityData.reduce((a, s) => a + s.count, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Tasks by status">
        <div className="h-56" role="img" aria-label="Bar chart of task count by status">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap="25%">
              <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={48} />
              <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
              <Bar dataKey="count" fill={barColor} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Work mix by type">
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

      <Section title="By App Type">
        {metrics.byAppType.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-2 text-left font-medium">App Type</th>
                <th className="pb-2 text-right font-medium">Tasks</th>
                <th className="pb-2 text-right font-medium">Completed</th>
                <th className="w-40 pb-2 pl-4 text-left font-medium">Completion</th>
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
                  <td className="py-2 text-right tabular-nums">{a.total}</td>
                  <td className="py-2 text-right tabular-nums">{a.done}</td>
                  <td className="py-2 pl-4">
                    <div className="flex items-center gap-2">
                      <Progress value={a.completionPct} className="h-1.5" aria-label={`${a.name} ${a.completionPct}% complete`} />
                      <span className="w-9 text-right text-xs tabular-nums">{a.completionPct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

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

      <Section title="Workload by person" className="lg:col-span-2">
        {metrics.byPerson.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 text-left font-medium">Assignee</th>
                  <th className="pb-2 text-right font-medium">Assigned</th>
                  <th className="pb-2 text-right font-medium">Completed</th>
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
          </div>
        )}
      </Section>
    </div>
  );
}
