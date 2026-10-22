"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Link2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { canDeleteTask, canEditTask } from "@/lib/permissions";
import { deleteTask, updateTask } from "@/lib/services/tasks";
import { notifyError } from "@/lib/notify";
import { TASK_STATUS_LABELS } from "@/lib/constants";
import type { EditableTaskField, PresenceViewer, Task, TaskPatch } from "@/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { CarryBadge } from "@/components/common/badges";
import { UserAvatar, UserChip } from "@/components/common/user-avatar";
import { AttachmentsSection } from "./attachments-section";
import { CommentsSection } from "./comments-section";
import { ActivityList } from "./activity-list";
import { RichTextEditor } from "./rich-text-editor";
import { PropDate, PropNumber, PropSelect, PropText, PropTextarea } from "./property-controls";
import {
  appTypeOptions,
  moduleOptions,
  priorityOptions,
  severityOptions,
  statusOptions,
  typeOptions,
  userOptions,
  environmentOptions,
} from "./options";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-center gap-2 py-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TaskPanel({
  task,
  loading,
  section,
  viewers,
  onClose,
}: {
  task: Task | null;
  loading: boolean;
  section?: "attachments";
  /** Other users currently viewing this task. */
  viewers: PresenceViewer[];
  onClose: () => void;
}) {
  const { actor } = useCurrentUser();
  const { users, appTypes, modules, sprintById, userById } = useData();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Focus management: move focus into the panel on open, restore it on close.
  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => returnFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    if (section === "attachments" && task) {
      requestAnimationFrame(() =>
        panelRef.current?.querySelector("#attachments")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }, [section, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sprint = task ? sprintById.get(task.sprintId) : undefined;
  const editable = !!task && canEditTask(actor, task, sprint);

  const save = (patch: TaskPatch) => {
    if (!task) return;
    updateTask(task, patch, actor.uid).catch((err) => notifyError(err, "Couldn't save"));
  };
  const field =
    <K extends EditableTaskField>(name: K) =>
    (v: Task[K]) =>
      save({ [name]: v } as TaskPatch);

  const copyLink = async () => {
    if (!task) return;
    const url = new URL(window.location.href);
    url.pathname = `/releases/${task.sprintId}`;
    url.search = `?task=${task.taskKey}`;
    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="task-panel-title"
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l bg-background shadow-2xl sm:w-[min(640px,92vw)]"
      onKeyDown={(e) => {
        const t = e.target as HTMLElement;
        const typing = t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
        if (e.key === "Escape" && !typing && !e.defaultPrevented) onClose();
      }}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <span className="font-mono text-xs font-semibold">{task?.taskKey ?? "…"}</span>
        {task && <CarryBadge count={task.carryOverCount} />}
        {task && (
          <Button variant="ghost" size="icon-sm" onClick={copyLink} aria-label="Copy link to task">
            <Link2 />
          </Button>
        )}
        <div className="flex-1" />
        {viewers.length > 0 && (
          <div className="flex -space-x-1.5" aria-label="Also viewing this task">
            {viewers.map((v) => (
              <Tooltip key={v.id}>
                <TooltipTrigger asChild>
                  <span>
                    <UserAvatar id={v.id} initials={v.initials} name={v.name} size="sm" className="ring-2 ring-background" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{v.name} is viewing</TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
        {task && canDeleteTask(actor, sprint) && (
          <Button variant="ghost" size="icon-sm" onClick={() => setConfirmDelete(true)} aria-label="Delete task">
            <Trash2 />
          </Button>
        )}
        <Button ref={closeRef} variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
          <X />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && !task ? (
          <div className="grid gap-3 p-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-40" />
            <Skeleton className="h-24" />
          </div>
        ) : !task ? (
          <div className="p-6 text-sm text-muted-foreground">This task doesn&apos;t exist or was deleted.</div>
        ) : (
          <div className="grid gap-6 p-4">
            <div>
              <h2 id="task-panel-title" className="sr-only">
                {task.taskKey}: {task.title}
              </h2>
              <PropText
                value={task.title}
                onSave={field("title")}
                disabled={!editable}
                required
                label="Title"
                className="h-auto px-1 py-1 text-lg font-semibold md:text-lg"
              />
              {sprint?.status === "closed" && (
                <p className="mt-1 px-1 text-xs text-muted-foreground">
                  This task is in a closed release and is read-only.
                </p>
              )}
            </div>

            <section aria-label="Properties" className="grid gap-0.5">
              <Row label="Status">
                <PropSelect label="Status" value={task.status} options={statusOptions} onChange={(v) => v && save({ status: v as Task["status"] })} disabled={!editable} />
              </Row>
              <Row label="App Type">
                <PropSelect
                  label="App Type"
                  value={task.appTypeId}
                  options={appTypeOptions(appTypes, task.appTypeId)}
                  onChange={(v) => v && save({ appTypeId: v })}
                  disabled={!editable}
                />
              </Row>
              <Row label="Type">
                <PropSelect label="Type" value={task.type} options={typeOptions} onChange={(v) => v && save({ type: v as Task["type"] })} disabled={!editable} />
              </Row>
              <Row label="Module">
                <PropSelect
                  label="Module"
                  value={task.moduleId}
                  options={moduleOptions(modules, task.appTypeId, task.moduleId)}
                  onChange={field("moduleId")}
                  allowNone
                  disabled={!editable}
                />
              </Row>
              <Row label="Assigned to">
                <PropSelect
                  label="Assigned to"
                  value={task.assigneeId}
                  options={userOptions(users, task.assigneeId)}
                  onChange={field("assigneeId")}
                  allowNone
                  noneLabel="Unassigned"
                  disabled={!editable}
                />
              </Row>
              <Row label="Priority">
                <PropSelect label="Priority" value={task.priority} options={priorityOptions} onChange={(v) => v && save({ priority: v as Task["priority"] })} disabled={!editable} />
              </Row>
              {task.type === "bug" && (
                <Row label="Severity">
                  <PropSelect
                    label="Severity"
                    value={task.severity}
                    options={severityOptions}
                    onChange={(v) => save({ severity: v as Task["severity"] })}
                    allowNone
                    disabled={!editable}
                  />
                </Row>
              )}
              <Row label="Estimated (h)">
                <PropNumber label="Estimated hours" value={task.estimatedHours} onSave={field("estimatedHours")} disabled={!editable} />
              </Row>
              <Row label="Actual (h)">
                <PropNumber label="Actual hours" value={task.actualHours} onSave={field("actualHours")} disabled={!editable} />
              </Row>
              <Row label="Due date">
                <PropDate label="Due date" value={task.dueDate} onSave={field("dueDate")} disabled={!editable} />
              </Row>
              <Row label="Release date">
                <PropDate label="Release date" value={task.releaseDate} onSave={field("releaseDate")} disabled={!editable} />
              </Row>
              <Row label="Environment">
                <PropSelect
                  label="Environment"
                  value={task.environment || null}
                  options={environmentOptions(task.environment)}
                  onChange={(v) => save({ environment: v ?? "" })}
                  allowNone
                  disabled={!editable}
                />
              </Row>
              <Row label="Remarks">
                <PropTextarea label="Remarks" value={task.remarks} onSave={field("remarks")} placeholder="Add remarks…" disabled={!editable} />
              </Row>
              <Row label="Reported by">
                <div className="px-2.5 text-sm">
                  <UserChip user={userById.get(task.reporterId)} />
                </div>
              </Row>
              <Row label="Release">
                <div className="px-2.5 text-sm">{sprint?.name ?? "Unknown"}</div>
              </Row>
              {task.sprintHistory.length > 0 && (
                <Row label="Carried from">
                  <ul className="px-2.5 text-xs text-muted-foreground">
                    {task.sprintHistory.map((h, i) => (
                      <li key={`${h.sprintId}-${i}`}>
                        {h.sprintName} ({TASK_STATUS_LABELS[h.finalStatusInSprint]}) · {format(h.movedAt.toDate(), "PP")}
                      </li>
                    ))}
                  </ul>
                </Row>
              )}
            </section>

            <section aria-labelledby="desc-heading">
              <h3 id="desc-heading" className="mb-2 text-sm font-medium">
                Description
              </h3>
              <RichTextEditor
                key={task.id}
                value={task.description}
                editable={editable}
                onSave={(json, text) => save({ description: json, descriptionText: text })}
              />
            </section>

            {task.type === "bug" && (
              <section aria-label="Bug details" className="grid gap-3">
                <div>
                  <h3 className="mb-1.5 text-sm font-medium">Steps to reproduce</h3>
                  <PropTextarea label="Steps to reproduce" value={task.stepsToReproduce} onSave={field("stepsToReproduce")} disabled={!editable} placeholder={"1. …\n2. …"} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-1.5 text-sm font-medium">Expected result</h3>
                    <PropTextarea label="Expected result" value={task.expectedResult} onSave={field("expectedResult")} disabled={!editable} />
                  </div>
                  <div>
                    <h3 className="mb-1.5 text-sm font-medium">Actual result</h3>
                    <PropTextarea label="Actual result" value={task.actualResult} onSave={field("actualResult")} disabled={!editable} />
                  </div>
                </div>
              </section>
            )}

            <AttachmentsSection task={task} sprint={sprint} />

            <Tabs defaultValue="comments">
              <TabsList>
                <TabsTrigger value="comments">Comments</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
              <TabsContent value="comments" className="pt-3">
                <CommentsSection task={task} sprint={sprint} />
              </TabsContent>
              <TabsContent value="activity" className="pt-3">
                <ActivityList taskId={task.id} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${task?.taskKey}?`}
        description="The task, its comments and attachments will be permanently deleted."
        confirmLabel="Delete task"
        destructive
        onConfirm={async () => {
          if (!task) return;
          try {
            await deleteTask(task.id);
            toast.success(`${task.taskKey} deleted`);
            onClose();
          } catch (err) {
            notifyError(err, "Couldn't delete task");
          }
        }}
      />
    </aside>
  );
}
