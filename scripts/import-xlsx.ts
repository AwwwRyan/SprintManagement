/**
 * Imports the team's Excel bug list (one sheet per app) into a single sprint.
 *
 *   npx tsx scripts/import-xlsx.ts "import/<file>.xlsx" --as you@company.com            # preview, writes nothing
 *   npx tsx scripts/import-xlsx.ts "import/<file>.xlsx" --as you@company.com --apply    # import
 *
 * --as: the admin account recorded as reporter of the imported tasks and author of the note comments.
 *
 * Mapping decisions agreed with the team are in MAPPING below (see DECISIONS.md "Excel import").
 * Every row with a description is imported; nothing is dropped silently. Values that don't fit a
 * field (multiple owners, unknown people, cancelled, remarks, release status) are kept on the
 * task as a comment, in the environment field or in the description footer.
 * Writes with the Admin SDK: allocates TSK keys from counters/tasks in one transaction, then
 * batches tasks + "created" activity + comments.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import ExcelJS from "exceljs";
import { addDays, format } from "date-fns";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { emulatorsEnabled, getAdminApp } from "../lib/firebase/admin-core";
import { cellText } from "./inspect-xlsx";
import { chunk } from "../lib/utils";
import type { Priority, TaskStatus, TaskType } from "../types";

/* ------------------------------------------------------------------ mapping */

const MAPPING = {
  sprintName: "Release 1 (imported from Excel)",
  sprintGoal: "Everything from the Aug 2026 Excel bug list. Close it to carry unfinished tasks forward.",
  /** sheet name → App Type code (null: per-row "App"/"Application" column, or rowApp overrides) */
  sheetApp: {
    "Production issues": null,
    "Dr App": "DOCTOR",
    "Patient App": "USER",
    "Service Provider App": "SERVICE-PROVIDER",
    "Super Admin App": "SUPER-ADMIN",
    "QR code Portals": "QR-PORTAL",
    "Back log": null,
    "Old Defect List": null,
  } as Record<string, string | null>,
  /** values of an "App"/"Application" column → App Type code */
  appColumn: [
    [/^qr/i, "QR-PORTAL"],
    [/^(doc|doctor|da\b|da-)/i, "DOCTOR"],
    [/^(user|ua\b|ua-)/i, "USER"],
    [/^(super ?admin)/i, "SUPER-ADMIN"],
    [/^(sp\b|service)/i, "SERVICE-PROVIDER"],
  ] as [RegExp, string][],
  /** rows the sheets don't place in an app: "<sheet>#<ID>" → App Type code */
  rowApp: {
    "Back log#1": "SUPER-ADMIN",
    "Back log#2": "USER",
    "Back log#3": "USER",
    "Back log#4": "USER",
    "Back log#5": "SUPER-ADMIN",
    "Back log#6": "USER",
    "Back log#7": "SUPER-ADMIN",
    "Back log#8": "SUPER-ADMIN",
    "Back log#10": "SUPER-ADMIN",
    "Back log#11": "SUPER-ADMIN",
    "Back log#12": "SUPER-ADMIN",
    "Back log#13": "SUPER-ADMIN",
    "Back log#14": "SUPER-ADMIN",
    "Back log#15": "USER",
    "Back log#16": "SUPER-ADMIN",
    "Back log#17": "USER",
    "Back log#18": "USER",
    "Back log#19": "SUPER-ADMIN",
    "Back log#20": "SUPER-ADMIN",
    "Back log#21": "USER",
    "Old Defect List#58": "QR-PORTAL",
    "Old Defect List#59": "DOCTOR",
    "Old Defect List#60": "SERVICE-PROVIDER",
    "Old Defect List#79": "SUPER-ADMIN",
    "Old Defect List#81": "SUPER-ADMIN",
  } as Record<string, string>,
  /** fallback when nothing else matches (counted and reported) */
  defaultApp: "SUPER-ADMIN",
  /** sheets whose tasks are all production bugs: type Bug, priority Critical */
  criticalSheets: ["Production issues"],
  /** owner spellings → user display name (matched case-insensitively against users) */
  ownerAliases: {
    vani: "Sreevani",
    sreevani: "Sreevani",
    hari: "Hariharan",
    hariharan: "Hariharan",
    pritika: "Prithika",
    prithika: "Prithika",
    sameeh: "Sameeh",
    samee: "Sameeh",
    samme: "Sameeh",
    nagma: "Nagma",
    aryan: "Aryan Srivastava",
    sudharsan: "Sudharsan",
    mishal: "Mishal",
    nikita: "Nikita",
    ashis: "Ashis",
    asis: "Ashis",
  } as Record<string, string>,
};

