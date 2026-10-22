"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { CalendarRange, FileBarChart, Pencil, Play, SearchX, Square } from "lucide-react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { useSprintTasks } from "@/lib/hooks/use-tasks";
import { canManageSprints } from "@/lib/permissions";
import { startSprint } from "@/lib/services/sprints";
import { attempt } from "@/lib/notify";
import { daysRemaining } from "@/lib/metrics";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SprintStatusBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/empty-state";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { SprintFormDialog } from "@/components/sprints/sprint-form-dialog";
import { CloseSprintDialog } from "@/components/sprints/close-sprint-dialog";
import { TaskWorkspace } from "@/components/sprints/task-workspace";
import { isComplete, isExcluded } from "@/lib/task-model";

function SprintView() {
  const { sprintId } = useParams<{ sprintId: string }>();
  const { actor } = useCurrentUser();
  const { sprintById, loading } = useData();
  const sprint = sprintById.get(sprintId);
  const live = useSprintTasks(sprint ? sprintId : null, actor.uid);
  const [editOpen, setEditOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);

  if (loading) return <Skeleton className="h-96" />;
  if (!sprint)
    return (
      <EmptyState
        icon={SearchX}
        title="Release not found"
        action={
          <Button asChild variant="outline">
            <Link href="/releases">All releases</Link>
          </Button>
        }
      />
    );

  const staff = canManageSprints(actor);
  const fmt = (d: string) => format(parseISO(d), "MMM d, yyyy");
  const done = live.tasks.filter((t) => isComplete(t.status)).length;

  return (
    <>
      <TaskWorkspace
        sprint={sprint}
        live={live}
        mode="sprint"
        header={(presence) => (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{sprint.name}</h1>
                <SprintStatusBadge status={sprint.status} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarRange className="size-3.5" />
                  {fmt(sprint.startDate)} to {fmt(sprint.endDate)}
                </span>
                {sprint.status === "active" && <span>{daysRemaining(sprint.endDate)} days left</span>}
                {!live.loading && (
                  <span>
                    {done}/{live.tasks.filter((t) => !isExcluded(t.status)).length} done
                  </span>
                )}
              </div>
              {sprint.goal && <p className="mt-1 max-w-2xl text-sm">{sprint.goal}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {presence}
              {staff && sprint.status !== "closed" && (
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil /> Edit
                </Button>
              )}
              {staff && sprint.status === "planned" && (
                <Button size="sm" onClick={() => setStartOpen(true)}>
                  <Play /> Start release
                </Button>
              )}
              {staff && sprint.status === "active" && (
                <Button size="sm" variant="destructive" onClick={() => setCloseOpen(true)} disabled={live.loading}>
                  <Square /> Close release
                </Button>
              )}
              {sprint.status === "closed" && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/releases/${sprint.id}/report`}>
                    <FileBarChart /> View report
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      />

      <SprintFormDialog open={editOpen} onOpenChange={setEditOpen} sprint={sprint} />
      <ConfirmDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        title={`Start ${sprint.name}?`}
        description="Only one release can be active at a time."
        confirmLabel="Start release"
        onConfirm={async () => {
          await attempt(() => startSprint(sprint.id), "Couldn't start sprint", `${sprint.name} started`);
        }}
      />
      {sprint.status === "active" && (
        <CloseSprintDialog open={closeOpen} onOpenChange={setCloseOpen} sprint={sprint} tasks={live.tasks} />
      )}
    </>
  );
}

export default function SprintPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <SprintView />
    </Suspense>
  );
}
