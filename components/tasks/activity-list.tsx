"use client";

import { useMemo } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { History } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { useActivity } from "@/lib/hooks/use-tasks";
import { describeActivity, type Lookups } from "@/lib/activity-format";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/common/user-avatar";

export function ActivityList({ taskId }: { taskId: string }) {
  const { userById, appTypeById, moduleById } = useData();
  const { data: activity, loading } = useActivity(taskId);

  const lookups = useMemo<Lookups>(
    () => ({
      userName: (id) => userById.get(id)?.name,
      appTypeName: (id) => appTypeById.get(id)?.name,
      moduleName: (id) => moduleById.get(id)?.name,
    }),
    [userById, appTypeById, moduleById],
  );

  if (loading) return <Skeleton className="h-24" />;
  if (activity.length === 0)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <History className="size-4" /> No activity yet.
      </p>
    );

  return (
    <ol className="grid gap-2.5">
      {activity.map((a) => {
        const actor = userById.get(a.actorId);
        const when = a.createdAt?.toDate();
        return (
          <li key={a.id} className="flex gap-2 text-sm">
            <UserAvatar id={a.actorId} initials={actor?.initials ?? "?"} name={actor?.name} size="xs" className="mt-0.5" />
            <div className="min-w-0">
              <span className="font-medium">{actor?.name ?? "Unknown user"}</span>{" "}
              <span className="text-muted-foreground">{describeActivity(a, lookups)}</span>
              {when && (
                <time
                  className="ml-1.5 text-xs whitespace-nowrap text-muted-foreground/70"
                  dateTime={when.toISOString()}
                  title={format(when, "PPpp")}
                >
                  {formatDistanceToNow(when, { addSuffix: true })}
                </time>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