function mapStatus(raw: string): { status: TaskStatus; note?: string } {
  const s = raw.trim().toLowerCase();
  if (!s || s === "open" || s === "pending") return { status: "todo" };
  if (s === "in progress") return { status: "in_progress" };
  if (s.startsWith("testing")) return { status: "qa_testing" };
  if (s === "hold") return { status: "blocked", note: "On hold in the Excel sheet." };
  if (s === "completed" || s === "done") return { status: "done" };
  if (s.startsWith("cancel")) return { status: "done", note: "Marked CANCELLED in the Excel sheet (imported as Done)." };
  return { status: "todo", note: `Unrecognised Excel status "${raw}", imported as To Do.` };
}

function mapType(raw: string): TaskType {
  const s = raw.trim().toLowerCase();
  if (s === "bug") return "bug";
  if (s === "enhancement" || s === "ui" || s === "change") return "enhancement";
  if (s === "new" || s === "request" || s === "requirement") return "requirement";
  return "task";
}

function mapPriority(raw: string): Priority | null {
  const s = raw.trim().toLowerCase();
  if (s === "1" || s === "high") return "high";
  if (s === "2" || s === "medium") return "medium";
  if (s === "3" || s === "low") return "low";
  if (s === "critical") return "critical";
  return null;
}

/* ------------------------------------------------------------------ parsing */

interface Row {
  sheet: string;
  excelId: string;
  rowNumber: number;
  cells: Record<string, string>;
  dates: Record<string, string | null>;
}

/** Finds the header row (the one containing "description") and reads every data row below it. */
function readSheet(ws: ExcelJS.Worksheet): Row[] {
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

  const out: Row[] = [];
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
    out.push({ sheet: ws.name, excelId: cells["id"] ?? "", rowNumber: n, cells, dates });
  });
  return out;
}

const pick = (r: Row, re: RegExp) => Object.entries(r.cells).find(([k]) => re.test(k))?.[1] ?? "";

