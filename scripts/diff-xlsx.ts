/**
 * Read-only: compares a newer copy of the Excel bug list with the one that was imported, and
 * with the live tasks those rows became. Prints new rows, changed rows and conflicts.
 *
 *   npx tsx scripts/diff-xlsx.ts "import/<old>.xlsx" "<new>.xlsx" [--json out.json]
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import fs from "node:fs";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../lib/firebase/admin-core";
import { cellText } from "./inspect-xlsx";

export interface XRow {
  sheet: string;
  excelId: string;
  rowNumber: number;
  hidden: boolean;
  cells: Record<string, string>;
  dates: Record<string, string | null>;
}

export function readSheet(ws: ExcelJS.Worksheet): XRow[] {
  let headerRow = 0;
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (headerRow) return;
    for (let c = 1; c <= ws.columnCount; c++) {
      if (/description/i.test(cellText(row.getCell(c).value))) headerRow = n;
    }
  });
  if (!headerRow) return [];
  const header: string[] = [];
  for (let c = 1; c <= ws.columnCount; c++) header[c] = cellText(ws.getRow(headerRow).getCell(c).value).toLowerCase();
  const out: XRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n <= headerRow) return;
    const cells: Record<string, string> = {};
    const dates: Record<string, string | null> = {};
    for (let c = 1; c <= ws.columnCount; c++) {
      const key = header[c] || `col${c}`;
      const v = row.getCell(c).value;
      cells[key] = cellText(v);
      if (v instanceof Date) dates[key] = format(v, "yyyy-MM-dd");
    }
    out.push({ sheet: ws.name, excelId: cells["id"] ?? "", rowNumber: n, hidden: !!row.hidden, cells, dates });
  });
  return out;
}

export const pick = (r: XRow, re: RegExp) => Object.entries(r.cells).find(([k]) => re.test(k))?.[1] ?? "";
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export async function readBook(file: string): Promise<XRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb.worksheets.flatMap(readSheet).filter((r) => pick(r, /description/));
}

export const FIELDS: [string, RegExp][] = [
  ["type", /^type$/],
  ["description", /description/],
  ["app", /^app|^application/],
  ["owner", /^owner|^assignee/],
  ["status", /^status$/],
  ["priority", /^priority/],
  ["remarks", /^remarks?/],
  ["backend", /^backend/],
  ["android", /^android/],
  ["ios", /^ios/],
];

export interface RowChange {
  row: XRow;
  old: XRow;
  /** [field, old value, new value] */
  diffs: [string, string, string][];
}

/** Matches new rows to old ones (same sheet + description, else same sheet + unique ID). */
export function diffRows(oldRows: XRow[], newRows: XRow[]) {
  const used = new Set<XRow>();
  const findOld = (r: XRow) => {
    const desc = norm(pick(r, /description/));
    const sameSheet = oldRows.filter((o) => o.sheet === r.sheet && !used.has(o));
    const byDesc = sameSheet.filter((o) => norm(pick(o, /description/)) === desc);
    if (byDesc.length) return byDesc.find((o) => o.excelId === r.excelId) ?? byDesc[0];
    const byId = sameSheet.filter((o) => o.excelId && o.excelId === r.excelId);
    return byId.length === 1 ? byId[0] : undefined;
  };
  const target = (r: XRow) => Object.entries(r.dates).filter(([k]) => /target/.test(k)).map(([, v]) => v).join();

  const added: XRow[] = [];
  const matched: RowChange[] = [];
  for (const r of newRows) {
    const o = findOld(r);
    if (!o) {
      added.push(r);
      continue;
    }
    used.add(o);
    const diffs = FIELDS.map(([name, re]) => [name, pick(o, re), pick(r, re)] as [string, string, string]).filter(
      ([, a, b]) => norm(a) !== norm(b),
    );
    if (target(o) !== target(r)) diffs.push(["target date", target(o), target(r)]);
    matched.push({ row: r, old: o, diffs });
  }
  return { matched, added, removed: oldRows.filter((o) => !used.has(o)) };
}

