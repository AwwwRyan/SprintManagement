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

const ALL = "__all__";

export default function DashboardPage() {
  const { actor } = useCurrentUser();
  const { activeSprint, appTypes, users, loading } = useData();
  const live = useSprintTasks(activeSprint?.id ?? null, actor.uid);
  const [appTypeId, setAppTypeId] = useState(ALL);
  const [exportOpen, setExportOpen] = useState(false);
  const isAdmin = canManageUsers(actor);

  const tasks = useMemo(
    () => (appTypeId === ALL ? live.tasks : live.tasks.filter((t) => t.appTypeId === appTypeId)),
    [live.tasks, appTypeId],
  );
  const metrics = useMemo(() => computeSprintMetrics(tasks, users, appTypes), [tasks, users, appTypes]);
  const progress = useMemo(() => (activeSprint ? sprintProgress(tasks, activeSprint) : null), [tasks, activeSprint]);

  const exportButton = isAdmin && (
    <Button variant="outline" onClick={() => setExportOpen(true)}>
      <FileSpreadsheet /> Export report
    </Button>
  );
  const exportDialog = isAdmin && (
    <ExportReportDialog open={exportOpen} onOpenChange={setExportOpen} defaultAppTypeId={appTypeId === ALL ? null : appTypeId} />
  );

  if (loading) return <Skeleton className="h-96" />;
  if (!activeSprint)
    return (
      <>
        <PageHeader title="Dashboard" actions={exportButton} />
        <EmptyState
          icon={LayoutDashboard}
          title="No active release right now"
          description="When a release is started, its live progress shows up here."
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
            <Link href={`/releases/${activeSprint.id}`} className="font-medium text-foreground hover:underline">
              {activeSprint.name}
            </Link>{" "}
            · {fmt(activeSprint.startDate)} to {fmt(activeSprint.endDate)} · updates live
          </>
        }
        actions={
          <>
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
            <ProgressCard progress={progress} sprint={activeSprint} />
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-1">
              <StatTile label="Open tasks" value={metrics.total - metrics.done} sub={`of ${metrics.total} in this release`} />
              <StatTile
                label="Hours (estimated / actual)"
                value={`${metrics.estimatedHours} / ${metrics.actualHours}`}
                sub="Sum across tasks"
              />
            </div>
          </div>
          <MetricsView metrics={metrics} />
        </div>
      )}
      {exportDialog}
    </>
  );
}
