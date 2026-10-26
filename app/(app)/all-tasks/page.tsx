"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useTaskByKeyLive, useTaskCount, useTaskPage, type PageCursor } from "@/lib/hooks/use-tasks";
import { ALL_TASKS_PAGE_SIZE, pageQueryKey, parseTaskNumber, serverFilters } from "@/lib/task-page";
import { hasActiveFilters } from "@/lib/task-filters";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/page-header";
import { TaskWorkspace } from "@/components/sprints/task-workspace";
import { useTaskFilters } from "@/components/tasks/task-filters-bar";

function AllTasksView() {
  const { actor } = useCurrentUser();
  const [filters] = useTaskFilters();
  const { server, leftInBrowser } = useMemo(() => serverFilters(filters), [filters]);
  const taskNumber = parseTaskNumber(filters.q);

  // Pages are read 100 at a time (newest first). cursors[i] starts page i+1; page 0 has none.
  const [cursors, setCursors] = useState<PageCursor[]>([]);
  const serverKey = pageQueryKey(server, null);
  useEffect(() => setCursors([]), [serverKey]);
  const pageIndex = cursors.length;

  const page = useTaskPage(server, cursors[pageIndex - 1] ?? null, actor.uid, !taskNumber);
  const byNumber = useTaskByKeyLive(taskNumber, actor.uid);
  const live = taskNumber ? byNumber : page;
  const total = useTaskCount(server, page.tasks.length);

  const offset = taskNumber ? 0 : pageIndex * ALL_TASKS_PAGE_SIZE;
  const rowNumbers = useMemo(() => new Map(live.tasks.map((t, i) => [t.id, offset + i + 1])), [live.tasks, offset]);
  const last = page.tasks[page.tasks.length - 1];
  const hasNext = !taskNumber && page.tasks.length === ALL_TASKS_PAGE_SIZE && (total === null || offset + ALL_TASKS_PAGE_SIZE < total);
  const browserOnly = (filters.q.trim() !== "" && !taskNumber) || leftInBrowser.length > 0 || hasActiveFilters({ ...filters, q: "", sprintId: [], status: [], type: [] });

  const pager = (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" aria-label="Pages">
      {taskNumber ? (
        <span className="text-muted-foreground">
          Showing task {taskNumber} from any release. Clear the search to browse all tasks.
        </span>
      ) : (
        <>
          <span className="tabular-nums">
            {live.tasks.length === 0
              ? "No tasks"
              : `Showing ${offset + 1}–${offset + live.tasks.length}${total !== null ? ` of ${total}` : ""}`}
            <span className="text-muted-foreground"> · newest first</span>
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setCursors((c) => c.slice(0, -1))} disabled={pageIndex === 0 || live.loading}>
              <ChevronLeft /> Previous
            </Button>
            <span className="px-2 text-muted-foreground tabular-nums">
              Page {pageIndex + 1}
              {total !== null && ` of ${Math.max(1, Math.ceil(total / ALL_TASKS_PAGE_SIZE))}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNext || live.loading || !last?.createdAt}
              onClick={() => last?.createdAt && setCursors((c) => [...c, { createdAtMs: last.createdAt!.toMillis(), id: last.id }])}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </>
      )}
      {browserOnly && !taskNumber && (
        <p className="w-full text-xs text-muted-foreground">
          Text search and the {[...leftInBrowser, "App Type", "Module", "Assignee", "Priority", "Date"].join(" / ")} filters look within the{" "}
          {ALL_TASKS_PAGE_SIZE} tasks on this page. Release, Status and Category cover all tasks. To find one task anywhere, search
          its number (e.g. TSK-142).
        </p>
      )}
    </div>
  );

  return (
    <TaskWorkspace
      sprint={null}
      live={live}
      mode="all"
      rowNumbers={rowNumbers}
      belowGrid={pager}
      header={(presence) => (
        <PageHeader
          title="All Tasks"
          description="Every task in every release and the Backlog, 100 per page. Search a task number to find it anywhere."
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
