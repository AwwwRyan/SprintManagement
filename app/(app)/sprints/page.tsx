"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { FileBarChart, Plus, Zap } from "lucide-react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { useReports, useTasksInSprints } from "@/lib/hooks/use-tasks";
import { canManageSprints } from "@/lib/permissions";
import { sortSprints, suggestSprintName } from "@/lib/sprint-utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { SprintStatusBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SprintFormDialog } from "@/components/sprints/sprint-form-dialog";

export default function SprintsPage() {
  const { actor } = useCurrentUser();
  const { sprints, loading } = useData();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Open sprints: live counts from their tasks. Closed sprints: totals from the report snapshot.
  const openIds = useMemo(() => sprints.filter((s) => s.status !== "closed").map((s) => s.id), [sprints]);
  const liveTasks = useTasksInSprints(openIds);
  const reports = useReports();

  const counts = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>();
    for (const t of liveTasks.data) {
      const c = m.get(t.sprintId) ?? { total: 0, done: 0 };
      c.total += 1;
      if (t.status === "done") c.done += 1;
      m.set(t.sprintId, c);
    }
    for (const r of reports.data) m.set(r.sprintId, { total: r.total, done: r.done });
    return m;
  }, [liveTasks.data, reports.data]);

  const ordered = sortSprints(sprints);
  const fmt = (d: string) => format(parseISO(d), "MMM d");

  return (
    <>
      <PageHeader
        title="Sprints"
        description="Sprints are shared across all App Types. Only one can be active at a time."
        actions={
          canManageSprints(actor) && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> New Sprint
            </Button>
          )
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
          title="No sprints yet"
          description={canManageSprints(actor) ? "Create the first sprint to start adding tasks." : "QA will create the first sprint."}
          action={
            canManageSprints(actor) && (
              <Button onClick={() => setOpen(true)}>
                <Plus /> New Sprint
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-2">
          {ordered.map((s) => {
            const c = counts.get(s.id);
            const pct = c && c.total ? Math.round((c.done / c.total) * 100) : 0;
            return (
              <li key={s.id}>
                <Link
                  href={`/sprints/${s.id}`}
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
                  <div className="flex w-44 items-center gap-2">
                    <Progress value={pct} className="h-1.5" aria-label={`${pct}% complete`} />
                    <span className="w-10 text-right text-xs tabular-nums">{pct}%</span>
                  </div>
                  {s.status === "closed" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        router.push(`/sprints/${s.id}/report`);
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
        onSaved={(id) => router.push(`/sprints/${id}`)}
      />
    </>
  );
}
