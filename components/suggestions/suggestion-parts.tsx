"use client";

/** Suggestion list card, detail view and the QA/Admin actions menu. */
import { useCallback, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowUpRight, Images, MoreHorizontal, RotateCcw, Trash2, Undo2, Rocket, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { useSuggestionImages } from "@/lib/hooks/use-suggestions";
import { deleteSuggestion, reopenSuggestion } from "@/lib/services/suggestions";
import { loadChunkedImage } from "@/lib/services/attachments";
import { attempt } from "@/lib/notify";
import { canDeleteSuggestion, canTriageSuggestions } from "@/lib/permissions";
import { displayStatus, statusSentence, SUGGESTION_KIND_META, SUGGESTION_STATUS_META } from "@/lib/suggestions";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/common/user-avatar";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Lightbox } from "@/components/tasks/lightbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Attachment, Suggestion, TaskStatus } from "@/types";

export function KindChip({ kind }: { kind: Suggestion["kind"] }) {
  const m = SUGGESTION_KIND_META[kind];
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
      <span aria-hidden>{m.emoji}</span> {m.label}
    </span>
  );
}

export function StatusPill({ s, taskStatus }: { s: Suggestion; taskStatus: TaskStatus | undefined }) {
  const d = displayStatus(s, taskStatus);
  return (
    <span className={cn("inline-flex max-w-full items-center rounded-md px-2 py-0.5 text-xs font-medium", SUGGESTION_STATUS_META[d].tone)}>
      <span className="truncate">{statusSentence(s, taskStatus)}</span>
    </span>
  );
}

function Byline({ s }: { s: Suggestion }) {
  const { userById } = useData();
  const author = userById.get(s.authorId);
  const when = s.createdAt?.toDate();
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      <UserAvatar id={s.authorId} initials={author?.initials ?? "?"} name={author?.name} size="xs" />
      <span className="truncate">
        <span className="text-foreground">{author?.name ?? "Unknown"}</span>
        {when && <span title={format(when, "d MMM yyyy, HH:mm")}> · {formatDistanceToNow(when, { addSuffix: true })}</span>}
      </span>
    </span>
  );
}

export interface SuggestionActions {
  addToRelease: (s: Suggestion) => void;
  notPlanned: (s: Suggestion) => void;
}

