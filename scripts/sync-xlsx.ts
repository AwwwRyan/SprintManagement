/**
 * Applies a newer copy of the Excel bug list to the live tasks (see DECISIONS.md "Excel sync").
 *
 *   npx tsx scripts/sync-xlsx.ts "import/<baseline>.xlsx" "<new>.xlsx"            # preview, writes nothing
 *   npx tsx scripts/sync-xlsx.ts "import/<baseline>.xlsx" "<new>.xlsx" --apply    # write
 *
 * Only what changed in Excel since the baseline is applied (3-way), so edits made in the app are
 * never overwritten by a stale spreadsheet value: if the app value no longer matches the baseline,
 * that field is reported as a conflict and left alone.
 * - Changed rows: status, category, assignees (only when the Owner cell names people; "QA…" means
 *   Hariharan, the owner's call on 2026-10-22), remarks
 *   (mirrored, blank clears), task text, target date. Each change gets an activity entry.
 * - New rows: created in the release that holds the imported tasks, with the next TSK keys.
 * - Import footers are updated to the new row numbers, so the new file becomes the next baseline.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { FieldValue, getFirestore, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { emulatorsEnabled, getAdminApp } from "../lib/firebase/admin-core";
import { chunk } from "../lib/utils";
import { diffRows, FOOTER_RE, pick, readBook, type XRow } from "./diff-xlsx";
import { MAPPING, mapPriority, mapType } from "./import-xlsx";
import type { Priority, TaskStatus, TaskType } from "../types";

const APPLY = process.argv.includes("--apply");
const TITLE_MAX = 300;

/** Excel status → app status (decided with the owner on 2026-10-22). */
function mapStatus(raw: string): TaskStatus {
  const s = raw.trim().toLowerCase();
  if (!s || s === "open" || s === "pending") return "pending";
  if (s === "in progress") return "in_progress";
  if (s === "qa test" || s.startsWith("testing")) return "testing";
  if (s === "hold" || s === "on hold") return "on_hold";
  if (s === "completed" || s === "done") return "done"; // tested, not released yet
  if (s.startsWith("cancel")) return "closed";
  return "pending";
}

/** What the first import (2026-10-12) turned a baseline status into, before the workflow migration. */
function baselineStatus(raw: string, ownerRaw: string): TaskStatus {
  const s = (/^cancel/i.test(ownerRaw) ? "canceled" : raw).trim().toLowerCase();
  if (s === "completed" || s === "done") return "released";
  return mapStatus(s);
}

const typeOf = (sheet: string, raw: string): TaskType => (MAPPING.criticalSheets.includes(sheet) ? "bug" : mapType(raw));

function fullTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= TITLE_MAX) return oneLine;
  const cut = oneLine.slice(0, TITLE_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > TITLE_MAX - 60 ? space : TITLE_MAX - 1)}…`;
}

const footerFor = (r: XRow) => `Imported from Excel: sheet "${r.sheet}"${r.excelId ? `, ID ${r.excelId}` : ""} (row ${r.rowNumber}).`;
const tiptapDoc = (paragraphs: string[]) =>
  JSON.stringify({ type: "doc", content: paragraphs.map((p) => ({ type: "paragraph", content: p ? [{ type: "text", text: p }] : [] })) });
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

async function main() {
  const [baseFile, newFile] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!baseFile || !newFile) throw new Error('Usage: npx tsx scripts/sync-xlsx.ts "baseline.xlsx" "new.xlsx" [--apply]');

  const app = getAdminApp();
  const db = getFirestore(app);
  const target = emulatorsEnabled() ? "EMULATOR" : `project ${app.options.projectId ?? process.env.FIREBASE_ADMIN_PROJECT_ID}`;
  console.log(`${APPLY ? "APPLYING" : "PREVIEW (nothing is written)"} on ${target}\n`);

  const users = (await db.collection("users").get()).docs.map((d) => ({ id: d.id, name: String(d.get("name")), role: String(d.get("role")) }));
  const userByName = new Map(users.map((u) => [u.name.toLowerCase(), u]));
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  const actor = users.find((u) => u.role === "admin" && u.name.startsWith("Aryan"));
  if (!actor) throw new Error("Owner admin account (Aryan) not found");
  const appTypes = (await db.collection("appTypes").get()).docs.map((d) => ({ id: d.id, code: String(d.get("code")) }));
  const appByCode = new Map(appTypes.map((a) => [a.code, a.id]));

  // Owner cells that say "QA …" go to Hariharan (owner's decision).
  const qaOwner = userByName.get("hariharan");
  if (!qaOwner) throw new Error("Hariharan's account not found");
  const isQa = (raw: string) => /^qa(\s|$)/i.test(raw.trim());

  /** People named in an Owner cell; null when it names nobody ("NA", …). */
  const owners = (raw: string): string[] | null => {
    if (!raw || /^cancel/i.test(raw)) return null;
    if (isQa(raw)) return [qaOwner.id];
    const ids: string[] = [];
    for (const part of raw.split(/[/&,]| and /i).map((p) => p.trim().toLowerCase()).filter(Boolean)) {
      const alias = (MAPPING.ownerAliases as Record<string, string>)[part];
      const u = alias ? userByName.get(alias.toLowerCase()) : undefined;
      if (u && !ids.includes(u.id)) ids.push(u.id);
    }
    return ids.length ? ids : null;
  };

  const [baseRows, newRows] = await Promise.all([readBook(baseFile), readBook(newFile)]);
  const { matched, added, removed } = diffRows(baseRows, newRows);

  const tasks = (await db.collection("tasks").get()).docs;
  const live = new Map(
    tasks.flatMap((d) => {
      const m = String(d.get("descriptionText") ?? "").match(FOOTER_RE);
      return m ? [[`${m[1]}|${m[3]}`, d] as const] : [];
    }),
  );

  type Write = { ref: DocumentReference; patch: Record<string, unknown>; activity: { field: string; oldValue: string | null; newValue: string | null }[]; key: string; lines: string[] };
  const writes: Write[] = [];
  const conflicts: string[] = [];
  const missing: string[] = [];
  let footersOnly = 0;

  for (const { row, old, diffs } of matched) {
    const snap = live.get(`${old.sheet}|${old.rowNumber}`);
    if (!snap) {
      missing.push(`[${row.sheet} #${row.excelId}] ${pick(row, /description/).slice(0, 60)}`);
      continue;
    }
    const t = snap.data();
    const key = String(t.taskKey);
    const w: Write = { ref: snap.ref, patch: {}, activity: [], key, lines: [] };
    const changed = new Set(diffs.map(([f]) => f));
    const set = (field: string, from: unknown, to: unknown, label = field) => {
      w.patch[field] = to;
      w.activity.push({
        field,
        oldValue: Array.isArray(from) ? JSON.stringify(from) : from == null ? null : String(from),
        newValue: Array.isArray(to) ? JSON.stringify(to) : to == null ? null : String(to),
      });
      const show = (v: unknown) => (Array.isArray(v) ? v.map(nameOf).join(", ") || "none" : `"${String(v ?? "").slice(0, 70)}"`);
      w.lines.push(`${label}: ${show(from)} → ${show(to)}`);
    };
    const conflict = (field: string, liveV: unknown, baseV: unknown, excelV: unknown) =>
      conflicts.push(`${key} ${field}: app has "${String(liveV)}" (Excel was "${String(baseV)}", now "${String(excelV)}") — kept the app value`);

    // Status (an owner of "Canceled" also meant cancelled in the first import)
    if (changed.has("status") || (changed.has("owner") && /^cancel/i.test(pick(row, /^owner|^assignee/)))) {
      const was = baselineStatus(pick(old, /^status$/), pick(old, /^owner|^assignee/));
      const next = /^cancel/i.test(pick(row, /^owner|^assignee/)) ? "closed" : mapStatus(pick(row, /^status$/));
      if (t.status !== was) conflict("status", t.status, was, next);
      else if (next !== t.status) set("status", t.status, next);
    }
    // Category
    if (changed.has("type")) {
      const was = typeOf(old.sheet, pick(old, /^type$/));
      const next = typeOf(row.sheet, pick(row, /^type$/));
      const wasNow = was === ("enhancement" as TaskType) ? "improvement" : was;
      if (t.type !== wasNow) conflict("category", t.type, wasNow, next);
      else if (next !== t.type) set("type", t.type, next, "category");
    }
    // Assignees: only when the new Owner cell names people (or says QA, even if unchanged)
    if (changed.has("owner") || isQa(pick(row, /^owner|^assignee/))) {
      const next = owners(pick(row, /^owner|^assignee/));
      const was = owners(pick(old, /^owner|^assignee/)) ?? [];
      const cur = (t.assigneeIds as string[]) ?? [];
      if (next && !sameSet(next, cur)) {
        if (changed.has("owner") && !sameSet(cur, was) && !was.every((id) => cur.includes(id))) conflict("assignees", cur.map(nameOf).join(", "), was.map(nameOf).join(", "), next.map(nameOf).join(", "));
        else set("assigneeIds", cur, next, "assignees");
      }
    }
    // Remarks: mirror Excel (blank clears)
    if (changed.has("remarks")) {
      const was = pick(old, /^remarks?/).trim();
      const next = pick(row, /^remarks?/).trim();
      const cur = String(t.remarks ?? "").trim();
      if (cur !== was && cur !== next) conflict("remarks", cur, was, next);
      else if (cur !== next) set("remarks", t.remarks ?? "", next);
    }
    // Task text
    if (changed.has("description")) {
      const was = fullTitle(pick(old, /description/));
      const next = fullTitle(pick(row, /description/));
      if (t.title !== was) conflict("task text", t.title, was, next);
      else if (next !== t.title) set("title", t.title, next, "task");
    }
    // Target date → due date
    if (changed.has("target date")) {
      const next = Object.entries(row.dates).find(([k]) => /target/.test(k))?.[1] ?? null;
      if ((t.dueDate ?? null) !== next) set("dueDate", t.dueDate ?? null, next, "due date");
    }
    for (const [f, a, b] of diffs) {
      if (["backend", "android", "ios", "priority", "app"].includes(f)) w.lines.push(`(not applied) ${f}: "${a}" → "${b}"`);
    }

    // Keep the import footer pointing at the row in the new file (it becomes the next baseline).
    const text = String(t.descriptionText ?? "");
    const newFooter = footerFor(row);
    if (!text.includes(newFooter)) {
      const nextText = text.replace(FOOTER_RE, newFooter);
      w.patch.descriptionText = nextText;
      w.patch.description = String(t.description ?? "").replace(
        JSON.stringify(text.match(FOOTER_RE)![0]).slice(1, -1),
        JSON.stringify(newFooter).slice(1, -1),
      );
    }
    if (Object.keys(w.patch).length) {
      if (!w.activity.length) footersOnly++;
      writes.push(w);
    }
  }

  // New rows → new tasks in the release that holds the imported tasks
  const importedSprints = new Set([...live.values()].map((d) => String(d.get("sprintId"))));
  const sprintId = [...importedSprints][0];
  const sprint = await db.doc(`sprints/${sprintId}`).get();
  if (importedSprints.size !== 1 || sprint.get("status") === "closed") {
    throw new Error(`Imported tasks are in ${importedSprints.size} releases or a closed one; decide where new rows go first.`);
  }
  const maxOrder = Math.max(...tasks.filter((d) => d.get("sprintId") === sprintId).map((d) => Number(d.get("order"))));

  const creates = added.map((r, i) => {
    const desc = pick(r, /description/);
    const appCell = pick(r, /^app|^application/);
    const appCode =
      (MAPPING.rowApp as Record<string, string>)[`${r.sheet}#${r.excelId}`] ??
      (MAPPING.sheetApp as Record<string, string | null>)[r.sheet] ??
      (MAPPING.appColumn as [RegExp, string][]).find(([re]) => re.test(appCell.trim()))?.[1] ??
      MAPPING.defaultApp;
    const ownerRaw = pick(r, /^owner|^assignee/);
    const assigneeIds = owners(ownerRaw) ?? [];
    const notes: string[] = [];
    if (ownerRaw && !owners(ownerRaw)) notes.push(`Owner in Excel: ${ownerRaw}`);
    if (appCell && !(MAPPING.sheetApp as Record<string, string | null>)[r.sheet]) notes.push(`Excel listed the app as "${appCell}".`);
    const status: TaskStatus = /^cancel/i.test(ownerRaw) ? "closed" : mapStatus(pick(r, /^status$/));
    const priority: Priority = MAPPING.criticalSheets.includes(r.sheet) ? "critical" : (mapPriority(pick(r, /^priority/)) ?? "medium");
    const oneLine = desc.replace(/\s+/g, " ").trim();
    const footer = footerFor(r);
    const paragraphs = oneLine.length <= TITLE_MAX ? [footer] : [...desc.split(/\r?\n/).map((l) => l.trim()), "", footer];
    return {
      row: r,
      appCode,
      notes,
      data: {
        sprintId,
        order: maxOrder + (i + 1) * 1000,
        appTypeId: appByCode.get(appCode)!,
        type: typeOf(r.sheet, pick(r, /^type$/)),
        moduleId: null,
        title: fullTitle(desc),
        description: tiptapDoc(paragraphs),
        descriptionText: paragraphs.join("\n"),
        assigneeIds,
        priority,
        estimatedHours: null,
        actualHours: null,
        status,
        reporterId: actor.id,
        dueDate: Object.entries(r.dates).find(([k]) => /target/.test(k))?.[1] ?? null,
        releaseDate: null,
        environment: "",
        remarks: pick(r, /^remarks?/).trim(),
        stepsToReproduce: "",
        expectedResult: "",
        actualResult: "",
        attachmentCount: 0,
        carryOverCount: 0,
        sprintHistory: [],
      },
    };
  });

  /* ------------------------------------------------------------------ report */
  const real = writes.filter((w) => w.activity.length);
  const count = (field: string) => real.filter((w) => w.activity.some((a) => a.field === field)).length;
  console.log(`Baseline ${baseRows.length} rows · new file ${newRows.length} rows · release "${sprint.get("name")}"`);
  console.log(`Existing tasks to update: ${real.length} (status ${count("status")}, assignees ${count("assigneeIds")}, remarks ${count("remarks")}, category ${count("type")}, task text ${count("title")}, due date ${count("dueDate")})`);
  console.log(`Footer-only updates (row moved in the sheet): ${footersOnly}`);
  console.log(`New tasks: ${creates.length}`);
  console.log(`Conflicts (app edited since the import; left alone): ${conflicts.length}`);
  if (missing.length) console.log(`Rows with no live task (skipped): ${missing.length}\n  ${missing.join("\n  ")}`);
  if (removed.length) console.log(`Rows gone from the new file (left alone): ${removed.length}`);

  const statusCount = new Map<string, number>();
  for (const w of real) for (const a of w.activity.filter((x) => x.field === "status")) statusCount.set(`${a.oldValue} → ${a.newValue}`, (statusCount.get(`${a.oldValue} → ${a.newValue}`) ?? 0) + 1);
  console.log("\nStatus changes:");
  for (const [k, v] of statusCount) console.log(`  ${k}: ${v}`);

  console.log("\n=== UPDATES ===");
  for (const w of real) console.log(`${w.key}\n    ${w.lines.join("\n    ")}`);
  if (conflicts.length) console.log(`\n=== CONFLICTS ===\n${conflicts.join("\n")}`);
  console.log("\n=== NEW TASKS ===");
  for (const c of creates) {
    const d = c.data;
    console.log(
      `[${c.row.sheet} #${c.row.excelId}] ${c.appCode} ${d.type}/${d.priority}/${d.status} · ${d.assigneeIds.map(nameOf).join(", ") || "unassigned"}${d.remarks ? ` · remark "${d.remarks.slice(0, 50)}"` : ""}\n    ${d.title.slice(0, 150)}`,
    );
  }

  if (!APPLY) {
    console.log("\nPreview only. Re-run with --apply to write.");
    return;
  }

  /* ------------------------------------------------------------------ apply */
  for (const group of chunk(writes, 60)) {
    const batch = db.batch();
    for (const w of group) {
      batch.update(w.ref, { ...w.patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.id });
      for (const a of w.activity) {
        batch.set(w.ref.collection("activity").doc(), { actorId: actor.id, action: "updated", ...a, createdAt: FieldValue.serverTimestamp() });
      }
    }
    await batch.commit();
  }
  console.log(`\n✔ Updated ${writes.length} tasks.`);

  if (creates.length) {
    const first = await db.runTransaction(async (tx) => {
      const ref = db.doc("counters/tasks");
      const snap = await tx.get(ref);
      const next = snap.exists ? (snap.get("next") as number) : 1;
      tx.set(ref, { next: next + creates.length });
      return next;
    });
    for (const group of chunk(creates.map((c, i) => ({ c, i })), 100)) {
      const batch = db.batch();
      for (const { c, i } of group) {
        const ref = db.collection("tasks").doc();
        const key = `TSK-${first + i}`;
        const now = Timestamp.now();
        batch.set(ref, { ...c.data, taskKey: key, createdAt: now, updatedAt: now, updatedBy: actor.id });
        batch.set(ref.collection("activity").doc(), { actorId: actor.id, action: "created", field: null, oldValue: null, newValue: key, createdAt: now });
        if (c.notes.length) {
          const comment = ref.collection("comments").doc();
          batch.set(comment, { authorId: actor.id, body: `From the Excel sheet:\n${c.notes.map((n) => `• ${n}`).join("\n")}`, createdAt: now, editedAt: null });
          batch.set(ref.collection("activity").doc(), { actorId: actor.id, action: "comment_added", field: null, oldValue: null, newValue: comment.id, createdAt: now });
        }
      }
      await batch.commit();
    }
    console.log(`✔ Created ${creates.length} tasks (TSK-${first} … TSK-${first + creates.length - 1}).`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
