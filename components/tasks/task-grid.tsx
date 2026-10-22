"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, GripVertical, Paperclip, Plus } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { applyFilters, type TaskFilters } from "@/lib/task-filters";
import { canCreateTask, canEditTask } from "@/lib/permissions";
import { createTask, setTaskOrders, updateTask, type NewTaskInput } from "@/lib/services/tasks";
import { planMove } from "@/lib/reorder";
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { PRIORITIES, TASK_STATUSES, TASK_TYPES, type EditableTaskField, type Sprint, type Task, type TaskPatch } from "@/types";
import { AppTypeBadge, CarryBadge, PriorityBadge, StatusBadge, TypeBadge } from "@/components/common/badges";
import { UserChip } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssigneeCellEditor, AssigneeStack } from "./assignee-picker";
import { DateCellEditor, NumberCellEditor, SelectCellEditor, TextareaCellEditor, TextCellEditor } from "./cell-editors";
import {
  appTypeOptions,
  moduleOptions,
  priorityOptions,
  statusOptions,
  typeOptions,
  environmentOptions,
  type Option,
} from "./options";

/* ------------------------------------------------------------------ column config */

type EditorKind = "text" | "textarea" | "number" | "date" | "select" | "assignees";

interface ColConfig {
  id: string;
  label: string;
  width: number;
  /** stays visible on horizontal scroll */
  sticky?: boolean;
  /** can't be hidden */
  locked?: boolean;
  field?: EditableTaskField;
  editor?: EditorKind;
  required?: boolean;
  /** clicking opens the side panel instead of editing */
  opensPanel?: boolean;
  /** text wraps onto multiple lines (row grows) instead of being cut off */
  wrap?: boolean;
  applicable?: (t: Task) => boolean;
  options?: (t: Task) => { options: Option[]; allowNone?: boolean; noneLabel?: string };
  render: (t: Task) => React.ReactNode;
  sortValue: (t: Task) => string | number;
}

const LAST_APP_TYPE_KEY = "stm.lastAppTypeId";

/** Columns hidden until the user turns them on (Columns menu). Saved choices override this. */
const DEFAULT_HIDDEN: VisibilityState = { taskKey: false };

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export interface TaskGridProps {
  /** All tasks of the view (unfiltered, so Sr No stays stable). */
  tasks: Task[];
  filters: TaskFilters;
  sprint: Sprint;
  loading: boolean;
  flashing: Set<string>;
  onOpenTask: (taskKey: string, section?: "attachments") => void;
  /** localStorage key for column visibility */
  storageKey: string;
  quickAddDefaults?: Partial<NewTaskInput>;
  toolbar?: React.ReactNode;
  emptyState?: React.ReactNode;
  /** rows can be dragged into a new order (the release view; order is shared by everyone) */
  reorderable?: boolean;
}

