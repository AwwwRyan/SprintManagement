"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Plus } from "lucide-react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { canCreateTask } from "@/lib/permissions";
import { hasActiveFilters, EMPTY_FILTERS } from "@/lib/task-filters";
import { useTaskByKey, type LiveTasks } from "@/lib/hooks/use-tasks";
import { usePresence } from "@/lib/hooks/use-presence";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { TaskGrid } from "@/components/tasks/task-grid";
import { TaskPanel } from "@/components/tasks/task-panel";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { TaskFiltersBar, useTaskFilters } from "@/components/tasks/task-filters-bar";
import { PresenceAvatars } from "./presence-avatars";
import type { Sprint } from "@/types";

/**
 * Filters + task table + side panel for one sprint. The open task lives in the URL (?task=TSK-142)
 * so it can be linked; filters live in the URL too.
 */
export function TaskWorkspace({
  sprint,
  live,
  mode,
  header,
}: {
  sprint: Sprint;
  live: LiveTasks;
  mode: "sprint" | "my-tasks";
  /** Rendered above the table; receives the presence avatars for the header. */
  header: (presence: React.ReactNode) => React.ReactNode;
}) {
  const { profile, actor } = useCurrentUser();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useTaskFilters();
  const [newOpen, setNewOpen] = useState(false);

  const openKey = params.get("task");
  const section = params.get("section") === "attachments" ? "attachments" : undefined;

  const setTaskParam = useCallback(
    (key: string | null, sec?: "attachments") => {
      const next = new URLSearchParams(params.toString());
      if (key) next.set("task", key);
      else next.delete("task");
      if (sec) next.set("section", sec);
      else next.delete("section");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname],
  );

  // The panel's task: from the live list when present, otherwise looked up by key (shared links).
  const inList = useMemo(() => live.tasks.find((t) => t.taskKey === openKey) ?? null, [live.tasks, openKey]);
  const byKey = useTaskByKey(openKey && !inList && !live.loading ? openKey : null);
  const openTask = inList ?? byKey.data[0] ?? null;

  const viewers = usePresence(sprint.id, profile, openTask?.id ?? null);
  const taskViewers = openTask ? viewers.filter((v) => v.viewingTaskId === openTask.id) : [];

  const canAdd = canCreateTask(actor, sprint);
  const filtered = hasActiveFilters(filters);

  return (
    <>
      {header(<PresenceAvatars viewers={viewers} />)}
      <TaskGrid
        tasks={live.tasks}
        filters={filters}
        sprint={sprint}
        loading={live.loading}
        flashing={live.flashing}
        onOpenTask={(key, sec) => setTaskParam(key, sec)}
        storageKey={mode}
        quickAddDefaults={mode === "my-tasks" ? { assigneeIds: [actor.uid] } : undefined}
        toolbar={
          <>
            <TaskFiltersBar filters={filters} onChange={setFilters} hideAssignee={mode === "my-tasks"} />
            {canAdd && (
              <Button size="sm" onClick={() => setNewOpen(true)} className="ml-auto">
                <Plus /> New Task
              </Button>
            )}
          </>
        }
        emptyState={
          filtered ? (
            <EmptyState
              icon={ClipboardList}
              title="No tasks match these filters"
              action={
                <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ClipboardList}
              title={mode === "my-tasks" ? "Nothing assigned to you" : "No tasks in this release yet"}
              description={canAdd ? "Use the quick-add row below or the New Task button." : undefined}
            />
          )
        }
      />
      {live.error && <p className="mt-2 text-sm text-destructive">Couldn&apos;t load tasks: {live.error}</p>}

      {openKey && (
        <TaskPanel
          key={openKey}
          task={openTask}
          loading={live.loading || byKey.loading}
          section={section}
          viewers={taskViewers}
          onClose={() => setTaskParam(null)}
        />
      )}

      <NewTaskDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        sprintId={sprint.id}
        defaultAssigneeId={mode === "my-tasks" ? actor.uid : null}
        onCreated={(key) => setTaskParam(key)}
      />
    </>
  );
}
