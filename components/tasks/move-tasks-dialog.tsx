"use client";

/** QA/Admin: move one or more tasks to another open release or to the Backlog. */
import { useEffect, useMemo, useState } from "react";
import { Inbox, Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { moveTasks } from "@/lib/services/sprints";
import { canGoToBacklog } from "@/lib/move-plan";
import { notifyError } from "@/lib/notify";
import { sortSprints } from "@/lib/sprint-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SprintStatusBadge } from "@/components/common/badges";
import { BACKLOG_ID, type Task } from "@/types";

export function MoveTasksDialog({ tasks, onClose, onMoved }: { tasks: Task[] | null; onClose: () => void; onMoved?: () => void }) {
  const { actor } = useCurrentUser();
  const { sprints, backlog, sprintById } = useData();
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setTarget(null), [tasks]);

  const list = tasks ?? [];
  const from = new Set(list.map((t) => t.sprintId));
  const onlyFrom = from.size === 1 ? [...from][0] : null;
  // Open releases (active first), plus the Backlog; not the place they all already are.
  const options = useMemo(
    () => [
      ...(backlog && onlyFrom !== BACKLOG_ID ? [backlog] : []),
      ...sortSprints(sprints.filter((s) => s.status !== "closed" && s.id !== onlyFrom)),
    ],
    [sprints, backlog, onlyFrom],
  );
  const blockedForBacklog = list.filter((t) => !canGoToBacklog(t.status)).length;
  const movable = target === BACKLOG_ID ? list.length - blockedForBacklog : list.length;

  const submit = async () => {
    const dest = target ? sprintById.get(target) : undefined;
    if (!dest || !tasks) return;
    setBusy(true);
    try {
      const names = new Map([...sprintById.values()].map((s) => [s.id, s.name]));
      const skipped = await moveTasks(tasks, dest, names, actor.uid);
      const moved = tasks.length - skipped.length;
      toast.success(`Moved ${moved} task${moved === 1 ? "" : "s"} to ${dest.name}`, {
        description: skipped.length ? `Not moved: ${skipped.map((s) => `${s.taskKey} (${s.reason})`).join(", ")}` : undefined,
        duration: skipped.length ? 8000 : 4000,
      });
      onMoved?.();
      onClose();
    } catch (err) {
      notifyError(err, "Couldn't move the tasks");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!tasks} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Move {list.length === 1 ? list[0].taskKey : `${list.length} tasks`} to…
          </DialogTitle>
          <DialogDescription>
            The task number, comments, pictures and history move with {list.length === 1 ? "it" : "them"}.
          </DialogDescription>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">There is no other open release{backlog ? "" : " and the Backlog isn't set up yet"}.</p>
        ) : (
          <div className="grid gap-2" role="radiogroup" aria-label="Move to">
            {options.map((s) => {
              const isBacklog = s.id === BACKLOG_ID;
              const disabled = isBacklog && blockedForBacklog === list.length;
              const on = target === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => setTarget(s.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                    on ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                  )}
                >
                  {isBacklog ? <Inbox className="size-5 text-amber-600" /> : <Rocket className="size-5 text-muted-foreground" />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{s.name}</span>
                    {isBacklog && (
                      <span className="block text-xs text-muted-foreground">
                        {disabled ? "Ready to Release and Released tasks can't go to the Backlog" : "Not planned into a release yet"}
                      </span>
                    )}
                  </span>
                  {!isBacklog && <SprintStatusBadge status={s.status} />}
                </button>
              );
            })}
          </div>
        )}

        {target === BACKLOG_ID && blockedForBacklog > 0 && blockedForBacklog < list.length && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {blockedForBacklog} Ready to Release / Released task{blockedForBacklog === 1 ? "" : "s"} will stay where{" "}
            {blockedForBacklog === 1 ? "it is" : "they are"}.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !target || movable === 0}>
            {busy ? (
              <>
                <Loader2 className="animate-spin" /> Moving…
              </>
            ) : (
              `Move ${movable} task${movable === 1 ? "" : "s"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
