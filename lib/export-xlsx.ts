"use client";

/**
 * Turns a RangeReport into a multi-sheet .xlsx and downloads it. exceljs (~1 MB) is loaded
 * on demand, so it never weighs down normal page loads.
 */
import type { RangeReport } from "@/lib/range-report";

type Rows = Record<string, string | number>[];

export function reportFileName(r: RangeReport, appName: string | null): string {
  const app = appName ? `_${appName.replace(/[^\w-]+/g, "-")}` : "";
  return `Sprint-report${app}_${r.from}_to_${r.to}.xlsx`;
}

export async function downloadRangeReport(r: RangeReport, fileName: string): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sprint Task Manager";
  wb.created = new Date();

  const header = (ws: import("exceljs").Worksheet) => {
    const row = ws.getRow(1);
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2A78D6" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  // Summary
  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Metric", key: "label", width: 38 },
    { header: "Value", key: "value", width: 30 },
  ];
  r.summary.forEach((s) => summary.addRow(s));
  header(summary);
  summary.addRow({});
  summary.addRow({ label: "Note", value: "Completed = status changed to Done within the period (from the activity log)." });

  const table = (name: string, rows: Rows, empty: string) => {
    const ws = wb.addWorksheet(name);
    if (rows.length === 0) {
      ws.columns = [{ header: name, key: "x", width: 60 }];
      ws.addRow({ x: empty });
      header(ws);
      return;
    }
    const keys = Object.keys(rows[0]);
    ws.columns = keys.map((k) => ({
      header: k,
      key: k,
      width: k === "Title" ? 60 : Math.min(40, Math.max(12, k.length + 2, ...rows.slice(0, 200).map((x) => String(x[k] ?? "").length + 2))),
    }));
    rows.forEach((x) => ws.addRow(x));
    header(ws);
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: keys.length } };
  };

  table("Completed", r.completed, "No tasks were completed in this period.");
  table("Created", r.created, "No tasks were created in this period.");
  table("Open now", r.openNow, "No open tasks.");
  table("By person", r.byPerson, "No data.");
  table("By app", r.byApp, "No data.");

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
