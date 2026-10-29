"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Plus } from "lucide-react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { canCreateTask, canMoveTasks } from "@/lib/permissions";
import { useData } from "@/components/providers/data-provider";
import { MoveTasksDialog } from "@/components/tasks/move-tasks-dialog";
import { hasActiveFilters, EMPTY_FILTERS } from "@/lib/task-filters";
import { useTaskByKey, type LiveTasks } from "@/lib/hooks/use-tasks";
import { usePresence } from "@/lib/hooks/use-presence";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { TaskGrid } from "@/components/tasks/task-grid";
import { TaskPanel } from "@/components/tasks/task-panel";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { TaskFiltersBar, useRememberedFilters, useTaskFilters } from "@/components/tasks/task-filters-bar";
import { PresenceAvatars } from "./presence-avatars";
import type { Sprint, Task } from "@/types";

/**
 * Filters + task table + side panel for a release, the Backlog, My Tasks or All Tasks. The open
 * task lives in the URL (?task=TSK-142) so it can be linked; filters live in the URL too.
 */
export function TaskWorkspace({
  sprint,
  live,
  mode,
  header,
  rowNumbers,
  belowGrid,
}: {
  /** the release or Backlog shown; null for All Tasks */
  sprint: Sprint | null;
  live: LiveTasks;
  mode: "sprint" | "my-tasks" | "backlog" | "all";
  /** All Tasks: Sr No per task across pages */
  rowNumbers?: Map<string, number>;
  /** rendered under the table (All Tasks: page controls) */
  belowGrid?: React.ReactNode;
  /** Rendered above the table; receives the presence avatars for the header. */
  header: (presence: React.ReactNode) => React.ReactNode;
}) {
  const { profile, actor } = useCurrentUser();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useTaskFilters();
  // each person's filters are remembered per view and come back next time
  useRememberedFilters(actor.uid, mode, filters, setFilters);
  const [newOpen, setNewOpen] = useState(false);
  const [moving, setMoving] = useState<Task[] | null>(null);
  const { sprintById } = useData();
  const sprintOf = useCallback((t: Task) => sprintById.get(t.sprintId), [sprintById]);

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

  const viewers = usePresence(sprint?.id ?? "all-tasks", profile, openTask?.id ?? null);
  const taskViewers = openTask ? viewers.filter((v) => v.viewingTaskId === openTask.id) : [];

  const canAdd = !!sprint && canCreateTask(actor, sprint);
  const canMove = canMoveTasks(actor) && mode !== "my-tasks";
  const filtered = hasActiveFilters(filters);

  return (
    // fills the page area: the page doesn't scroll, the table inside does
    <div className="flex h-full min-h-0 flex-col">
      {header(<PresenceAvatars viewers={viewers} />)}
      <TaskGrid
        tasks={live.tasks}
        filters={filters}
        onFiltersChange={setFilters}
        noFilterFor={mode === "my-tasks" ? ["assigneeIds"] : []}
        sprint={sprint}
        sprintOf={mode === "all" ? sprintOf : undefined}
        showRelease={mode === "all"}
        rowNumbers={rowNumbers}
        onMoveTasks={canMove ? setMoving : undefined}
        loading={live.loading}
        flashing={live.flashing}
        onOpenTask={(key, sec) => setTaskParam(key, sec)}
        storageKey={mode}
        reorderable={mode === "sprint" || mode === "backlog"}
        quickAddDefaults={mode === "my-tasks" ? { assigneeIds: [actor.uid] } : undefined}
        toolbar={
          <>
            <TaskFiltersBar filters={filters} onChange={setFilters} />
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
              title={
                mode === "my-tasks"
                  ? "Nothing assigned to you"
                  : mode === "backlog"
                    ? "The Backlog is empty"
                    : mode === "all"
                      ? "No tasks yet"
                      : "No tasks in this release yet"
              }
              description={canAdd ? "Use the quick-add row below or the New Task button." : undefined}
            />
          )
        }
      />
      {belowGrid}
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

      {sprint && (
        <NewTaskDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          sprintId={sprint.id}
          defaultAssigneeId={mode === "my-tasks" ? actor.uid : null}
          onCreated={(key) => setTaskParam(key)}
        />
      )}
      <MoveTasksDialog tasks={moving} onClose={() => setMoving(null)} />
    </div>
  );
}
