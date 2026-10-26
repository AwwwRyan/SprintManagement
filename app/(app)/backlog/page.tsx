"use client";

import { Suspense } from "react";
import { Inbox } from "lucide-react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { useSprintTasks } from "@/lib/hooks/use-tasks";
import { setUpBacklog } from "@/lib/services/sprints";
import { canManageUsers } from "@/lib/permissions";
import { attempt } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { TaskWorkspace } from "@/components/sprints/task-workspace";
import { BACKLOG_ID } from "@/types";

function BacklogView() {
  const { actor } = useCurrentUser();
  const { backlog, loading } = useData();
  const live = useSprintTasks(backlog ? BACKLOG_ID : null, actor.uid);

  if (loading) return <Skeleton className="h-96" />;
  if (!backlog)
    return (
      <>
        <PageHeader title="Backlog" />
        <EmptyState
          icon={Inbox}
          title="The Backlog isn't set up yet"
          description={
            canManageUsers(actor)
              ? "One click sets it up. After that, tasks that aren't planned into a release can wait here."
              : "Ask an admin to open this page once to set it up."
          }
          action={
            canManageUsers(actor) ? (
              <Button onClick={() => void attempt(() => setUpBacklog(actor.uid), "Couldn't set up the Backlog", "Backlog is ready")}>
                Set up the Backlog
              </Button>
            ) : undefined
          }
        />
      </>
    );

  return (
    <TaskWorkspace
      sprint={backlog}
      live={live}
      mode="backlog"
      header={(presence) => (
        <PageHeader
          title="Backlog"
          description="Tasks that aren't planned into a release yet. QA and Admin can move them into a release with Move to…"
          actions={presence}
        />
      )}
    />
  );
}

export default function BacklogPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <BacklogView />
    </Suspense>
  );
}
