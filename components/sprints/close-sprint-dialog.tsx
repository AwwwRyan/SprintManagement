"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Inbox } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { closeSprint, type CarryTarget } from "@/lib/services/sprints";
import { sprintSchema, type SprintInput } from "@/lib/validation";
import { suggestSprintName } from "@/lib/sprint-utils";
import { notifyError } from "@/lib/notify";
import { isFinished } from "@/lib/task-model";
import { canGoToBacklog } from "@/lib/move-plan";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppTypeBadge, StatusBadge } from "@/components/common/badges";
import { AssigneeStack } from "@/components/tasks/assignee-picker";
import { defaultSprintInput, SprintFields } from "./sprint-form-dialog";
import type { Sprint, Task } from "@/types";

const NEW = "__new__";

type Destination = "release" | "backlog";

/** Two buttons per task: "Next release" / "Backlog". */
function DestinationToggle({
  taskKey,
  value,
  onChange,
  backlogDisabled,
  backlogHint,
}: {
  taskKey: string;
  value: Destination;
  onChange: (d: Destination) => void;
  backlogDisabled: boolean;
  backlogHint?: string;
}) {
  const opt = (d: Destination, label: string, disabled = false, title?: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === d}
      aria-label={`${taskKey}: ${label}`}
      disabled={disabled}
      title={title}
      onClick={() => onChange(d)}
      className={cn(
        "flex-1 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        value === d ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label={`Where ${taskKey} goes`}>
      {opt("release", "Next release")}
      {opt("backlog", "Backlog", backlogDisabled, backlogHint)}
    </div>
  );
}

export function CloseSprintDialog({
  open,
  onOpenChange,
  sprint,
  tasks,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sprint: Sprint;
  tasks: Task[];
}) {
  const { actor } = useCurrentUser();
  const { sprints, users, appTypes, appTypeById, backlog } = useData();
  const unfinished = useMemo(
    () => tasks.filter((t) => !isFinished(t.status)).sort((a, b) => a.order - b.order),
    [tasks],
  );
  const planned = sprints.filter((s) => s.status === "planned");

  // Every unfinished task gets a destination (owner's rule: nothing is left behind).
  const [dest, setDest] = useState<Map<string, Destination>>(new Map());
  const [target, setTarget] = useState<string>(NEW);
  const [busy, setBusy] = useState(false);
  const newSprintForm = useForm<SprintInput>({ resolver: zodResolver(sprintSchema), defaultValues: defaultSprintInput() });

  useEffect(() => {
    if (!open) return;
    setDest(new Map(unfinished.map((t) => [t.id, "release" as const])));
    setTarget(planned[0]?.id ?? NEW);
    newSprintForm.reset(defaultSprintInput(suggestSprintName(sprints)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setOne = (id: string, d: Destination) => setDest((m) => new Map(m).set(id, d));
  const setAll = (d: Destination) =>
    setDest(new Map(unfinished.map((t) => [t.id, d === "backlog" && !canGoToBacklog(t.status) ? "release" : d])));

  const releaseIds = unfinished.filter((t) => dest.get(t.id) !== "backlog").map((t) => t.id);
  const backlogIds = unfinished.filter((t) => dest.get(t.id) === "backlog").map((t) => t.id);
  const needsTarget = releaseIds.length > 0;

  const run = async (carryTarget: CarryTarget | null) => {
    setBusy(true);
    try {
      const summary = await closeSprint({
        sprint,
        tasks,
        releaseTaskIds: releaseIds,
        backlogTaskIds: backlogIds,
        target: carryTarget,
        users,
        appTypes,
        actorId: actor.uid,
      });
      toast.success(`${sprint.name} closed`, { description: summary, duration: 8000 });
      onOpenChange(false);
    } catch (err) {
      notifyError(err, "Couldn't close release");
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    if (!needsTarget) return run(null);
    if (target === NEW) {
      await newSprintForm.handleSubmit((input) => run({ kind: "new", input }))();
    } else {
      await run({ kind: "existing", sprintId: target });
    }
  };

  const doneCount = tasks.length - unfinished.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Close {sprint.name}</DialogTitle>
          <DialogDescription>
            {doneCount} of {tasks.length} tasks are released, cancelled or duplicate and stay here. Every other task goes
            either to the next release or to the Backlog; &ldquo;Ready to Release&rdquo; tasks always go to a release.
            Status, comments, pictures and history move with them.
          </DialogDescription>
        </DialogHeader>

        {unfinished.length === 0 ? (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            Every task is released, cancelled or duplicate. Nothing to move.
          </p>
        ) : (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Send all:</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setAll("release")}>
                <ArrowRight /> To the next release
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setAll("backlog")} disabled={!backlog}>
                <Inbox /> To the Backlog
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                {releaseIds.length} to next release · {backlogIds.length} to Backlog
              </span>
            </div>
            {!backlog && (
              <p className="text-xs text-muted-foreground">
                The Backlog isn&rsquo;t set up yet, so everything goes to the next release. An admin can set it up on the
                Backlog page.
              </p>
            )}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[44rem] table-fixed text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="w-56 p-2 text-left font-medium">Goes to</th>
                    <th className="p-2 text-left font-medium">Task</th>
                    <th className="w-28 p-2 text-left font-medium">App</th>
                    <th className="w-36 p-2 text-left font-medium">Assignee</th>
                    <th className="w-28 p-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {unfinished.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="p-2 align-top">
                        <DestinationToggle
                          taskKey={t.taskKey}
                          value={dest.get(t.id) ?? "release"}
                          onChange={(d) => setOne(t.id, d)}
                          backlogDisabled={!backlog || !canGoToBacklog(t.status)}
                          backlogHint={
                            !canGoToBacklog(t.status)
                              ? "Ready to Release tasks go to a release"
                              : !backlog
                                ? "The Backlog isn't set up yet"
                                : undefined
                          }
                        />
                      </td>
                      <td className="p-2 align-top">
                        <div className="font-mono text-xs whitespace-nowrap text-muted-foreground">{t.taskKey}</div>
                        <div className="break-words whitespace-normal">{t.title}</div>
                      </td>
                      <td className="p-2 align-top">
                        <AppTypeBadge appType={appTypeById.get(t.appTypeId)} />
                      </td>
                      <td className="p-2 align-top">
                        <AssigneeStack ids={t.assigneeIds} max={2} />
                      </td>
                      <td className="p-2 align-top">
                        <StatusBadge status={t.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {needsTarget && (
          <div className="grid gap-3 rounded-lg border p-3">
            <div className="grid gap-1.5">
              <Label>
                Next release for {releaseIds.length} task{releaseIds.length === 1 ? "" : "s"}
              </Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="w-full sm:w-80" aria-label="Next release">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {planned.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.startDate} → {s.endDate})
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW}>+ Create a new release</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {target === NEW && <SprintFields form={newSprintForm} idPrefix="cs" />}
          </div>
        )}

        <p className="text-xs text-muted-foreground">A read-only report is saved when the release closes.</p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void onConfirm()} disabled={busy}>
            {busy ? "Closing…" : "Close release"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