/** "…" menu for QA/Admin (nothing for others). */
export function SuggestionMenu({ s, actions, onDeleted }: { s: Suggestion; actions: SuggestionActions; onDeleted?: () => void }) {
  const { actor } = useCurrentUser();
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!canTriageSuggestions(actor)) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for "${s.title}"`} onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
          {s.status !== "added" && (
            <DropdownMenuItem onSelect={() => actions.addToRelease(s)}>
              <Rocket /> Add to a release…
            </DropdownMenuItem>
          )}
          {s.status === "new" && (
            <DropdownMenuItem onSelect={() => actions.notPlanned(s)}>
              <XCircle /> Mark as not planned…
            </DropdownMenuItem>
          )}
          {s.status === "not_planned" && (
            <DropdownMenuItem onSelect={() => void attempt(() => reopenSuggestion(s.id), "Couldn't update the suggestion", "Moved back to New")}>
              <RotateCcw /> Move back to New
            </DropdownMenuItem>
          )}
          {s.status === "added" && s.sprintId && s.taskKey && (
            <DropdownMenuItem asChild>
              <Link href={`/releases/${s.sprintId}?task=${s.taskKey}`}>
                <ArrowUpRight /> Open task {s.taskKey}
              </Link>
            </DropdownMenuItem>
          )}
          {canDeleteSuggestion(actor) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this suggestion?"
        description={
          s.taskKey
            ? `The suggestion and its pictures are removed for everyone. Task ${s.taskKey} stays in its release.`
            : "The suggestion and its pictures are removed for everyone. This can't be undone."
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          await deleteSuggestion(s.id);
          toast.success("Suggestion deleted");
          onDeleted?.();
        }}
      />
    </>
  );
}

export function SuggestionCard({
  s,
  taskStatus,
  actions,
  onOpen,
}: {
  s: Suggestion;
  taskStatus: TaskStatus | undefined;
  actions: SuggestionActions;
  onOpen: () => void;
}) {
  return (
    <li
      className="group flex cursor-pointer gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/40"
      onClick={onOpen}
      data-suggestion={s.id}
    >
      {s.coverThumb ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail
        <img src={s.coverThumb} alt="" className="size-20 shrink-0 rounded-lg border object-cover" />
      ) : (
        <div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-muted text-3xl" aria-hidden>
          {SUGGESTION_KIND_META[s.kind].emoji}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          {/* the click bubbles to the card, which opens it */}
          <button type="button" className="min-w-0 flex-1 text-left text-base leading-snug font-medium outline-none hover:underline focus-visible:underline">
            {s.title}
          </button>
          {/* menu + its dialogs live in portals, but React still bubbles their clicks to the card */}
          <div onClick={(e) => e.stopPropagation()}>
            <SuggestionMenu s={s} actions={actions} />
          </div>
        </div>
        {s.details && <p className="line-clamp-2 text-sm text-muted-foreground">{s.details}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
          <StatusPill s={s} taskStatus={taskStatus} />
          <KindChip kind={s.kind} />
          {s.imageCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Images className="size-3.5" aria-hidden /> {s.imageCount} picture{s.imageCount === 1 ? "" : "s"}
            </span>
          )}
          <Byline s={s} />
        </div>
      </div>
    </li>
  );
}

export function SuggestionDetail({
  s,
  taskStatus,
  actions,
  onClose,
}: {
  s: Suggestion | null;
  taskStatus: TaskStatus | undefined;
  actions: SuggestionActions;
  onClose: () => void;
}) {
  const images = useSuggestionImages(s?.id ?? null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const id = s?.id;
  const load = useCallback((a: Attachment) => loadChunkedImage(["suggestions", id ?? "", "images"], a), [id]);
  const { actor } = useCurrentUser();
  const staff = canTriageSuggestions(actor);

  return (
    <Dialog open={!!s} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        {s && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <KindChip kind={s.kind} />
                <StatusPill s={s} taskStatus={taskStatus} />
              </div>
              <DialogTitle className="pt-1 text-xl leading-snug">{s.title}</DialogTitle>
              <DialogDescription asChild>
                <div>
                  <Byline s={s} />
                </div>
              </DialogDescription>
            </DialogHeader>

            {s.details ? (
              <p className="text-base whitespace-pre-wrap">{s.details}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No extra details.</p>
            )}

            {s.imageCount > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium">Pictures</h3>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {images.data.map((a, i) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => setLightbox(i)}
                        className="block w-full overflow-hidden rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Open picture ${i + 1}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- data URL thumbnail */}
                        <img src={a.thumbDataUrl} alt={a.fileName} className="aspect-square w-full object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
                <Lightbox taskId={s.id} items={images.data} index={lightbox} onIndexChange={setLightbox} onClose={() => setLightbox(null)} load={load} />
              </div>
            )}

            {s.status === "not_planned" && s.declineReason && (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="font-medium">Why not planned:</span> {s.declineReason}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              {s.status === "added" && s.sprintId && s.taskKey && (
                <Button asChild variant="outline">
                  <Link href={`/releases/${s.sprintId}?task=${s.taskKey}`}>
                    <ArrowUpRight /> Open task {s.taskKey}
                  </Link>
                </Button>
              )}
              {staff && s.status !== "added" && (
                <Button onClick={() => actions.addToRelease(s)}>
                  <Rocket /> Add to a release
                </Button>
              )}
              {staff && s.status === "new" && (
                <Button variant="outline" onClick={() => actions.notPlanned(s)}>
                  <XCircle /> Not planned
                </Button>
              )}
              {staff && s.status === "not_planned" && (
                <Button variant="outline" onClick={() => void attempt(() => reopenSuggestion(s.id), "Couldn't update the suggestion", "Moved back to New")}>
                  <Undo2 /> Move back to New
                </Button>
              )}
              <div className="ml-auto">
                <SuggestionMenu s={s} actions={actions} onDeleted={onClose} />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