function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 120) return oneLine;
  const cut = oneLine.slice(0, 117);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : 117)}…`;
}

function tiptapDoc(paragraphs: string[]): string {
  return JSON.stringify({
    type: "doc",
    content: paragraphs.map((p) => ({ type: "paragraph", content: p ? [{ type: "text", text: p }] : [] })),
  });
}

/* ------------------------------------------------------------------ main */

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  const asIdx = flags.indexOf("--as");
  const importerEmail = asIdx >= 0 ? flags[asIdx + 1] : undefined;
  if (!file || !importerEmail) throw new Error('Usage: npx tsx scripts/import-xlsx.ts "import/file.xlsx" --as you@company.com [--apply]');
  const apply = flags.includes("--apply");

  const app = getAdminApp();
  const db = getFirestore(app);
  const target = emulatorsEnabled() ? "LOCAL EMULATORS" : `project ${process.env.FIREBASE_ADMIN_PROJECT_ID}`;

  // Lookups from the live project
  const appTypes = (await db.collection("appTypes").get()).docs.map((d) => ({ id: d.id, code: String(d.get("code")), name: String(d.get("name")) }));
  const users = (await db.collection("users").get()).docs.map((d) => ({ id: d.id, name: String(d.get("name")) }));
  const appByCode = new Map(appTypes.map((a) => [a.code, a]));
  const userByName = new Map(users.map((u) => [u.name.toLowerCase(), u]));
  const importer = await getAuth(app).getUserByEmail(importerEmail);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);

  const problems: string[] = [];
  const stats = { rows: 0, skippedEmpty: 0, bySheet: {} as Record<string, number>, byApp: {} as Record<string, number>, byStatus: {} as Record<string, number>, byAssignee: {} as Record<string, number>, comments: 0, defaultApp: 0 };
  const plans: {
    row: Row;
    title: string;
    paragraphs: string[];
    appCode: string;
    type: TaskType;
    priority: Priority;
    status: TaskStatus;
    assigneeId: string | null;
    remarks: string;
    dueDate: string | null;
    notes: string[];
  }[] = [];

  for (const ws of wb.worksheets) {
    if (!(ws.name in MAPPING.sheetApp)) {
      problems.push(`Sheet "${ws.name}" has no mapping; ALL its rows would be skipped. Add it to MAPPING.sheetApp.`);
      continue;
    }
    for (const row of readSheet(ws)) {
      const desc = pick(row, /description/);
      if (!desc) {
        stats.skippedEmpty++;
        continue;
      }
      stats.rows++;
      stats.bySheet[ws.name] = (stats.bySheet[ws.name] ?? 0) + 1;
      const notes: string[] = [];

      // App Type
      const rowKey = `${ws.name}#${row.excelId}`;
      let appCode: string | null = MAPPING.rowApp[rowKey] ?? MAPPING.sheetApp[ws.name] ?? null;
      const appCell = pick(row, /^app|^application/);
      if (!appCode && appCell) appCode = MAPPING.appColumn.find(([re]) => re.test(appCell.trim()))?.[1] ?? null;
      if (appCell && /and doc/i.test(appCell)) notes.push(`Excel listed the app as "${appCell}".`);
      if (!appCode) {
        appCode = MAPPING.defaultApp;
        stats.defaultApp++;
        problems.push(`${rowKey}: no app found ("${appCell || "blank"}"), using ${appCode}.`);
      }

      // Status
      const ownerRaw = pick(row, /^owner|^assignee/);
      const { status, note } = mapStatus(/^cancel/i.test(ownerRaw) ? "canceled" : pick(row, /^status$/));
      if (note) notes.push(note);

      // Priority (Old Defect List has priority words in the wrong column)
      const priorityCell = pick(row, /^priority/);
      const stray = Object.values(row.cells).find((v) => /^(high|medium|low|critical)$/i.test(v.trim())) ?? "";
      const isProduction = MAPPING.criticalSheets.includes(ws.name);
      const priority: Priority = isProduction ? "critical" : (mapPriority(priorityCell) ?? mapPriority(stray) ?? "medium");

      // Assignee: first known person; the full original kept as a note
      let assigneeId: string | null = null;
      if (ownerRaw && !/^cancel/i.test(ownerRaw)) {
        const parts = ownerRaw.split(/[/&,]| and /i).map((p) => p.trim().toLowerCase()).filter(Boolean);
        for (const p of parts) {
          const display = MAPPING.ownerAliases[p];
          const u = display ? userByName.get(display.toLowerCase()) : undefined;
          if (u) {
            assigneeId = u.id;
            break;
          }
          if (display && !u) problems.push(`${rowKey}: owner "${display}" has no user account yet.`);
        }
        if (parts.length > 1 || !assigneeId) notes.push(`Owner in Excel: ${ownerRaw}`);
      }
      const assigneeName = assigneeId ? users.find((u) => u.id === assigneeId)!.name : "Unassigned";

      // Release status (Backend/Android/iOS) → remarks; Environment is Staging/Production only
      const release = (["backend", "android", "ios"] as const)
        .map((k) => [k, (row.cells[k] ?? "").trim()] as const)
        .filter(([k, v]) => v && v.toLowerCase() !== k)
        .map(([k, v]) => `${k === "ios" ? "iOS" : k[0].toUpperCase() + k.slice(1)}: ${v}`)
        .join(" · ");

      const remarks = pick(row, /^remarks?/);
      if (remarks) notes.push(`Remark: ${remarks}`);

      const title = titleFrom(desc);
      const paragraphs = [
        ...desc.split(/\r?\n/).map((l) => l.trim()),
        "",
        `Imported from Excel: sheet "${ws.name}"${row.excelId ? `, ID ${row.excelId}` : ""} (row ${row.rowNumber}).`,
      ];
      const dueDate: string | null = Object.entries(row.dates).find(([k]) => /target/.test(k))?.[1] ?? null;

      plans.push({ row, title, paragraphs, appCode, type: isProduction ? "bug" : mapType(pick(row, /^type$/)), priority, status, assigneeId, remarks: release ? `Release status: ${release}` : "", dueDate, notes });
      stats.byApp[appCode] = (stats.byApp[appCode] ?? 0) + 1;
      stats.byStatus[status] = (stats.byStatus[status] ?? 0) + 1;
      stats.byAssignee[assigneeName] = (stats.byAssignee[assigneeName] ?? 0) + 1;
      stats.comments += notes.length ? 1 : 0;
    }
  }

  const missingApps = Array.from(new Set(plans.map((p) => p.appCode))).filter((c) => !appByCode.has(c));
  for (const c of missingApps) problems.unshift(`App Type "${c}" doesn't exist yet; create it before --apply.`);

  /* ---------- report */
  console.log(`${apply ? "IMPORTING into" : "PREVIEW for"} ${target}`);
  console.log(`Sprint: "${MAPPING.sprintName}" (new, active)  ·  reporter/notes by ${importerEmail}\n`);
  console.log(`Tasks to create: ${stats.rows}   (rows without a description skipped: ${stats.skippedEmpty})`);
  const show = (label: string, m: Record<string, number>) =>
    console.log(`  ${label}: ${Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  show("per sheet", stats.bySheet);
  show("per app", stats.byApp);
  show("per status", stats.byStatus);
  show("per assignee", stats.byAssignee);
  console.log(`  tasks with a notes comment (owner/remarks/cancelled/hold): ${stats.comments}`);
  const uniqueProblems = Array.from(new Set(problems));
  console.log(`\nIssues (${uniqueProblems.length}):${uniqueProblems.length ? "" : " none"}`);
  for (const p of uniqueProblems.slice(0, 60)) console.log(`  - ${p}`);
  if (uniqueProblems.length > 60) console.log(`  … and ${uniqueProblems.length - 60} more`);

  if (!apply) {
    console.log("\nSample of mapped tasks:");
    for (const p of plans.filter((_, i) => i % 40 === 0)) {
      console.log(`  [${p.row.sheet} #${p.row.excelId}] ${p.appCode} ${p.type}/${p.priority}/${p.status} → "${p.title}"${p.notes.length ? `  (+note: ${p.notes.join(" | ").slice(0, 80)})` : ""}`);
    }
    console.log("\nNothing written. Re-run with --apply to import.");
    return;
  }
  if (missingApps.length) throw new Error("Create the missing App Types first.");

  /* ---------- write */
  const existing = await db.collection("sprints").where("name", "==", MAPPING.sprintName).get();
  if (!existing.empty) throw new Error(`A sprint named "${MAPPING.sprintName}" already exists; refusing to import twice.`);
  const active = await db.collection("sprints").where("status", "==", "active").get();
  const status = active.empty ? "active" : "planned";

  const today = new Date();
  const sprintRef = db.collection("sprints").doc();
  await sprintRef.set({
    name: MAPPING.sprintName,
    goal: MAPPING.sprintGoal,
    startDate: format(today, "yyyy-MM-dd"),
    endDate: format(addDays(today, 13), "yyyy-MM-dd"),
    status,
    createdBy: importer.uid,
    createdAt: FieldValue.serverTimestamp(),
    closedAt: null,
    closedBy: null,
  });
  if (status === "active") await db.doc("meta/activeSprint").set({ sprintId: sprintRef.id });

  // Reserve keys TSK-n … TSK-(n+count-1) atomically
  const first = await db.runTransaction(async (tx) => {
    const ref = db.doc("counters/tasks");
    const snap = await tx.get(ref);
    const next = snap.exists ? (snap.get("next") as number) : 1;
    tx.set(ref, { next: next + plans.length });
    return next;
  });

  const baseOrder = Date.now();
  let written = 0;
  for (const group of chunk(plans.map((p, i) => ({ p, i })), 120)) {
    const batch = db.batch();
    for (const { p, i } of group) {
      const taskRef = db.collection("tasks").doc();
      const key = `TSK-${first + i}`;
      const now = Timestamp.now();
      batch.set(taskRef, {
        taskKey: key,
        sprintId: sprintRef.id,
        order: baseOrder + i,
        appTypeId: appByCode.get(p.appCode)!.id,
        type: p.type,
        moduleId: null,
        title: p.title,
        description: tiptapDoc(p.paragraphs),
        descriptionText: p.paragraphs.join("\n").slice(0, 5000),
        assigneeId: p.assigneeId,
        priority: p.priority,
        severity: null,
        estimatedHours: null,
        actualHours: null,
        status: p.status,
        reporterId: importer.uid,
        dueDate: p.dueDate,
        environment: "",
        remarks: p.remarks,
        stepsToReproduce: "",
        expectedResult: "",
        actualResult: "",
        attachmentCount: 0,
        carryOverCount: 0,
        sprintHistory: [],
        createdAt: now,
        updatedAt: now,
        updatedBy: importer.uid,
      });
      batch.set(taskRef.collection("activity").doc(), {
        actorId: importer.uid, action: "created", field: null, oldValue: null, newValue: key, createdAt: now,
      });
      if (p.notes.length) {
        const commentRef = taskRef.collection("comments").doc();
        batch.set(commentRef, { authorId: importer.uid, body: `From the Excel sheet:\n${p.notes.map((n) => `• ${n}`).join("\n")}`, createdAt: now, editedAt: null });
        batch.set(taskRef.collection("activity").doc(), {
          actorId: importer.uid, action: "comment_added", field: null, oldValue: null, newValue: commentRef.id, createdAt: now,
        });
      }
    }
    await batch.commit();
    written += group.length;
    console.log(`  … ${written}/${plans.length}`);
  }
  console.log(`\n✔ Imported ${written} tasks (TSK-${first} … TSK-${first + written - 1}) into "${MAPPING.sprintName}" (${status}).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