/** Live tasks created by the Excel import, keyed "<sheet>|<row number>" from their description footer. */
export const FOOTER_RE = /Imported from Excel: sheet "([^"]+)"(?:, ID ([^ ]*))? \(row (\d+)\)\./;

async function main() {
  const [oldFile, newFile, ...flags] = process.argv.slice(2);
  if (!oldFile || !newFile) throw new Error('Usage: npx tsx scripts/diff-xlsx.ts "old.xlsx" "new.xlsx"');
  const jsonAt = flags.indexOf("--json");

  const [oldRows, newRows] = await Promise.all([readBook(oldFile), readBook(newFile)]);

  // Live tasks by their import footer: sheet "X", ID n (row r)
  const db = getFirestore(getAdminApp());
  const live = new Map<string, { id: string; key: string; status: string; title: string; remarks: string; assigneeIds: string[]; priority: string; type: string }>();
  for (const d of (await db.collection("tasks").get()).docs) {
    const m = String(d.get("descriptionText") ?? "").match(FOOTER_RE);
    if (m) {
      live.set(`${m[1]}|${m[3]}`, {
        id: d.id,
        key: String(d.get("taskKey")),
        status: String(d.get("status")),
        title: String(d.get("title")),
        remarks: String(d.get("remarks") ?? ""),
        assigneeIds: (d.get("assigneeIds") as string[]) ?? [],
        priority: String(d.get("priority")),
        type: String(d.get("type")),
      });
    }
  }
  const users = new Map((await db.collection("users").get()).docs.map((d) => [d.id, String(d.get("name"))]));

  const { matched, added, removed } = diffRows(oldRows, newRows);
  const changed = matched.filter((m) => m.diffs.length).map((m) => ({ ...m, task: live.get(`${m.old.sheet}|${m.old.rowNumber}`) }));
  const same = matched.length - changed.length;

  console.log(`Old file: ${oldRows.length} rows · New file: ${newRows.length} rows`);
  console.log(`Unchanged: ${same} · Changed: ${changed.length} · New: ${added.length} · Missing from new file: ${removed.length}\n`);

  console.log("=== CHANGED ===");
  for (const c of changed) {
    const t = c.task;
    console.log(`${t?.key ?? "(no live task!)"}  [${c.row.sheet} #${c.row.excelId}]  ${pick(c.row, /description/).slice(0, 70)}`);
    if (t) console.log(`    live now: status=${t.status} assignees=${t.assigneeIds.map((i) => users.get(i)).join(", ") || "none"} remarks="${t.remarks.slice(0, 60)}"`);
    for (const [f, a, b] of c.diffs) console.log(`    ${f}: "${a.slice(0, 80)}" → "${b.slice(0, 80)}"`);
  }
  console.log("\n=== NEW ROWS ===");
  for (const r of added) {
    console.log(
      `[${r.sheet} #${r.excelId}]${r.hidden ? " (hidden)" : ""} type=${pick(r, /^type$/)} app=${pick(r, /^app|^application/)} owner=${pick(r, /^owner|^assignee/)} status=${pick(r, /^status$/)} prio=${pick(r, /^priority/)} remarks=${pick(r, /^remarks?/)}\n    ${pick(r, /description/).slice(0, 160)}`,
    );
  }
  console.log("\n=== IN OLD FILE BUT NOT IN NEW ===");
  for (const r of removed) console.log(`[${r.sheet} #${r.excelId}] ${pick(r, /description/).slice(0, 100)}  → ${live.get(`${r.sheet}|${r.rowNumber}`)?.key ?? "?"}`);

  if (jsonAt >= 0) fs.writeFileSync(flags[jsonAt + 1], JSON.stringify({ changed, added, removed }, null, 2));
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/diff-xlsx.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
