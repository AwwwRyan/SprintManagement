"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useAttachments } from "@/lib/hooks/use-tasks";
import { canDeleteAttachment, canUploadAttachment } from "@/lib/permissions";
import {
  AttachmentError,
  deleteAttachment,
  uploadAttachment,
  validateAttachmentFiles,
  type UploadHandle,
} from "@/lib/services/attachments";
import { notifyError } from "@/lib/notify";
import { ATTACHMENT_MAX_PER_TASK } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Lightbox } from "./lightbox";
import type { Attachment, Sprint, Task } from "@/types";

interface UploadItem {
  key: string;
  name: string;
  progress: number;
  handle: UploadHandle;
}

export function AttachmentsSection({ task, sprint }: { task: Task; sprint: Sprint | undefined }) {
  const { actor } = useCurrentUser();
  const { data: attachments, loading } = useAttachments(task.id);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<Attachment | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canUpload = canUploadAttachment(actor, task, sprint);
  const highlight = task.type === "bug" || task.type === "improvement";

  const startUploads = useCallback(
    (files: File[]) => {
      if (!canUpload) return;
      const { accepted, errors } = validateAttachmentFiles(files, attachments.length + uploads.length);
      errors.forEach((e) => toast.error(e));
      for (const file of accepted) {
        const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const handle = uploadAttachment(task.id, file, actor.uid, (p) =>
          setUploads((list) => list.map((u) => (u.key === key ? { ...u, progress: p } : u))),
        );
        setUploads((list) => [...list, { key, name: file.name || "pasted image", progress: 0, handle }]);
        handle.done
          .catch((err) => {
            if (err instanceof AttachmentError) {
              if (err.message !== "Upload cancelled") toast.error(err.message);
            } else notifyError(err, `Upload failed (${file.name})`);
          })
          .finally(() => setUploads((list) => list.filter((u) => u.key !== key)));
      }
    },
    [actor.uid, attachments.length, canUpload, task.id, uploads.length],
  );

  // Paste screenshots from the clipboard while the panel is open.
  useEffect(() => {
    if (!canUpload) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) return;
      e.preventDefault();
      startUploads(files.map((f, i) => (f.name ? f : new File([f], `pasted-${Date.now()}-${i}.png`, { type: f.type }))));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [canUpload, startUploads]);

  const full = attachments.length + uploads.length >= ATTACHMENT_MAX_PER_TASK;

  return (
    <section id="attachments" aria-labelledby="attachments-heading" className="scroll-mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 id="attachments-heading" className="text-sm font-medium">
          Attachments <span className="text-muted-foreground">({attachments.length}/{ATTACHMENT_MAX_PER_TASK})</span>
        </h3>
      </div>

      {canUpload && !full && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            startUploads(Array.from(e.dataTransfer.files));
          }}
          className={cn(
            "mb-3 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-4 text-center text-sm transition-colors",
            dragging ? "border-primary bg-primary/5" : highlight ? "border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20" : "border-muted",
          )}
        >
          <ImagePlus className="size-5 text-muted-foreground" />
          <div>
            {highlight ? "Add screenshots: " : ""}
            <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => inputRef.current?.click()}>
              choose files
            </button>
            , drag &amp; drop, or paste (Ctrl/Cmd+V)
          </div>
          <div className="text-xs text-muted-foreground">PNG, JPG, WEBP, GIF · up to 10 MB each (compressed automatically)</div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={(e) => {
              startUploads(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>
      )}

      {uploads.length > 0 && (
        <ul className="mb-3 grid gap-2" aria-label="Uploads in progress">
          {uploads.map((u) => (
            <li key={u.key} className="flex items-center gap-2 text-xs">
              <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
              <span className="w-32 truncate">{u.name}</span>
              <Progress value={Math.round(u.progress * 100)} className="h-1.5 flex-1" />
              <span className="w-8 text-right tabular-nums">{Math.round(u.progress * 100)}%</span>
              <Button variant="ghost" size="icon-xs" onClick={() => u.handle.cancel()} aria-label={`Cancel upload of ${u.name}`}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {loading ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: Math.min(task.attachmentCount, 4) }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      ) : attachments.length === 0 ? (
        !canUpload && <p className="text-sm text-muted-foreground">No attachments.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {attachments.map((a, i) => (
            <li key={a.id} className="group relative">
              <button
                type="button"
                onClick={() => setLightbox(i)}
                className="block aspect-square w-full overflow-hidden rounded-md border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Open ${a.fileName}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.thumbDataUrl} alt={a.fileName} className="size-full object-cover" />
              </button>
              {canDeleteAttachment(actor, task, sprint, a) && (
                <Button
                  variant="secondary"
                  size="icon-xs"
                  className="absolute top-1 right-1 opacity-0 shadow group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => setToDelete(a)}
                  aria-label={`Delete ${a.fileName}`}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Lightbox taskId={task.id} items={attachments} index={lightbox} onIndexChange={setLightbox} onClose={() => setLightbox(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete attachment?"
        description={toDelete ? `"${toDelete.fileName}" will be permanently removed.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!toDelete) return;
          await deleteAttachment(task.id, toDelete, actor.uid).catch((err) => notifyError(err, "Couldn't delete"));
        }}
      />
    </section>
  );
}
