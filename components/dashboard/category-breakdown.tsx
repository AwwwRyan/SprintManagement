"use client";

/** Dashboard: detailed breakdown per category (Bugs / Improvements / Tasks), plus an on-demand weekly trend. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { subWeeks, startOfWeek } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LineChart as TrendIcon } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { categoryBreakdown, weeklyTrend, type BreakdownTask, type CategoryBreakdown } from "@/lib/category-breakdown";
import { sprintProgress } from "@/lib/metrics";
import { fetchStatusChangesSince } from "@/lib/services/reports";
import { notifyError } from "@/lib/notify";
import { PRIORITY_LABELS, TREND_CHART_COLORS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppTypeBadge, PriorityBadge, StatusBadge } from "@/components/common/badges";
import { StageBar } from "./progress-card";
import { TASK_TYPES, type Sprint, type Task, type TaskType } from "@/types";
import type { StatusChange } from "@/lib/range-report";

const TREND_WEEKS = 8;
const PLURAL: Record<TaskType, string> = { bug: "Bugs", improvement: "Improvements", task: "Tasks" };
const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };

function Mini({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "red" | "amber" }) {
  const toneCls = tone === "red" ? "text-red-600 dark:text-red-400" : tone === "amber" ? "text-amber-700 dark:text-amber-300" : "";
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${value === 0 ? "" : toneCls}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h4 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

const th = "pb-1.5 text-right font-medium";
const td = "py-1.5 text-right tabular-nums";

function Panel({ b, tasks, sprint }: { b: CategoryBreakdown; tasks: BreakdownTask[]; sprint: Sprint }) {
  const { appTypeById } = useData();
  const progress = useMemo(
    () => sprintProgress((tasks as (BreakdownTask & Pick<Task, "dueDate">)[]).filter((t) => t.type === b.type), sprint),
    [tasks, b.type, sprint],
  );
  const name = PLURAL[b.type].toLowerCase();

  if (b.total === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No {name} in this view.</p>;

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Mini label="Remaining" value={b.open} sub={`of ${b.total}, not ready yet`} />
        <Mini label="Fixed" value={b.fixed} sub="waiting for QA" />
        <Mini label="Testing" value={b.testing} sub="in progress" />
        <Mini label="Ready to Release" value={b.ready} />
        <Mini label="Released" value={b.released} sub={`${b.completionPct}% complete`} />
        <Mini label="Critical / High remaining" value={`${b.criticalOpen} / ${b.highOpen}`} tone={b.criticalOpen ? "red" : undefined} />
        <Mini
          label="Avg. age remaining"
          value={b.avgOpenAgeDays === null ? "–" : `${b.avgOpenAgeDays}d`}
          sub={b.unassignedOpen ? `${b.unassignedOpen} unassigned` : "all assigned"}
          tone={b.unassignedOpen ? "amber" : undefined}
        />
      </div>

      <StageBar stages={progress.stages} total={progress.total} legendLabel={`${PLURAL[b.type]} by stage`} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Block title="By App Type">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="pb-1.5 text-left font-medium">App Type</th>
                  <th className={th}>Remaining</th>
                  <th className={th}>Fixed</th>
                  <th className={th}>Testing</th>
                  <th className={th}>Ready</th>
                  <th className={th}>Released</th>
                  <th className="w-28 pb-1.5 pl-3 text-left font-medium">Complete</th>
                </tr>
              </thead>
              <tbody>
                {b.byAppType.map((a) => (
                  <tr key={a.appTypeId} className="border-t">
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.color }} aria-hidden />
                        {a.name}
                      </span>
                    </td>
                    <td className={`${td} font-medium`}>{a.open}</td>
                    <td className={td}>{a.fixed}</td>
                    <td className={td}>{a.testing}</td>
                    <td className={td}>{a.ready}</td>
                    <td className={td}>{a.released}</td>
                    <td className="py-1.5 pl-3">
                      <div className="flex items-center gap-2">
                        <Progress value={a.completionPct} className="h-1.5" aria-label={`${a.name} ${a.completionPct}% complete`} />
                        <span className="w-8 text-right text-xs tabular-nums">{a.completionPct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>

        <Block title="By priority">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-1.5 text-left font-medium">Priority</th>
                <th className={th}>Remaining</th>
                <th className={th}>Total</th>
                <th className="w-32 pb-1.5 pl-3 text-left font-medium">Share of remaining</th>
              </tr>
            </thead>
            <tbody>
              {b.byPriority.map((p) => (
                <tr key={p.key} className="border-t">
                  <td className="py-1.5">
                    <PriorityBadge priority={p.key} />
                  </td>
                  <td className={`${td} font-medium`}>{p.open}</td>
                  <td className={td}>{p.total}</td>
                  <td className="py-1.5 pl-3">
                    <Progress
                      value={b.open ? Math.round((p.open / b.open) * 100) : 0}
                      className="h-1.5"
                      aria-label={`${PRIORITY_LABELS[p.key]}: ${p.open} of ${b.open} remaining`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>

        <Block title="By person">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="pb-1.5 text-left font-medium">Assignee</th>
                  <th className={th}>Remaining</th>
                  <th className={th}>Fixed</th>
                  <th className={th}>Testing</th>
                  <th className={th}>Ready</th>
                  <th className={th}>Released</th>
                </tr>
              </thead>
              <tbody>
                {b.byPerson.map((p) => (
                  <tr key={p.userId ?? "none"} className="border-t">
                    <td className={`py-1.5 ${p.userId ? "" : "text-muted-foreground"}`}>{p.name}</td>
                    <td className={`${td} font-medium`}>{p.open}</td>
                    <td className={td}>{p.fixed}</td>
                    <td className={td}>{p.testing}</td>
                    <td className={td}>{p.ready}</td>
                    <td className={td}>{p.released}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Items with several assignees count for each of them.</p>
        </Block>

        <Block title={`Oldest remaining ${name}`}>
          {b.oldestOpen.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing remaining.</p>
          ) : (
            <ul className="grid gap-1.5">
              {b.oldestOpen.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/releases/${sprint.id}?task=${t.taskKey}`}
                    className="flex items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted"
                  >
                    <span className="w-10 shrink-0 pt-0.5 text-right text-xs font-medium text-muted-foreground tabular-nums">{t.ageDays}d</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2">{t.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1">
                        <AppTypeBadge appType={appTypeById.get(t.appTypeId)} />
                        <StatusBadge status={t.status} />
                        <PriorityBadge priority={t.priority} />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>
    </div>
  );
}

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="mb-0.5 font-medium">Week of {label}</div>
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

function Trend({ tasks, type, changes }: { tasks: BreakdownTask[]; type: TaskType; changes: StatusChange[] }) {
  const { resolvedTheme } = useTheme();
  const colors = TREND_CHART_COLORS[resolvedTheme === "dark" ? "dark" : "light"];
  const data = useMemo(() => weeklyTrend(tasks, type, changes, TREND_WEEKS), [tasks, type, changes]);
  const totals = data.reduce((a, w) => ({ reported: a.reported + w.reported, fixed: a.fixed + w.fixed }), { reported: 0, fixed: 0 });
  return (
    <div>
      <div className="h-52" role="img" aria-label={`${PLURAL[type]} reported vs completed per week: ${data.map((w) => `${w.label} ${w.reported}/${w.fixed}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap="25%" barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
            <Bar dataKey="reported" name="Reported" fill={colors.reported} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Bar dataKey="fixed" name="Completed" fill={colors.fixed} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-1 flex gap-4 text-xs" aria-label="Trend legend">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: colors.reported }} aria-hidden /> Reported
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: colors.fixed }} aria-hidden /> Completed (reached Ready to Release / Released)
        </li>
      </ul>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Last {TREND_WEEKS} weeks, this release: {totals.reported} reported, {totals.fixed} completed. Excel imports aren&rsquo;t counted as
        reported.
      </p>
    </div>
  );
}

export function CategoryBreakdownCard({ tasks: live, sprint, only }: { tasks: Task[]; sprint: Sprint; only: TaskType | null }) {
  const { users, appTypes } = useData();
  const tasks = useMemo<(BreakdownTask & Pick<Task, "dueDate">)[]>(
    () => live.map((t) => ({ ...t, createdAtMs: t.createdAt ? t.createdAt.toMillis() : null })),
    [live],
  );
  const types = only ? [only] : [...TASK_TYPES];
  const breakdowns = useMemo(
    () => Object.fromEntries(TASK_TYPES.map((ty) => [ty, categoryBreakdown(tasks, ty, users, appTypes)])) as Record<TaskType, CategoryBreakdown>,
    [tasks, users, appTypes],
  );
  const [tab, setTab] = useState<TaskType>("bug");
  const active = only ?? tab;

  // Trend: loaded on demand (one read per status change in the period, Spark quota).
  const [changes, setChanges] = useState<StatusChange[] | null>(null);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const loadTrend = async () => {
    setLoadingTrend(true);
    try {
      const from = startOfWeek(subWeeks(new Date(), TREND_WEEKS - 1), { weekStartsOn: 1 }).getTime();
      setChanges(await fetchStatusChangesSince(from));
    } catch (err) {
      notifyError(err, "Couldn't load the trend");
    } finally {
      setLoadingTrend(false);
    }
  };

  const panel = (ty: TaskType) => (
    <div className="grid gap-5">
      <Panel b={breakdowns[ty]} tasks={tasks} sprint={sprint} />
      <Block title={`${PLURAL[ty]} reported vs completed per week`}>
        {changes ? (
          <Trend tasks={tasks} type={ty} changes={changes} />
        ) : (
          <Button variant="outline" size="sm" onClick={loadTrend} disabled={loadingTrend}>
            <TrendIcon /> {loadingTrend ? "Loading…" : `Show weekly trend (last ${TREND_WEEKS} weeks)`}
          </Button>
        )}
      </Block>
    </div>
  );

  return (
    <Card className="print-break-avoid gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium">
          {only ? `${PLURAL[only]} in detail` : "Bugs, improvements and tasks in detail"}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        {types.length === 1 ? (
          panel(active)
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as TaskType)}>
            <TabsList>
              {TASK_TYPES.map((ty) => (
                <TabsTrigger key={ty} value={ty}>
                  {PLURAL[ty]}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {breakdowns[ty].open}/{breakdowns[ty].total}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            {TASK_TYPES.map((ty) => (
              <TabsContent key={ty} value={ty} className="pt-3">
                {panel(ty)}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