export function TaskGrid({
  tasks,
  filters,
  sprint,
  loading,
  flashing,
  onOpenTask,
  storageKey,
  quickAddDefaults,
  toolbar,
  emptyState,
  reorderable = false,
}: TaskGridProps) {
  const { actor } = useCurrentUser();
  const { appTypes, modules, userById, appTypeById, moduleById } = useData();

  /* Sr No = position within the whole sprint by `order` (independent of filters/sort). */
  const srNo = useMemo(() => {
    const m = new Map<string, number>();
    [...tasks].sort((a, b) => a.order - b.order).forEach((t, i) => m.set(t.id, i + 1));
    return m;
  }, [tasks]);

  const cols = useMemo<ColConfig[]>(() => {
    const userName = (id: string | null) => (id ? (userById.get(id)?.name ?? "") : "");
    return [
      {
        id: "srNo",
        label: "Sr No",
        width: 64,
        sticky: true,
        locked: true,
        opensPanel: true,
        render: (t) => <span className="text-muted-foreground tabular-nums">{srNo.get(t.id)}</span>,
        sortValue: (t) => srNo.get(t.id) ?? 0,
      },
      {
        id: "taskKey",
        label: "Task ID",
        width: 92,
        sticky: true,
        opensPanel: true,
        render: (t) => <span className="font-mono text-xs font-medium">{t.taskKey}</span>,
        sortValue: (t) => Number(t.taskKey.split("-")[1] ?? 0),
      },
      {
        id: "appTypeId",
        label: "App Type",
        width: 150,
        field: "appTypeId",
        editor: "select",
        options: (t) => ({ options: appTypeOptions(appTypes, t.appTypeId) }),
        render: (t) => <AppTypeBadge appType={appTypeById.get(t.appTypeId)} />,
        sortValue: (t) => appTypeById.get(t.appTypeId)?.name ?? "",
      },
      {
        id: "type",
        label: "Category",
        width: 112,
        field: "type",
        editor: "select",
        options: () => ({ options: typeOptions }),
        render: (t) => <TypeBadge type={t.type} />,
        sortValue: (t) => TASK_TYPES.indexOf(t.type),
      },
      {
        id: "moduleId",
        label: "Module",
        width: 130,
        field: "moduleId",
        editor: "select",
        options: (t) => ({ options: moduleOptions(modules, t.appTypeId, t.moduleId), allowNone: true }),
        render: (t) =>
          t.moduleId ? (
            <span className="truncate">{moduleById.get(t.moduleId)?.name ?? "Unknown"}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
        sortValue: (t) => (t.moduleId ? (moduleById.get(t.moduleId)?.name ?? "") : ""),
      },
      {
        id: "title",
        label: "Task",
        width: 380,
        locked: true,
        field: "title",
        editor: "text",
        required: true,
        opensPanel: true,
        wrap: true,
        render: (t) => <span className="block font-medium break-words whitespace-normal">{t.title}</span>,
        sortValue: (t) => t.title.toLowerCase(),
      },
      {
        id: "assigneeIds",
        label: "Assignees",
        width: 200,
        field: "assigneeIds",
        editor: "assignees",
        render: (t) => <AssigneeStack ids={t.assigneeIds} />,
        sortValue: (t) => (t.assigneeIds.length ? t.assigneeIds.map(userName).sort().join(", ") : "￿"),
      },
      {
        id: "priority",
        label: "Priority",
        width: 96,
        field: "priority",
        editor: "select",
        options: () => ({ options: priorityOptions }),
        render: (t) => <PriorityBadge priority={t.priority} />,
        sortValue: (t) => PRIORITIES.indexOf(t.priority),
      },
      {
        id: "estimatedHours",
        label: "Est. (h)",
        width: 76,
        field: "estimatedHours",
        editor: "number",
        render: (t) => <span className="tabular-nums">{t.estimatedHours ?? "-"}</span>,
        sortValue: (t) => t.estimatedHours ?? -1,
      },
      {
        id: "actualHours",
        label: "Actual (h)",
        width: 84,
        field: "actualHours",
        editor: "number",
        render: (t) => <span className="tabular-nums">{t.actualHours ?? "-"}</span>,
        sortValue: (t) => t.actualHours ?? -1,
      },
      {
        id: "status",
        label: "Status",
        width: 156,
        field: "status",
        editor: "select",
        options: () => ({ options: statusOptions }),
        render: (t) => <StatusBadge status={t.status} />,
        sortValue: (t) => TASK_STATUSES.indexOf(t.status),
      },
      {
        id: "remarks",
        label: "Remarks",
        width: 220,
        field: "remarks",
        editor: "textarea",
        wrap: true,
        render: (t) =>
          t.remarks ? (
            <span className="line-clamp-3 break-words whitespace-pre-line">{t.remarks}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
        sortValue: (t) => (t.remarks || "\uffff").toLowerCase(),
      },
      {
        id: "attachments",
        label: "Files",
        width: 64,
        opensPanel: true,
        render: (t) => (
          <span className={cn("inline-flex items-center gap-1", !t.attachmentCount && "text-muted-foreground/60")}>
            <Paperclip className="size-3.5" />
            <span className="tabular-nums">{t.attachmentCount}</span>
          </span>
        ),
        sortValue: (t) => t.attachmentCount,
      },
      {
        id: "reporterId",
        label: "Reported by",
        width: 150,
        render: (t) => <UserChip user={userById.get(t.reporterId)} />,
        sortValue: (t) => userName(t.reporterId),
      },
      {
        id: "dueDate",
        label: "Due date",
        width: 116,
        field: "dueDate",
        editor: "date",
        render: (t) => <span className="tabular-nums">{t.dueDate ?? <span className="text-muted-foreground">-</span>}</span>,
        sortValue: (t) => t.dueDate ?? "9999",
      },
      {
        id: "releaseDate",
        label: "Release date",
        width: 124,
        field: "releaseDate",
        editor: "date",
        render: (t) => <span className="tabular-nums">{t.releaseDate ?? <span className="text-muted-foreground">-</span>}</span>,
        sortValue: (t) => t.releaseDate ?? "9999",
      },
      {
        id: "environment",
        label: "Environment",
        width: 130,
        field: "environment",
        editor: "select",
        options: (t) => ({ options: environmentOptions(t.environment), allowNone: true }),
        render: (t) => <span className="block truncate">{t.environment || <span className="text-muted-foreground">-</span>}</span>,
        sortValue: (t) => t.environment.toLowerCase(),
      },
      {
        id: "carryOverCount",
        label: "Carried",
        width: 76,
        render: (t) => <CarryBadge count={t.carryOverCount} />,
        sortValue: (t) => t.carryOverCount,
      },
    ];
  }, [appTypes, modules, userById, appTypeById, moduleById, srNo]);

  const colById = useMemo(() => new Map(cols.map((c) => [c.id, c])), [cols]);

  /* ---------------------------------------------------------------- table state */

  const visibilityKey = `stm.columns.${storageKey}`;
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(DEFAULT_HIDDEN);
  useEffect(() => {
    const saved = readStorage(visibilityKey);
    if (saved) {
      try {
        setColumnVisibility({ ...DEFAULT_HIDDEN, ...(JSON.parse(saved) as VisibilityState) });
      } catch {
        /* ignore corrupt value */
      }
    }
  }, [visibilityKey]);
  const updateVisibility = (next: VisibilityState) => {
    setColumnVisibility(next);
    writeStorage(visibilityKey, JSON.stringify(next));
  };

  const [sorting, setSorting] = useState<SortingState>([{ id: "srNo", desc: false }]);
  const filtered = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);

  const columns = useMemo<ColumnDef<Task>[]>(
    () =>
      cols.map((c) => ({
        id: c.id,
        header: c.label,
        accessorFn: (t: Task) => c.sortValue(t),
        size: c.width,
        enableHiding: !c.locked,
        sortingFn: "basic",
      })),
    [cols],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    getRowId: (t) => t.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const visibleCols = table.getVisibleLeafColumns();

  /* Sticky offsets for the pinned left columns. */
  const stickyLeft = useMemo(() => {
    const m = new Map<string, number>();
    let left = 0;
    for (const col of visibleCols) {
      const cfg = colById.get(col.id);
      if (cfg?.sticky) {
        m.set(col.id, left);
        left += cfg.width;
      }
    }
    return m;
  }, [visibleCols, colById]);
  /** The right-most visible sticky column gets the divider border. */
  const lastStickyId = useMemo(() => Array.from(stickyLeft.keys()).pop(), [stickyLeft]);

  /* ---------------------------------------------------------------- editing & focus */

  const [editing, setEditing] = useState<{ rowId: string; colId: string } | null>(null);
  const [focus, setFocus] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const tableRef = useRef<HTMLTableElement>(null);

  const focusCell = useCallback((r: number, c: number) => {
    setFocus({ r, c });
    requestAnimationFrame(() => {
      tableRef.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)?.focus();
    });
  }, []);

  const canEdit = useCallback((t: Task) => canEditTask(actor, t, sprint), [actor, sprint]);

  const save = useCallback(
    (task: Task, field: EditableTaskField, value: unknown) => {
      if (field === "appTypeId" && typeof value === "string") writeStorage(LAST_APP_TYPE_KEY, value);
      // Firestore applies this to the local cache immediately (optimistic) and reverts it if rejected.
      updateTask(task, { [field]: value } as TaskPatch, actor.uid).catch((err) => notifyError(err, "Couldn't save"));
    },
    [actor.uid],
  );

  /** Click / Enter on a cell. */
  const activate = (task: Task, colId: string, via: "click" | "key") => {
    const cfg = colById.get(colId);
    if (!cfg) return;
    const editable = !!cfg.editor && canEdit(task) && (cfg.applicable?.(task) ?? true);
    // Title: click opens the panel, Enter/F2/double-click edits inline.
    if (cfg.opensPanel && !(colId === "title" && via === "key" && editable)) {
      onOpenTask(task.taskKey, colId === "attachments" ? "attachments" : undefined);
      return;
    }
    if (editable) setEditing({ rowId: task.id, colId });
    else if (via === "click" && !canEdit(task)) onOpenTask(task.taskKey);
  };

  const stopEditing = (r: number, c: number) => {
    setEditing(null);
    focusCell(r, c);
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return;
    const { r, c } = focus;
    // Alt+↑/↓ moves the focused row (keyboard alternative to dragging).
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const up = e.key === "ArrowUp";
      const row = rows[r];
      const target = rows[up ? r - 1 : r + 1];
      if (reorderOn && row && target && canEdit(row.original)) {
        e.preventDefault();
        move(row.id, target.id, up ? "before" : "after");
        focusCell(up ? r - 1 : r + 1, c);
      }
      return;
    }
    const maxR = rows.length - 1;
    const maxC = visibleCols.length - 1;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [Math.max(0, r - 1), c],
      ArrowDown: [Math.min(maxR, r + 1), c],
      ArrowLeft: [r, Math.max(0, c - 1)],
      ArrowRight: [r, Math.min(maxC, c + 1)],
      Home: [r, 0],
      End: [r, maxC],
    };
    if (moves[e.key]) {
      e.preventDefault();
      focusCell(...moves[e.key]);
    } else if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      const row = rows[r];
      const col = visibleCols[c];
      if (row && col) activate(row.original, col.id, "key");
    }
  };

  /* ---------------------------------------------------------------- reorder (drag & drop) */

  // Manual order only makes sense when rows are shown in that order (Sr No ascending, or unsorted).
  const manualOrder = sorting.length === 0 || (sorting[0].id === "srNo" && !sorting[0].desc);
  const reorderOn = reorderable && manualOrder && sprint.status !== "closed";
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ id: string; pos: "before" | "after" } | null>(null);

  const move = useCallback(
    (movedId: string, targetId: string, pos: "before" | "after") => {
      const plan = planMove(tasks, movedId, targetId, pos);
      if (plan.kind === "none") return;
      const writes = plan.kind === "one" ? [{ id: plan.id, order: plan.order }] : plan.orders;
      setTaskOrders(writes, actor.uid).catch((err) => notifyError(err, "Couldn't reorder"));
    },
    [tasks, actor.uid],
  );

  const dropPos = (e: React.DragEvent<HTMLElement>): "before" | "after" => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };
  const endDrag = () => {
    setDragId(null);
    setDropHint(null);
  };

  /* ---------------------------------------------------------------- quick add */

  const [quickTitle, setQuickTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const canAdd = canCreateTask(actor, sprint);
  const activeAppTypes = appTypes.filter((a) => a.active);

  const quickAdd = async () => {
    const title = quickTitle.trim();
    if (!title || adding) return;
    const last = readStorage(LAST_APP_TYPE_KEY);
    const appTypeId = activeAppTypes.find((a) => a.id === last)?.id ?? activeAppTypes[0]?.id;
    if (!appTypeId) {
      toast.error("No active App Types yet. An admin needs to create one first.");
      return;
    }
    setAdding(true);
    try {
      const created = await createTask(
        { title, sprintId: sprint.id, appTypeId, type: "task", status: "pending", priority: "medium", ...quickAddDefaults },
        actor.uid,
      );
      setQuickTitle("");
      toast.success(`${created.taskKey} created`, {
        action: {
          label: "Open",
          onClick: () => onOpenTask(created.taskKey),
        },
      });
    } catch (err) {
      notifyError(err, "Couldn't create task");
    } finally {
      setAdding(false);
    }
  };

  /* ---------------------------------------------------------------- render */

  const totalWidth = visibleCols.reduce((sum, c) => sum + (colById.get(c.id)?.width ?? 100), 0);

  const renderEditor = (task: Task, cfg: ColConfig, r: number, c: number) => {
    const field = cfg.field!;
    const commit = (value: unknown) => {
      save(task, field, field === "environment" ? (value ?? "") : value);
      stopEditing(r, c);
    };
    const cancel = () => stopEditing(r, c);
    const current = task[field];
    switch (cfg.editor) {
      case "text":
        return <TextCellEditor initial={String(current ?? "")} onCommit={commit} onCancel={cancel} required={cfg.required} />;
      case "assignees":
        return <AssigneeCellEditor initial={task.assigneeIds} onCommit={commit} />;
      case "textarea":
        return <TextareaCellEditor initial={String(current ?? "")} onCommit={commit} onCancel={cancel} />;
      case "number":
        return <NumberCellEditor initial={(current as number | null) ?? null} onCommit={commit} onCancel={cancel} />;
      case "date":
        return <DateCellEditor initial={(current as string | null) ?? null} onCommit={commit} onCancel={cancel} />;
      case "select": {
        const o = cfg.options!(task);
        return (
          <SelectCellEditor
            initial={(current as string | null) ?? null}
            onCommit={commit}
            onCancel={cancel}
            options={o.options}
            allowNone={o.allowNone}
            noneLabel={o.noneLabel}
          />
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{toolbar}</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 /> Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-52 overflow-y-auto">
            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllLeafColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={col.getIsVisible()}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(v) => updateVisibility({ ...columnVisibility, [col.id]: !!v })}
                >
                  {colById.get(col.id)?.label}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative max-h-[calc(100svh-15rem)] min-h-48 overflow-auto rounded-lg border">
        <table
          ref={tableRef}
          role="grid"
          aria-label="Tasks"
          aria-rowcount={rows.length}
          className="w-full border-separate border-spacing-0 text-sm"
          style={{ minWidth: totalWidth }}
          onKeyDown={onGridKeyDown}
        >
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const cfg = colById.get(h.column.id)!;
                  const sorted = h.column.getIsSorted();
                  const left = stickyLeft.get(h.column.id);
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                      className={cn(
                        "sticky top-0 z-20 border-b bg-muted px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground",
                        left !== undefined && "z-30",
                      )}
                      style={{ width: cfg.width, minWidth: cfg.width, left }}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={h.column.getToggleSortingHandler()}
                        tabIndex={-1}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ArrowUpDown className="size-3 opacity-30" />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {visibleCols.map((col) => (
                    <td key={col.id} className="border-b px-2 py-2.5">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length} className="p-4">
                  {emptyState}
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((row, r) => {
                const task = row.original;
                const editable = canEdit(task);
                return (
                  <tr
                    key={row.id}
                    aria-rowindex={r + 1}
                    data-task-key={task.taskKey}
                    className={cn("group", flashing.has(task.id) && "row-flash")}
                    onDragOver={
                      dragId
                        ? (e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            const pos = dropPos(e);
                            if (dropHint?.id !== task.id || dropHint.pos !== pos) setDropHint({ id: task.id, pos });
                          }
                        : undefined
                    }
                    onDrop={
                      dragId
                        ? (e) => {
                            e.preventDefault();
                            move(dragId, task.id, dropPos(e));
                            endDrag();
                          }
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell, c) => {
                      const cfg = colById.get(cell.column.id)!;
                      const isEditing = editing?.rowId === task.id && editing.colId === cfg.id;
                      const left = stickyLeft.get(cfg.id);
                      const cellEditable = editable && !!cfg.editor && (cfg.applicable?.(task) ?? true);
                      return (
                        <td
                          key={cell.id}
                          data-cell={`${r}:${c}`}
                          role="gridcell"
                          tabIndex={focus.r === r && focus.c === c ? 0 : -1}
                          aria-readonly={!cellEditable}
                          onFocus={() => setFocus({ r, c })}
                          onClick={() => !isEditing && activate(task, cfg.id, "click")}
                          onDoubleClick={() => cfg.id === "title" && cellEditable && setEditing({ rowId: task.id, colId: "title" })}
                          className={cn(
                            "h-9 border-b bg-background px-2 py-1.5 align-top outline-none group-hover:bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))] focus:ring-2 focus:ring-ring focus:ring-inset",
                            cfg.wrap ? "whitespace-normal" : "whitespace-nowrap",
                            left !== undefined && "sticky z-10",
                            cfg.id === lastStickyId && "border-r",
                            cellEditable || cfg.opensPanel ? "cursor-pointer" : "cursor-default",
                            isEditing && "p-0.5",
                            dragId === task.id && "opacity-50",
                            // drop indicator: an inset line, so nothing moves or changes position
                            dropHint?.id === task.id &&
                              (dropHint.pos === "before"
                                ? "shadow-[inset_0_2px_0_0_var(--primary)]"
                                : "shadow-[inset_0_-2px_0_0_var(--primary)]"),
                          )}
                          style={{ width: cfg.width, minWidth: cfg.width, maxWidth: cfg.width, left }}
                        >
                          {isEditing ? (
                            renderEditor(task, cfg, r, c)
                          ) : cfg.id === "srNo" && reorderOn && editable ? (
                            <span className="flex items-center gap-1">
                              <span
                                draggable
                                role="button"
                                aria-label={`Drag to reorder ${task.taskKey}`}
                                title="Drag to reorder (or Alt+↑/↓)"
                                data-drag-handle
                                className="-ml-1 cursor-grab text-muted-foreground opacity-40 group-hover:opacity-100 active:cursor-grabbing"
                                onClick={(e) => e.stopPropagation()}
                                onDragStart={(e) => {
                                  e.dataTransfer.effectAllowed = "move";
                                  e.dataTransfer.setData("text/plain", task.taskKey);
                                  const tr = e.currentTarget.closest("tr");
                                  if (tr) e.dataTransfer.setDragImage(tr, 24, 16);
                                  setDragId(task.id);
                                }}
                                onDragEnd={endDrag}
                              >
                                <GripVertical className="size-3.5" />
                              </span>
                              {cfg.render(task)}
                            </span>
                          ) : (
                            cfg.render(task)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

            {canAdd && !loading && (
              <tr>
                <td colSpan={visibleCols.length} className="bg-background p-0">
                  <div className="sticky left-0 flex w-full max-w-[min(100%,48rem)] items-center gap-2 px-2 py-1.5">
                    <Plus className="size-4 shrink-0 text-muted-foreground" />
                    <input
                      value={quickTitle}
                      onChange={(e) => setQuickTitle(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") void quickAdd();
                        if (e.key === "Escape") setQuickTitle("");
                      }}
                      disabled={adding}
                      placeholder="Add a task: type a title and press Enter"
                      aria-label="Quick add task"
                      className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-muted-foreground">
        {filtered.length === tasks.length ? `${tasks.length} tasks` : `${filtered.length} of ${tasks.length} tasks`}
        {" · "}Arrow keys move, Enter edits, Esc cancels
        {reorderOn && " · Drag the grip or press Alt+↑/↓ to reorder"}
        {reorderable && !manualOrder && " · Sort by Sr No to reorder"}
      </div>
    </div>
  );
}
