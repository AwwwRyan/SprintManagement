"use client";

/**
 * Closed-release report body (on screen, and off-screen for the PDF): what was released, by
 * category, App Type, person and priority, where everything planned ended up, and every released
 * task grouped by category.
 */
import { useMemo } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useData } from "@/components/providers/data-provider";
import { AppTypeBadge, PriorityBadge, StatusBadge } from "@/components/common/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/dashboard/metrics-view";
import { ScrollX, useExportMode } from "@/components/dashboard/export-mode";
import { BAR_CHART_COLOR, PLANNED_CHART_COLORS, PRIORITY_LABELS, TASK_TYPE_LABELS, TYPE_CHART_COLORS } from "@/lib/constants";
import { releaseSummary, type CategoryRow, type ReportTask } from "@/lib/release-report";
import { cn } from "@/lib/utils";
import { TASK_TYPES, type ReportTaskRef, type Sprint, type SprintReport, type TaskType } from "@/types";

const PLURAL: Record<TaskType, string> = { bug: "Bugs", improvement: "Improvements", task: "Tasks" };
const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };

function useMode() {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? "dark" : "light";
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("print-break-avoid gap-3 py-4", className)}>
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}

function CountTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      {label && <div className="mb-0.5 font-medium">{label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function CategoryLegend() {
  const colors = TYPE_CHART_COLORS[useMode()];
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
      {TASK_TYPES.map((ty) => (
        <li key={ty} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: colors[ty] }} aria-hidden />
          {PLURAL[ty]}
        </li>
      ))}
    </ul>
  );
}

