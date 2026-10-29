"use client";

import { createContext, useContext } from "react";

/** True inside the PDF report: tables lay out in full (no scroll boxes) and lists show every item. */
export const ExportModeContext = createContext(false);
export const useExportMode = () => useContext(ExportModeContext);

/** A horizontal scroll box on screen; just the content in the PDF report. */
export function ScrollX({ children }: { children: React.ReactNode }) {
  return useExportMode() ? <>{children}</> : <div className="overflow-x-auto">{children}</div>;
}
