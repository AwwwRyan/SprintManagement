"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { closeSprint, type CarryTarget } from "@/lib/services/sprints";
import { sprintSchema, type SprintInput } from "@/lib/validation";
import { suggestSprintName } from "@/lib/sprint-utils";
import { notifyError } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { isFinished } from "@/lib/task-model";
import { defaultSprintInput, SprintFields } from "./sprint-form-dialog";
import type { Sprint, Task } from "@/types";

const NEW = "__new__";

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
  const { sprints, users, appTypes, appTypeById } = useData();
  const unfinished = useMemo(
    () => tasks.filter((t) => !isFinished(t.status)).sort((a, b) => a.order - b.order),
    [tasks],
  );
  const planned = sprints.filter((s) => s.status === "planned");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string>(NEW);
  const [busy, setBusy] = useState(false);
  const newSprintForm = useForm<SprintInput>({ resolver: zodResolver(sprintSchema), defaultValues: defaultSprintInput() });

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(unfinished.map((t) => t.id)));
    setTarget(planned[0]?.id ?? NEW);
    newSprintForm.reset(defaultSprintInput(suggestSprintName(sprints)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const allChecked = unfinished.length > 0 && selected.size === unfinished.length;
  const needsTarget = selected.size > 0;

  const run = async (carryTarget: CarryTarget | null) => {
    setBusy(true);
    try {
      const summary = await closeSprint({
        sprint,
        tasks,
        selectedTaskIds: Array.from(selected),
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
            {doneCount} of {tasks.length} tasks are released, closed or duplicate. &ldquo;Ready to Release&rdquo; tasks
            count as unfinished. Choose which unfinished tasks to carry into the next release.
            Their status, comments, attachments and history move with them.
          </DialogDescription>
        </DialogHeader>

        {unfinished.length === 0 ? (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            Every task is released, closed or duplicate. Nothing to carry forward.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[40rem] table-fixed text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 p-2 text-left">
                    <Checkbox
                      checked={allChecked ? true : selected.size > 0 ? "indeterminate" : false}
                      onCheckedChange={(v) => setSelected(v ? new Set(unfinished.map((t) => t.id)) : new Set())}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="p-2 text-left font-medium">Task</th>
                  <th className="w-40 p-2 text-left font-medium">App</th>
                  <th className="w-40 p-2 text-left font-medium">Assignee</th>
                  <th className="w-28 p-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {unfinished.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-2 align-top">
                      <Checkbox
                        checked={selected.has(t.id)}
                        onCheckedChange={(v) => toggle(t.id, !!v)}
                        aria-label={`Carry ${t.taskKey}`}
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
        )}

        {needsTarget && (
          <div className="grid gap-3 rounded-lg border p-3">
            <div className="grid gap-1.5">
              <Label>Carry {selected.size} task{selected.size === 1 ? "" : "s"} to</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="w-full sm:w-80">
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

        <p className="text-xs text-muted-foreground">
          A read-only report is saved when the sprint closes. Unselected unfinished tasks stay in {sprint.name} as
          incomplete.
        </p>

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
