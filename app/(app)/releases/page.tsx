"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { FileBarChart, Inbox, Plus, Zap } from "lucide-react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { useReports, useTasksInSprints } from "@/lib/hooks/use-tasks";
import { canManageSprints } from "@/lib/permissions";
import { suggestSprintName } from "@/lib/sprint-utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { SprintStatusBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SprintFormDialog } from "@/components/sprints/sprint-form-dialog";
import { completionPct } from "@/lib/task-model";
import type { TaskStatus } from "@/types";

export default function SprintsPage() {
  const { actor } = useCurrentUser();
  const { sprints, backlog, loading } = useData();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Open sprints: live counts from their tasks. Closed sprints: totals from the report snapshot.
  const openIds = useMemo(
    () => [...(backlog ? [backlog.id] : []), ...sprints.filter((s) => s.status !== "closed").map((s) => s.id)],
    [sprints, backlog],
  );
  const liveTasks = useTasksInSprints(openIds);
  const reports = useReports();

  const counts = useMemo(() => {
    // total = every task in the release; % = (Released + Cancelled + Duplicate) / all
    const statuses = new Map<string, TaskStatus[]>();
    for (const t of liveTasks.data) statuses.set(t.sprintId, [...(statuses.get(t.sprintId) ?? []), t.status]);
    const m = new Map<string, { total: number; pct: number }>();
    for (const [id, list] of statuses) m.set(id, { total: list.length, pct: completionPct(list) });
    for (const r of reports.data) m.set(r.sprintId, { total: r.total, pct: r.completionPct });
    return m;
  }, [liveTasks.data, reports.data]);

  // newest first, by end date (owner's request, 2026-10-29)
  const ordered = [...sprints].sort((a, b) => b.endDate.localeCompare(a.endDate) || b.startDate.localeCompare(a.startDate));
  const backlogCount = backlog ? (counts.get(backlog.id)?.total ?? 0) : 0;
  const fmt = (d: string) => format(parseISO(d), "MMM d");

  return (
    <>
      <PageHeader
        title="Releases"
        description="Releases are shared across all App Types. Only one can be active at a time."
        actions={
          <>
            {backlog && (
              <Button variant="outline" asChild>
                <Link href="/backlog">
                  <Inbox /> Open the Backlog
                  <span className="text-muted-foreground tabular-nums">({backlogCount})</span>
                </Link>
              </Button>
            )}
            {canManageSprints(actor) && (
              <Button onClick={() => setOpen(true)}>
                <Plus /> New Release
              </Button>
            )}
          </>
        }
      />

      {loading ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : ordered.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No releases yet"
          description={canManageSprints(actor) ? "Create the first release to start adding tasks." : "QA will create the first release."}
          action={
            canManageSprints(actor) && (
              <Button onClick={() => setOpen(true)}>
                <Plus /> New Release
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-2">
          {backlog && (
            <li>
              <Link
                href="/backlog"
                className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-dashed bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <div className="min-w-48 flex-1">
                  <div className="flex items-center gap-2">
                    <Inbox className="size-4 text-amber-600" />
                    <span className="font-medium">Backlog</span>
                    <SprintStatusBadge status="backlog" />
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">Tasks not planned into a release yet</div>
                </div>
                <div className="w-24 text-sm">
                  <span className="font-medium tabular-nums">{backlogCount}</span> <span className="text-muted-foreground">tasks</span>
                </div>
                <div className="w-44" />
              </Link>
            </li>
          )}
          {ordered.map((s) => {
            const c = counts.get(s.id);
            const pct = c?.pct ?? 0;
            return (
              <li key={s.id}>
                <Link
                  href={`/releases/${s.id}`}
                  className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <div className="min-w-48 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <SprintStatusBadge status={s.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {fmt(s.startDate)} to {fmt(s.endDate)}
                      {s.goal && <span> · {s.goal}</span>}
                    </div>
                  </div>
                  <div className="w-24 text-sm">
                    {c ? (
                      <>
                        <span className="font-medium tabular-nums">{c.total}</span>{" "}
                        <span className="text-muted-foreground">tasks</span>
                      </>
                    ) : liveTasks.loading ? (
                      <Skeleton className="h-4 w-16" />
                    ) : (
                      <span className="text-muted-foreground">0 tasks</span>
                    )}
                  </div>
                  <div className="flex w-44 items-center gap-2" title="Done = Released, Cancelled or Duplicate">
                    <Progress value={pct} className="h-1.5" aria-label={`${pct}% complete`} />
                    <span className="w-10 text-right text-xs tabular-nums">{pct}%</span>
                  </div>
                  {s.status === "closed" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        router.push(`/releases/${s.id}/report`);
                      }}
                    >
                      <FileBarChart /> Report
                    </Button>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <SprintFormDialog
        open={open}
        onOpenChange={setOpen}
        suggestedName={suggestSprintName(sprints)}
        onSaved={(id) => router.push(`/releases/${id}`)}
      />
    </>
  );
}
