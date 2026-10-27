"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { FileSpreadsheet, LayoutDashboard } from "lucide-react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { useSprintTasks } from "@/lib/hooks/use-tasks";
import { computeSprintMetrics, sprintProgress } from "@/lib/metrics";
import { canManageUsers } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { MetricsView, StatTile } from "@/components/dashboard/metrics-view";
import { ProgressCard } from "@/components/dashboard/progress-card";
import { ExportReportDialog } from "@/components/dashboard/export-report-dialog";
import { CategoryBreakdownCard } from "@/components/dashboard/category-breakdown";
import { DateFilterControl } from "@/components/tasks/date-filter-control";
import { matchesDate, type DateFilter } from "@/lib/date-filter";
import { SPRINT_STATUS_LABELS, TASK_TYPE_LABELS } from "@/lib/constants";
import { sortSprints } from "@/lib/sprint-utils";
import { isOpen } from "@/lib/task-model";
import { TASK_TYPES, type TaskType } from "@/types";

const ALL = "__all__";

export default function DashboardPage() {
  const { actor } = useCurrentUser();
  const { activeSprint, sprints, sprintById, appTypes, users, loading } = useData();
  // Any release can be shown; the active one by default (then the most relevant: planned, then latest closed).
  const ordered = useMemo(() => sortSprints(sprints), [sprints]);
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const release = (releaseId ? sprintById.get(releaseId) : undefined) ?? activeSprint ?? ordered[0] ?? null;
  const live = useSprintTasks(release?.id ?? null, actor.uid);
  const [appTypeId, setAppTypeId] = useState(ALL);
  const [category, setCategory] = useState<TaskType | typeof ALL>(ALL);
  const [dateFilter, setDateFilter] = useState<DateFilter | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const isAdmin = canManageUsers(actor);

  // App Type and date filters apply everywhere; the category filter also narrows the summary cards.
  const appTasks = useMemo(
    () => live.tasks.filter((t) => (appTypeId === ALL || t.appTypeId === appTypeId) && matchesDate(t, dateFilter)),
    [live.tasks, appTypeId, dateFilter],
  );
  const tasks = useMemo(() => (category === ALL ? appTasks : appTasks.filter((t) => t.type === category)), [appTasks, category]);
  const metrics = useMemo(() => computeSprintMetrics(tasks, users, appTypes), [tasks, users, appTypes]);
  const progress = useMemo(() => (release ? sprintProgress(tasks, release) : null), [tasks, release]);
  const openCount = tasks.filter((t) => isOpen(t.status)).length;

  const exportButton = isAdmin && (
    <Button variant="outline" onClick={() => setExportOpen(true)}>
      <FileSpreadsheet /> Export report
    </Button>
  );
  const exportDialog = isAdmin && (
    <ExportReportDialog open={exportOpen} onOpenChange={setExportOpen} defaultAppTypeId={appTypeId === ALL ? null : appTypeId} />
  );

  if (loading) return <Skeleton className="h-96" />;
  if (!release)
    return (
      <>
        <PageHeader title="Dashboard" actions={exportButton} />
        <EmptyState
          icon={LayoutDashboard}
          title="No releases yet"
          description="Create a release under Releases; its progress shows up here."
          action={
            <Button asChild variant="outline">
              <Link href="/releases">Go to releases</Link>
            </Button>
          }
        />
        {exportDialog}
      </>
    );

  const fmt = (d: string) => format(parseISO(d), "MMM d");

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          <>
            <Link href={`/releases/${release.id}`} className="font-medium text-foreground hover:underline">
              {release.name}
            </Link>{" "}
            · {fmt(release.startDate)} to {fmt(release.endDate)} · {live.tasks.length} tasks in this release
            {release.status === "closed" && (
              <>
                {" "}
                · closed: carried-over tasks have moved on (
                <Link href={`/releases/${release.id}/report`} className="underline underline-offset-2">
                  see its report
                </Link>
                )
              </>
            )}
          </>
        }
        actions={
          <>
            <Select value={release.id} onValueChange={setReleaseId}>
              <SelectTrigger className="w-56" aria-label="Release shown on the dashboard">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {ordered.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} <span className="text-muted-foreground">({SPRINT_STATUS_LABELS[s.status].toLowerCase()})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DateFilterControl value={dateFilter} onChange={setDateFilter} defaultField="created" />
            <Select value={category} onValueChange={(v) => setCategory(v as TaskType | typeof ALL)}>
              <SelectTrigger className="w-44" aria-label="Filter dashboard by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={ALL}>All categories</SelectItem>
                {TASK_TYPES.map((ty) => (
                  <SelectItem key={ty} value={ty}>
                    {TASK_TYPE_LABELS[ty]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={appTypeId} onValueChange={setAppTypeId}>
              <SelectTrigger className="w-48" aria-label="Filter dashboard by App Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={ALL}>All App Types</SelectItem>
                {appTypes.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {exportButton}
          </>
        }
      />

      {live.loading || !progress ? (
        <div className="grid gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            <ProgressCard progress={progress} sprint={release} />
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-1">
              <StatTile label="Remaining tasks" value={openCount} sub={`of ${metrics.total} in this release (not yet Ready to Release, Released, Cancelled or Duplicate)`} />
              <StatTile
                label="Hours (estimated / actual)"
                value={`${metrics.estimatedHours} / ${metrics.actualHours}`}
                sub="Sum across tasks"
              />
            </div>
          </div>
          <CategoryBreakdownCard tasks={appTasks} sprint={release} only={category === ALL ? null : category} />
          <MetricsView metrics={metrics} />
        </div>
      )}
      {exportDialog}
    </>
  );
}
