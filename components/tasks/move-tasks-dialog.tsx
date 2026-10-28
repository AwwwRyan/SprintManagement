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
import { ReleaseChip, SprintStatusBadge, StatusBadge } from "@/components/common/badges";
import { Checkbox } from "@/components/ui/checkbox";
import { BACKLOG_ID, type Task } from "@/types";

export function MoveTasksDialog({ tasks, onClose, onMoved }: { tasks: Task[] | null; onClose: () => void; onMoved?: () => void }) {
  const { actor } = useCurrentUser();
  const { sprints, backlog, sprintById } = useData();
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Unticked tasks stay in the list (greyed out) and simply aren't moved.
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  useEffect(() => {
    setTarget(null);
    setUnticked(new Set());
  }, [tasks]);
  const toggle = (id: string, on: boolean) =>
    setUnticked((u) => {
      const next = new Set(u);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });

  const list = tasks ?? [];
  const chosen = list.filter((t) => !unticked.has(t.id));
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
  const blockedForBacklog = chosen.filter((t) => !canGoToBacklog(t.status)).length;
  const movable = target === BACKLOG_ID ? chosen.length - blockedForBacklog : chosen.length;

  const submit = async () => {
    const dest = target ? sprintById.get(target) : undefined;
    if (!dest || chosen.length === 0) return;
    setBusy(true);
    try {
      const names = new Map([...sprintById.values()].map((s) => [s.id, s.name]));
      const skipped = await moveTasks(chosen, dest, names, actor.uid);
      const moved = chosen.length - skipped.length;
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
      <DialogContent className="max-h-[92svh] overflow-x-hidden overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Move {list.length === 1 ? list[0].taskKey : `${list.length} tasks`} to…
          </DialogTitle>
          <DialogDescription>
            The task number, comments, pictures and history move with {list.length === 1 ? "it" : "them"}.
          </DialogDescription>
        </DialogHeader>

        {/* what's being moved, at a glance (min-w-0: long titles wrap instead of widening the dialog) */}
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>
              Selected task{list.length === 1 ? "" : "s"}: {chosen.length} of {list.length} will move
            </span>
            {list.length > 1 && <span className="font-normal">Untick any you don&rsquo;t want to move</span>}
          </div>
          <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border text-sm" aria-label="Tasks to move">
            {[...list]
              .sort((a, b) => a.order - b.order)
              .map((t) => {
                const off = unticked.has(t.id);
                const stays = !off && target === BACKLOG_ID && !canGoToBacklog(t.status);
                return (
                  <li key={t.id} className={cn("flex items-start gap-2 px-2.5 py-1.5", (stays || off) && "opacity-60")}>
                    <Checkbox
                      className="mt-0.5"
                      checked={!off}
                      onCheckedChange={(v) => toggle(t.id, !!v)}
                      aria-label={`Move ${t.taskKey}`}
                      disabled={busy}
                    />
                    <span className="w-16 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">{t.taskKey}</span>
                    <span className={cn("min-w-0 flex-1 break-words whitespace-normal", off && "line-through")}>
                      {t.title}
                    </span>
                    <span className="flex max-w-[45%] shrink-0 flex-wrap items-center justify-end gap-1.5">
                      {from.size > 1 && <ReleaseChip sprint={sprintById.get(t.sprintId)} />}
                      <StatusBadge status={t.status} />
                      {off && <span className="text-xs font-medium text-muted-foreground">won&rsquo;t move</span>}
                      {stays && <span className="text-xs font-medium text-amber-700 dark:text-amber-300">stays</span>}
                    </span>
                  </li>
                );
              })}
          </ul>
        </div>

        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">There is no other open release{backlog ? "" : " and the Backlog isn't set up yet"}.</p>
        ) : (
          <div className="grid gap-2" role="radiogroup" aria-label="Move to">
            {options.map((s) => {
              const isBacklog = s.id === BACKLOG_ID;
              const disabled = isBacklog && chosen.length > 0 && blockedForBacklog === chosen.length;
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

        {target === BACKLOG_ID && blockedForBacklog > 0 && blockedForBacklog < chosen.length && (
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
