"use client";

import { Suspense } from "react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useAllTasks } from "@/lib/hooks/use-tasks";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/page-header";
import { TaskWorkspace } from "@/components/sprints/task-workspace";

function AllTasksView() {
  const { actor } = useCurrentUser();
  const live = useAllTasks(actor.uid);
  return (
    <TaskWorkspace
      sprint={null}
      live={live}
      mode="all"
      header={(presence) => (
        <PageHeader
          title="All Tasks"
          description="Every task in every release and the Backlog. Use the Release filter to narrow it down."
          actions={presence}
        />
      )}
    />
  );
}

export default function AllTasksPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <AllTasksView />
    </Suspense>
  );
}
