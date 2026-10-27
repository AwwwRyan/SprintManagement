"use client";

/** QA/Admin: add a suggestion to a release (creates a task), or mark it not planned. */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { addSuggestionToRelease, markSuggestionNotPlanned } from "@/lib/services/suggestions";
import { notifyError } from "@/lib/notify";
import { categoryForKind } from "@/lib/suggestions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/common/field";
import { PropSelect } from "@/components/tasks/property-controls";
import { appTypeOptions, environmentOptions, priorityOptions, typeOptions } from "@/components/tasks/options";
import { PRODUCTION, requiresEnvironment } from "@/lib/task-model";
import type { Priority, Suggestion, TaskType } from "@/types";

const LAST_APP_TYPE_KEY = "stm.lastAppTypeId";

export function AddToReleaseDialog({ suggestion: s, onClose }: { suggestion: Suggestion | null; onClose: () => void }) {
  const { actor } = useCurrentUser();
  const { sprints, appTypes, userById, backlog } = useData();
  const router = useRouter();
  const releases = useMemo(
    () =>
      sprints
        .filter((r) => r.status !== "closed")
        .sort((a, b) => (a.status === b.status ? a.startDate.localeCompare(b.startDate) : a.status === "active" ? -1 : 1))
        // accepted but not scheduled yet
        .concat(backlog ? [backlog] : []),
    [sprints, backlog],
  );
  const [sprintId, setSprintId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("improvement");
  const [appTypeId, setAppTypeId] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>("medium");
  const [environment, setEnvironment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!s) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_APP_TYPE_KEY);
    } catch {
      /* storage unavailable */
    }
    const active = appTypes.filter((a) => a.active);
    setSprintId(releases[0]?.id ?? null);
    setTitle(s.title);
    setType(categoryForKind(s.kind));
    setAppTypeId(active.find((a) => a.id === last)?.id ?? active[0]?.id ?? null);
    setPriority("medium");
    setEnvironment("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when a new suggestion opens
  }, [s?.id]);

  const sprint = releases.find((r) => r.id === sprintId);
  const missingEnvironment = requiresEnvironment(type) && !environment;
  const submit = async () => {
    if (!s || !sprint || !appTypeId || !title.trim()) return;
    setSaving(true);
    try {
      const author = userById.get(s.authorId)?.name ?? "a team member";
      const when = s.createdAt ? format(s.createdAt.toDate(), "d MMM yyyy") : "an earlier date";
      const { taskKey, failedImages } = await addSuggestionToRelease(s, { sprint, title: title.trim(), type, appTypeId, priority, environment }, author, when, actor.uid);
      toast.success(`Added to ${sprint.name} as ${taskKey}`, {
        description: failedImages ? `${failedImages} picture(s) couldn't be copied to the task.` : undefined,
        action: { label: "Open task", onClick: () => router.push(`/releases/${sprint.id}?task=${taskKey}`) },
      });
      onClose();
    } catch (err) {
      notifyError(err, "Couldn't add it to the release");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!s} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to a release</DialogTitle>
          <DialogDescription>
            Creates a task in the release you choose, with the suggestion&rsquo;s details and pictures. The suggestion then shows its
            progress.
          </DialogDescription>
        </DialogHeader>
        {releases.length === 0 ? (
          <p className="text-sm text-muted-foreground">There is no open release. Create or start one under Releases first.</p>
        ) : (
          <div className="grid gap-4">
            <Field label="Which release should this go into?">
              <PropSelect
                label="Release"
                value={sprintId}
                options={releases.map((r) => ({
                  value: r.id,
                  label: r.status === "backlog" ? "Backlog (not planned into a release yet)" : `${r.name}${r.status === "active" ? " (active)" : " (planned)"}`,
                }))}
                onChange={setSprintId}
              />
            </Field>
            <Field label="Task" htmlFor="atr-title">
              <Input id="atr-title" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            {/* App Type names are long ("DOCTOR Doctor App"), so it gets its own row */}
            <Field label="App Type">
              <PropSelect label="App Type" value={appTypeId} options={appTypeOptions(appTypes)} onChange={setAppTypeId} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category">
                <PropSelect label="Category" value={type} options={typeOptions} onChange={(v) => v && setType(v as TaskType)} />
              </Field>
              <Field label="Priority">
                <PropSelect label="Priority" value={priority} options={priorityOptions} onChange={(v) => v && setPriority(v as Priority)} />
              </Field>
            </div>
            <Field
              label={requiresEnvironment(type) ? "Environment (required for bugs)" : "Environment"}
              error={missingEnvironment ? "Choose where the bug was found" : undefined}
            >
              <PropSelect
                label="Environment"
                value={environment || null}
                options={environmentOptions()}
                onChange={(v) => {
                  setEnvironment(v ?? "");
                  if (v === PRODUCTION) setPriority("critical"); // Production issues are Critical by default
                }}
                allowNone={!requiresEnvironment(type)}
              />
            </Field>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !sprint || !appTypeId || !title.trim() || missingEnvironment}>
            {saving ? (
              <>
                <Loader2 className="animate-spin" /> Adding…
              </>
            ) : (
              "Add to release"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NotPlannedDialog({ suggestion: s, onClose }: { suggestion: Suggestion | null; onClose: () => void }) {
  const { actor } = useCurrentUser();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setReason(""), [s?.id]);

  const submit = async () => {
    if (!s) return;
    setSaving(true);
    try {
      await markSuggestionNotPlanned(s.id, reason, actor.uid);
      toast.success("Marked as not planned");
      onClose();
    } catch (err) {
      notifyError(err, "Couldn't update the suggestion");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!s} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as not planned</DialogTitle>
          <DialogDescription>The person who suggested it will see this, with your reason if you add one.</DialogDescription>
        </DialogHeader>
        <Field label="Reason (optional)" htmlFor="np-reason">
          <Textarea
            id="np-reason"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: Already possible from the Columns menu"
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Mark as not planned"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
