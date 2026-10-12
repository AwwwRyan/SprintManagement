"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { LayoutDashboard } from "lucide-react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { useSprintTasks } from "@/lib/hooks/use-tasks";
import { computeSprintMetrics, daysRemaining } from "@/lib/metrics";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { MetricsView, StatTile } from "@/components/dashboard/metrics-view";

const ALL = "__all__";

export default function DashboardPage() {
  const { actor } = useCurrentUser();
  const { activeSprint, appTypes, users, loading } = useData();
  const live = useSprintTasks(activeSprint?.id ?? null, actor.uid);
  const [appTypeId, setAppTypeId] = useState(ALL);

  const tasks = useMemo(
    () => (appTypeId === ALL ? live.tasks : live.tasks.filter((t) => t.appTypeId === appTypeId)),
    [live.tasks, appTypeId],
  );
  const metrics = useMemo(() => computeSprintMetrics(tasks, users, appTypes), [tasks, users, appTypes]);

  if (loading) return <Skeleton className="h-96" />;
  if (!activeSprint)
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState
          icon={LayoutDashboard}
          title="No active sprint right now"
          description="When a sprint is started, its live progress shows up here."
          action={
            <Button asChild variant="outline">
              <Link href="/sprints">Go to sprints</Link>
            </Button>
          }
        />
      </>
    );

  const fmt = (d: string) => format(parseISO(d), "MMM d");

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          <>
            <Link href={`/sprints/${activeSprint.id}`} className="font-medium text-foreground hover:underline">
              {activeSprint.name}
            </Link>{" "}
            · {fmt(activeSprint.startDate)} to {fmt(activeSprint.endDate)} · updates live
          </>
        }
        actions={
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
        }
      />

      {live.loading ? (
        <div className="grid gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Completion" value={`${metrics.completionPct}%`} sub={`${metrics.done} of ${metrics.total} tasks done`}>
              <Progress value={metrics.completionPct} className="mt-2 h-1.5" aria-label="Sprint completion" />
            </StatTile>
            <StatTile label="Days remaining" value={daysRemaining(activeSprint.endDate)} sub={`Ends ${fmt(activeSprint.endDate)}`} />
            <StatTile label="Open tasks" value={metrics.total - metrics.done} sub="Not yet done" />
            <StatTile
              label="Hours (estimated / actual)"
              value={`${metrics.estimatedHours} / ${metrics.actualHours}`}
              sub="Sum across tasks"
            />
          </div>
          <MetricsView metrics={metrics} />
        </div>
      )}
    </>
  );
}
