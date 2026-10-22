"use client";

import { Suspense } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { useMyTasks } from "@/lib/hooks/use-tasks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { TaskWorkspace } from "@/components/sprints/task-workspace";

function MyTasks() {
  const { actor } = useCurrentUser();
  const { activeSprint, loading } = useData();
  const live = useMyTasks(activeSprint?.id ?? null, actor.uid);

  if (loading) return <Skeleton className="h-96" />;
  if (!activeSprint)
    return (
      <>
        <PageHeader title="My Tasks" />
        <EmptyState
          icon={ListChecks}
          title="No active release"
          description="Your tasks show up here once a release is started."
          action={
            <Button asChild variant="outline">
              <Link href="/releases">View releases</Link>
            </Button>
          }
        />
      </>
    );

  return (
    <TaskWorkspace
      sprint={activeSprint}
      live={live}
      mode="my-tasks"
      header={(presence) => (
        <PageHeader
          title="My Tasks"
          description={
            <>
              Assigned to you in{" "}
              <Link href={`/releases/${activeSprint.id}`} className="font-medium text-foreground hover:underline">
                {activeSprint.name}
              </Link>
            </>
          }
          actions={presence}
        />
      )}
    />
  );
}

export default function MyTasksPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <MyTasks />
    </Suspense>
  );
}
