/**
 * Read-only overview of an Excel workbook before importing it: every sheet (including
 * hidden ones), row counts, the detected header row, and distinct values of short columns.
 *
 *   npx tsx scripts/inspect-xlsx.ts "import/<file>.xlsx"
 */
import ExcelJS from "exceljs";

export function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text; // hyperlink
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue); // formula
    if ("error" in v) return "";
    return JSON.stringify(v);
  }
  return String(v).trim();
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: npx tsx scripts/inspect-xlsx.ts "import/file.xlsx"');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  for (const ws of wb.worksheets) {
    const rows: string[][] = [];
    let hiddenRows = 0;
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (row.hidden) hiddenRows++;
      const vals: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) vals.push(cellText(row.getCell(c).value));
      if (vals.some((x) => x !== "")) rows.push(vals);
    });
    console.log(`\n=== Sheet "${ws.name}" ${ws.state !== "visible" ? `(${ws.state})` : ""}`);
    console.log(`rows with data: ${rows.length}, columns: ${ws.columnCount}, hidden rows: ${hiddenRows}, merged ranges: ${Object.keys((ws as unknown as { _merges: object })._merges ?? {}).length}`);
    if (rows.length === 0) continue;

    // header = first row with >= 2 non-empty cells
    const headerIdx = rows.findIndex((r) => r.filter(Boolean).length >= 2);
    const header = rows[headerIdx] ?? [];
    console.log(`header (row #${headerIdx + 1} of data rows):`);
    const body = rows.slice(headerIdx + 1);
    header.forEach((h, i) => {
      const values = body.map((r) => r[i] ?? "").filter(Boolean);
      const distinct = Array.from(new Set(values));
      const maxLen = Math.max(0, ...values.map((v) => v.length));
      const summary =
        distinct.length > 0 && distinct.length <= 15 && maxLen <= 40
          ? `values: ${distinct.map((d) => JSON.stringify(d)).join(", ")}`
          : `${values.length} filled, ${distinct.length} distinct, longest ${maxLen} chars, e.g. ${JSON.stringify((values[0] ?? "").slice(0, 70))}`;
      console.log(`  [${i + 1}] ${JSON.stringify(h)} -> ${summary}`);
    });
    if (headerIdx > 0) console.log(`  rows above header: ${rows.slice(0, headerIdx).map((r) => JSON.stringify(r.filter(Boolean).join(" | ").slice(0, 80))).join("; ")}`);
  }
}

// Only run when executed directly (the importer imports cellText from this file).
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/inspect-xlsx.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
