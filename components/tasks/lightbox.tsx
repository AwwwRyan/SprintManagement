"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, X, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { loadAttachmentImage } from "@/lib/services/attachments";
import { notifyError } from "@/lib/notify";
import type { Attachment } from "@/types";

function download(dataUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}

export function Lightbox({
  taskId,
  items,
  index,
  onIndexChange,
  onClose,
}: {
  taskId: string;
  items: Attachment[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(false);
  const [full, setFull] = useState<{ id: string; src: string } | null>(null);
  const item = index !== null ? items[index] : undefined;
  const count = items.length;

  useEffect(() => setZoom(false), [index]);

  // Load the full-size image (from its Firestore chunks) for the current item.
  useEffect(() => {
    if (!item) return;
    let alive = true;
    loadAttachmentImage(taskId, item)
      .then((src) => alive && setFull({ id: item.id, src }))
      .catch((err) => notifyError(err, "Couldn't load image"));
    return () => {
      alive = false;
    };
  }, [taskId, item]);

  const src = item && full?.id === item.id ? full.src : null;
  const prev = () => index !== null && onIndexChange((index - 1 + count) % count);
  const next = () => index !== null && onIndexChange((index + 1) % count);

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[90svh] w-[95vw] max-w-none flex-col gap-0 p-0 sm:max-w-[95vw]"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") prev();
          if (e.key === "ArrowRight") next();
        }}
      >
        {item && (
          <>
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium">{item.fileName}</DialogTitle>
              <DialogDescription className="sr-only">
                Image {index! + 1} of {count}
              </DialogDescription>
              <span className="text-xs text-muted-foreground tabular-nums">
                {index! + 1} / {count}
              </span>
              <Button variant="ghost" size="icon-sm" onClick={() => setZoom((z) => !z)} aria-label={zoom ? "Zoom out" : "Zoom in"}>
                {zoom ? <ZoomOut /> : <ZoomIn />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => src && download(src, item.fileName)}
                disabled={!src}
                aria-label="Download"
              >
                <Download />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
                <X />
              </Button>
            </div>
            <div className="relative min-h-0 flex-1 overflow-auto bg-black/90">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src ?? item.thumbDataUrl}
                alt={item.fileName}
                onClick={() => setZoom((z) => !z)}
                className={
                  zoom
                    ? "max-w-none cursor-zoom-out"
                    : "absolute inset-0 m-auto max-h-full max-w-full cursor-zoom-in object-contain"
                }
                style={src ? undefined : { filter: "blur(6px)", width: "min(100%, 960px)" }}
              />
              {!src && (
                <div className="absolute inset-0 flex items-center justify-center" role="status">
                  <Loader2 className="size-6 animate-spin text-white/80" />
                  <span className="sr-only">Loading full image</span>
                </div>
              )}
              {count > 1 && (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full opacity-80"
                    onClick={prev}
                    aria-label="Previous image"
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full opacity-80"
                    onClick={next}
                    aria-label="Next image"
                  >
                    <ChevronRight />
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
