"use client";

import { useRef, useState } from "react";
import { elementToPdf } from "@/lib/export-pdf";
import { notifyError } from "@/lib/notify";

/**
 * "Export PDF" with a preview: `start()` sets `exporting`, which renders the report off-screen
 * (into `ref`); once its charts have laid out it's captured, and the preview opens.
 */
export function usePdfExport() {
  const ref = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<{ pdf: Blob; fileName: string } | null>(null);

  const start = async (fileName: string) => {
    setExporting(true);
    try {
      const started = Date.now();
      while (!ref.current && Date.now() - started < 5000) await new Promise((r) => requestAnimationFrame(r));
      if (!ref.current) throw new Error("The report didn't render");
      await new Promise((r) => setTimeout(r, 600)); // charts measure their container first
      setPreview({ pdf: await elementToPdf(ref.current), fileName });
    } catch (err) {
      notifyError(err, "Couldn't create the PDF");
    } finally {
      setExporting(false);
    }
  };

  return { ref, exporting, preview, start, closePreview: () => setPreview(null) };
}
