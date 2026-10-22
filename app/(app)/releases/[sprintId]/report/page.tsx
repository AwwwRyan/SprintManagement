"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeft, FileBarChart, Printer } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useReport } from "@/lib/hooks/use-tasks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AppTypeBadge, StatusBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/empty-state";
import { MetricsView, StatTile } from "@/components/dashboard/metrics-view";
import type { ReportTaskRef } from "@/types";

function TaskRefTable({ rows, showTarget }: { rows: ReportTaskRef[]; showTarget?: boolean }) {
  const { appTypeById, userById } = useData();
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">None.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
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
              <td className="max-w-80 truncate py-1.5">{r.title}</td>
              <td className="py-1.5">
                <AppTypeBadge appType={appTypeById.get(r.appTypeId)} />
              </td>
              <td className="py-1.5">{r.assigneeId ? (userById.get(r.assigneeId)?.name ?? "Unknown") : "Unassigned"}</td>
              <td className="py-1.5">
                <StatusBadge status={r.status} />
              </td>
              {showTarget && <td className="py-1.5">{r.targetSprintName}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SprintReportPage() {
  const { sprintId } = useParams<{ sprintId: string }>();
  const { sprintById } = useData();
  const { data: report, loading } = useReport(sprintId);
  const sprint = sprintById.get(sprintId);

  if (loading) return <Skeleton className="h-96" />;
  if (!report)
    return (
      <EmptyState
        icon={FileBarChart}
        title="No report for this sprint"
        description="Reports are generated when a sprint is closed."
        action={
          <Button asChild variant="outline">
            <Link href={`/sprints/${sprintId}`}>Back to sprint</Link>
          </Button>
        }
      />
    );

  const fmt = (d: string) => format(parseISO(d), "MMM d, yyyy");

  return (
    <div className="print-full mx-auto grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="no-print -ml-2 mb-1">
            <Link href={`/sprints/${sprintId}`}>
              <ArrowLeft /> Back to sprint
            </Link>
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">{report.sprintName}: Sprint report</h1>
          <p className="text-sm text-muted-foreground">
            {fmt(report.startDate)} to {fmt(report.endDate)}
            {sprint?.closedAt && ` · closed ${format(sprint.closedAt.toDate(), "MMM d, yyyy")}`}
          </p>
          {report.goal && <p className="mt-1 text-sm">Goal: {report.goal}</p>}
        </div>
        <Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}>
          <Printer /> Print
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Planned vs completed" value={`${report.done} / ${report.total}`} sub={`${report.completionPct}% completed`} />
        <StatTile label="Carried over" value={report.carriedOver.length} sub={`${report.leftIncomplete.length} left incomplete`} />
        <StatTile label="Hours (estimated / actual)" value={`${report.estimatedHours} / ${report.actualHours}`} />
        <StatTile label="Bugs opened / fixed" value={`${report.bugsOpened} / ${report.bugsFixed}`} sub="Opened during the sprint · fixed by close" />
      </div>

      <MetricsView metrics={report} />

      <Card className="print-break-avoid gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">Carried over ({report.carriedOver.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <TaskRefTable rows={report.carriedOver} showTarget />
        </CardContent>
      </Card>
      <Card className="print-break-avoid gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm font-medium">Left incomplete ({report.leftIncomplete.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <TaskRefTable rows={report.leftIncomplete} />
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">This report is a snapshot taken when the sprint closed and never changes.</p>
    </div>
  );
}
