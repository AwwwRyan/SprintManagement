"use client";

import { useEffect, useMemo } from "react";
import { Download } from "lucide-react";
import { saveBlob } from "@/lib/export-pdf";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Shows the generated dashboard PDF before it's saved. */
export function PdfPreviewDialog({ pdf, fileName, onClose }: { pdf: Blob | null; fileName: string; onClose: () => void }) {
  const url = useMemo(() => (pdf ? URL.createObjectURL(pdf) : null), [pdf]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  return (
    <Dialog open={pdf !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[90vh] flex-col gap-3 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>PDF preview</DialogTitle>
          <DialogDescription>{fileName}</DialogDescription>
        </DialogHeader>
        {url && <iframe src={url} title="PDF preview" className="min-h-0 w-full flex-1 rounded-md border bg-muted" />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={() => {
              if (pdf) saveBlob(pdf, fileName);
              onClose();
            }}
          >
            <Download /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