/** Bars per row (App Type or person), stacked by category. */
function StackedByCategory({ rows, vertical, label }: { rows: CategoryRow[]; vertical?: boolean; label: string }) {
  const mode = useMode();
  const colors = TYPE_CHART_COLORS[mode];
  const surface = mode === "dark" ? "#1a1a19" : "#ffffff";
  const data = rows.map((r) => ({ name: r.name, bug: r.bug, improvement: r.improvement, task: r.task }));
  const height = vertical ? Math.max(120, rows.length * 34 + 40) : 224;
  return (
    <div style={{ height }} role="img" aria-label={`${label}: ${rows.map((r) => `${r.name} ${r.total}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={vertical ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 16, left: vertical ? 8 : -20, bottom: 0 }}
          barCategoryGap="25%"
        >
          <CartesianGrid vertical={!vertical ? false : true} horizontal={vertical ? false : true} stroke="var(--viz-grid)" />
          {vertical ? (
            <>
              <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={axisTick} tickLine={false} axisLine={false} width={120} />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} interval={0} />
              <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
            </>
          )}
          <Tooltip content={<CountTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
          {TASK_TYPES.map((ty) => (
            <Bar key={ty} dataKey={ty} name={PLURAL[ty]} stackId="c" fill={colors[ty]} stroke={surface} strokeWidth={1} maxBarSize={vertical ? 20 : 40} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ReleasedTable({ tasks, sprintId }: { tasks: ReportTask[]; sprintId: string }) {
  const { appTypeById, userById } = useData();
  const exportMode = useExportMode();
  return (
    <ScrollX>
      <table className={cn("w-full text-sm", !exportMode && "min-w-[40rem]")}>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="w-20 pb-2 text-left font-medium">Task ID</th>
            <th className="pb-2 text-left font-medium">Title</th>
            <th className="pb-2 pl-3 text-left font-medium">App Type</th>
            <th className="pb-2 pl-3 text-left font-medium">Priority</th>
            <th className="pb-2 pl-3 text-left font-medium">Environment</th>
            <th className="pb-2 pl-3 text-left font-medium">Assignees</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-t align-top">
              <td className="py-1.5 font-mono text-xs">
                <Link href={`/releases/${sprintId}?task=${t.taskKey}`} className="hover:underline">
                  {t.taskKey}
                </Link>
              </td>
              <td className="py-1.5">{t.title}</td>
              <td className="py-1.5 pl-3">
                <AppTypeBadge appType={appTypeById.get(t.appTypeId)} />
              </td>
              <td className="py-1.5 pl-3">
                <PriorityBadge priority={t.priority} />
              </td>
              <td className="py-1.5 pl-3 text-muted-foreground">{t.environment || "-"}</td>
              <td className="py-1.5 pl-3">
                {t.assigneeIds.length ? t.assigneeIds.map((id) => userById.get(id)?.name ?? "Unknown").join(", ") : <span className="text-muted-foreground">Unassigned</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollX>
  );
}

/** Carried-over / Backlog lists from the snapshot taken at close. */
export function TaskRefTable({ rows, showTarget }: { rows: ReportTaskRef[]; showTarget?: boolean }) {
  const { appTypeById, userById } = useData();
  const exportMode = useExportMode();
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">None.</p>;
  return (
    <ScrollX>
      <table className={cn("w-full text-sm", !exportMode && "min-w-[36rem]")}>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="pb-2 text-left font-medium">Task ID</th>
            <th className="pb-2 text-left font-medium">Title</th>
            <th className="pb-2 text-left font-medium">App</th>
            <th className="pb-2 text-left font-medium">Assignee</th>
            <th className="pb-2 text-left font-medium">Status at close</th>
            {showTarget && <th className="pb-2 text-left font-medium">Moved to</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.taskId} className="border-t">
              <td className="py-1.5 font-mono text-xs">{r.taskKey}</td>
              <td className={cn("py-1.5", !exportMode && "max-w-80 truncate")}>{r.title}</td>
              <td className="py-1.5">
                <AppTypeBadge appType={appTypeById.get(r.appTypeId)} />
              </td>
              <td className="py-1.5">{r.assigneeIds.length ? r.assigneeIds.map((id) => userById.get(id)?.name ?? "Unknown").join(", ") : "Unassigned"}</td>
              <td className="py-1.5">
                <StatusBadge status={r.status} />
              </td>
              {showTarget && <td className="py-1.5">{r.targetSprintName}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollX>
  );
}

export function ReleaseReportView({
  report,
  sprint,
  tasks,
  fixedColumns = false,
}: {
  report: SprintReport;
  sprint: Sprint | undefined;
  tasks: ReportTask[];
  /** keep the multi-column layout regardless of screen width (PDF) */
  fixedColumns?: boolean;
}) {
  const { users, appTypes } = useData();
  const mode = useMode();
  const s = useMemo(() => releaseSummary(tasks, report, users, appTypes), [tasks, report, users, appTypes]);
  const planned = s.planned.reduce((a, p) => a + p.count, 0);
  const plannedColors = PLANNED_CHART_COLORS[mode];
  const typeColors = TYPE_CHART_COLORS[mode];
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
  const two = fixedColumns ? "grid-cols-2" : "lg:grid-cols-2";
  const target = report.carriedOver[0]?.targetSprintName;
  const mix = TASK_TYPES.filter((ty) => s.released[ty] > 0).map((ty) => ({ key: ty, label: PLURAL[ty], count: s.released[ty] }));

  return (
    <div className="grid gap-4">
      <div className={cn("grid gap-4", fixedColumns ? "grid-cols-4" : "grid-cols-2 lg:grid-cols-4")}>
        <StatTile label="Released" value={s.released.total} sub={`of ${planned} planned (${pct(s.released.total, planned)}%)`} />
        <StatTile label="Bugs released" value={s.released.bug} />
        <StatTile label="Improvements released" value={s.released.improvement} />
        <StatTile label="Tasks released" value={s.released.task} />
        <StatTile label="Production bugs fixed" value={s.productionBugsFixed} sub="Released bugs found in Production" />
        <StatTile label="Carried over" value={s.carried} sub={target ? `to ${target}` : undefined} />
        <StatTile label="Moved to the Backlog" value={s.movedToBacklog} />
        <StatTile label="Cancelled / duplicate" value={s.dropped} />
      </div>

      <Section title="Planned vs delivered">
        <div
          className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={s.planned.map((p) => `${p.label} ${p.count}`).join(", ")}
        >
          {s.planned
            .filter((p) => p.count > 0)
            .map((p) => (
              <div
                key={p.key}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${pct(p.count, planned)}%`, background: plannedColors[p.key] }}
                title={`${p.label}: ${p.count}`}
              />
            ))}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs" aria-label="Planned vs delivered legend">
          {s.planned.map((p) => (
            <li key={p.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: plannedColors[p.key] }} aria-hidden />
              <span>{p.label}</span>
              <span className="font-semibold tabular-nums">{p.count}</span>
              <span className="text-muted-foreground tabular-nums">({pct(p.count, planned)}%)</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{planned} tasks were in this release when it closed.</p>
      </Section>

      <div className={cn("grid gap-4", two)}>
        <Section title="Released by category">
          {mix.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing was released.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <div className="size-44 shrink-0" role="img" aria-label={`Released by category: ${mix.map((m) => `${m.label} ${m.count}`).join(", ")}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={mix} dataKey="count" nameKey="label" innerRadius="62%" outerRadius="100%" isAnimationActive={false}>
                      {mix.map((m) => (
                        <Cell key={m.key} fill={typeColors[m.key]} stroke={mode === "dark" ? "#1a1a19" : "#ffffff"} strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip content={<CountTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="grid gap-1.5 text-sm" aria-label="Legend">
                {mix.map((m) => (
                  <li key={m.key} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-sm" style={{ background: typeColors[m.key] }} aria-hidden />
                    <span className="w-28">{m.label}</span>
                    <span className="font-medium tabular-nums">{m.count}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">({pct(m.count, s.released.total)}%)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title={`Released bugs by priority (${s.released.bug})`}>
          {s.released.bug === 0 ? (
            <p className="text-sm text-muted-foreground">No bugs were released.</p>
          ) : (
            <div className="h-44" role="img" aria-label={`Released bugs by priority: ${s.releasedBugsByPriority.map((p) => `${PRIORITY_LABELS[p.key]} ${p.count}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={s.releasedBugsByPriority.map((p) => ({ label: PRIORITY_LABELS[p.key], count: p.count }))}
                  layout="vertical"
                  margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                  barCategoryGap="25%"
                >
                  <CartesianGrid horizontal={false} stroke="var(--viz-grid)" />
                  <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" tick={axisTick} tickLine={false} axisLine={false} width={64} />
                  <Tooltip content={<CountTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
                  <Bar dataKey="count" name="Bugs" fill={BAR_CHART_COLOR[mode]} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      </div>

      <div className={cn("grid gap-4", two)}>
        <Section title="Released by App Type">
          {s.byAppType.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing was released.</p>
          ) : (
            <>
              <StackedByCategory rows={s.byAppType} label="Released by App Type" />
              <CategoryLegend />
            </>
          )}
        </Section>

        <Section title="Released by person">
          {s.byPerson.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing was released.</p>
          ) : (
            <>
              <StackedByCategory rows={s.byPerson} vertical label="Released by person" />
              <CategoryLegend />
              <table className="mt-3 w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-2 text-left font-medium">Person</th>
                    {TASK_TYPES.map((ty) => (
                      <th key={ty} className="pb-2 pl-3 text-right font-medium">
                        {PLURAL[ty]}
                      </th>
                    ))}
                    <th className="pb-2 pl-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {s.byPerson.map((p) => (
                    <tr key={p.key} className="border-t">
                      <td className={cn("py-1.5", p.key === "none" && "text-muted-foreground")}>{p.name}</td>
                      {TASK_TYPES.map((ty) => (
                        <td key={ty} className="py-1.5 pl-3 text-right tabular-nums">
                          {p[ty]}
                        </td>
                      ))}
                      <td className="py-1.5 pl-3 text-right font-medium tabular-nums">{p.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-muted-foreground">Tasks with several assignees count for each of them.</p>
            </>
          )}
        </Section>
      </div>

      {TASK_TYPES.map((ty) => (
        <Section key={ty} title={`${PLURAL[ty]} released (${s.list[ty].length})`}>
          {s.list[ty].length === 0 ? (
            <p className="text-sm text-muted-foreground">No {TASK_TYPE_LABELS[ty].toLowerCase()}s were released.</p>
          ) : (
            <ReleasedTable tasks={s.list[ty]} sprintId={sprint?.id ?? report.sprintId} />
          )}
        </Section>
      ))}

      <Section title={`Carried over (${report.carriedOver.length})`}>
        <TaskRefTable rows={report.carriedOver} showTarget />
      </Section>
      {report.movedToBacklog && (
        <Section title={`Moved to the Backlog (${report.movedToBacklog.length})`}>
          <TaskRefTable rows={report.movedToBacklog} />
        </Section>
      )}
      {/* older reports (before every unfinished task had to get a destination) */}
      {report.leftIncomplete.length > 0 && (
        <Section title={`Left incomplete (${report.leftIncomplete.length})`}>
          <TaskRefTable rows={report.leftIncomplete} />
        </Section>
      )}
    </div>
  );
}
