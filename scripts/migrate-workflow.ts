/**
 * One-off migration to the new workflow model (see DECISIONS.md "Workflow statuses").
 *
 *   npx tsx scripts/migrate-workflow.ts            # preview only: prints what would change
 *   npx tsx scripts/migrate-workflow.ts --apply    # writes the changes
 *
 * Per task:
 * - status: todo→pending, ready_for_qa→dev_done, qa_testing→testing, reopened→in_progress, blocked→on_hold.
 *   Excel-imported tasks that were "done" become Released, or Closed if the sheet marked them CANCELLED.
 * - type: requirement→task, enhancement→improvement
 * - assigneeId → assigneeIds, plus every owner named in the import's "Owner in Excel:" note
 * - severity and assigneeId are deleted
 * - imported tasks whose title is still the import's shortened text: the title becomes the full
 *   text (up to 300 chars) and the duplicated description is reduced to the import footer
 * - sprintHistory[].finalStatusInSprint uses the new statuses
 * Each visible change gets an activity entry in the same batch. Safe to re-run (already-migrated
 * tasks are skipped).
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { FieldValue, getFirestore, type DocumentData } from "firebase-admin/firestore";
import { emulatorsEnabled, getAdminApp } from "../lib/firebase/admin-core";
import { LEGACY_STATUS, LEGACY_TYPE } from "../lib/task-model";
import { chunk } from "../lib/utils";

const APPLY = process.argv.includes("--apply");
const TITLE_MAX = 300;

/** Same spellings as scripts/import-xlsx.ts (owner text → user display name). */
const OWNER_ALIASES: Record<string, string> = {
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
};

const FOOTER = /^Imported from Excel: /;

/** The import's title rule, to tell an untouched imported title from one someone edited. */
function importTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 120) return oneLine;
  const cut = oneLine.slice(0, 117);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : 117)}…`;
}

function fullTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= TITLE_MAX) return oneLine;
  const cut = oneLine.slice(0, TITLE_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > TITLE_MAX - 60 ? space : TITLE_MAX - 1)}…`;
}

const tiptapDoc = (paragraphs: string[]) =>
  JSON.stringify({
    type: "doc",
    content: paragraphs.map((p) => ({ type: "paragraph", content: p ? [{ type: "text", text: p }] : [] })),
  });

interface Plan {
  id: string;
  key: string;
  patch: Record<string, unknown>;
  activity: { field: string; oldValue: string | null; newValue: string | null }[];
  lines: string[];
}

async function main() {
  const app = getAdminApp();
  const db = getFirestore(app);
  const target = emulatorsEnabled() ? "EMULATOR" : `project ${app.options.projectId ?? process.env.FIREBASE_ADMIN_PROJECT_ID}`;
  console.log(`${APPLY ? "APPLYING" : "PREVIEW (nothing is written)"} on ${target}\n`);

  const users = (await db.collection("users").get()).docs.map((d) => ({ id: d.id, name: String(d.get("name")), role: String(d.get("role")) }));
  const userByName = new Map(users.map((u) => [u.name.toLowerCase(), u]));
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  // The Excel import (and its notes comments) ran as the owner: Aryan, an admin.
  const actor = users.find((u) => u.role === "admin" && u.name.startsWith("Aryan"));
  if (!actor) throw new Error("Owner admin account (Aryan) not found");

  const tasks = (await db.collection("tasks").get()).docs;
  const plans: Plan[] = [];
  const stats = { status: new Map<string, number>(), type: new Map<string, number>(), multi: 0, titles: 0, longKept: 0, dropped: 0, history: 0, unmatched: new Set<string>() };
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const snap of tasks) {
    const t = snap.data() as DocumentData;
    const key = String(t.taskKey);
    const patch: Record<string, unknown> = {};
    const activity: Plan["activity"] = [];
    const lines: string[] = [];
    const text = String(t.descriptionText ?? "");
    const textLines = text.split("\n");
    const footerAt = textLines.findIndex((l) => FOOTER.test(l));
    const imported = footerAt >= 0;

    // The import's notes comment (owners, CANCELLED)
    let note = "";
    if (imported) {
      const comments = await snap.ref.collection("comments").where("authorId", "==", actor.id).get();
      note = comments.docs.map((c) => String(c.get("body"))).find((b) => b.startsWith("From the Excel sheet:")) ?? "";
    }

    // Status
    const oldStatus = String(t.status);
    let status = LEGACY_STATUS[oldStatus] ?? oldStatus;
    if (imported && oldStatus === "done") status = /Marked CANCELLED/i.test(note) ? "closed" : "released";
    if (status !== oldStatus) {
      patch.status = status;
      activity.push({ field: "status", oldValue: oldStatus, newValue: status });
      bump(stats.status, `${oldStatus} → ${status}`);
    }

    // Category
    const oldType = String(t.type);
    const type = LEGACY_TYPE[oldType] ?? oldType;
    if (type !== oldType) {
      patch.type = type;
      activity.push({ field: "type", oldValue: oldType, newValue: type });
      bump(stats.type, `${oldType} → ${type}`);
    }

    // Assignees
    const before: string[] = Array.isArray(t.assigneeIds) ? (t.assigneeIds as string[]) : t.assigneeId ? [String(t.assigneeId)] : [];
    const ids = [...before];
    const owner = note.match(/Owner in Excel: (.+)/)?.[1]?.trim();
    if (owner && !/^cancel/i.test(owner)) {
      for (const part of owner.split(/[/&,]| and /i).map((p) => p.trim().toLowerCase()).filter(Boolean)) {
        const u = OWNER_ALIASES[part] ? userByName.get(OWNER_ALIASES[part].toLowerCase()) : undefined;
        if (u && !ids.includes(u.id)) ids.push(u.id);
        if (!u) stats.unmatched.add(`${part} (${key}: "${owner}")`);
      }
    }
    if (!Array.isArray(t.assigneeIds) || ids.length !== before.length) {
      patch.assigneeIds = ids;
      if (ids.length !== before.length) {
        activity.push({ field: "assigneeIds", oldValue: JSON.stringify(before), newValue: JSON.stringify(ids) });
        stats.multi += 1;
        lines.push(`assignees: ${before.map(nameOf).join(", ") || "none"} → ${ids.map(nameOf).join(", ")}  (Excel: "${owner}")`);
      }
    }
    if ("assigneeId" in t) patch.assigneeId = FieldValue.delete();
    if ("severity" in t) patch.severity = FieldValue.delete();

    // Title ← full imported text; drop the duplicate description
    if (imported) {
      const body = textLines.slice(0, footerAt).join("\n").trim();
      const footer = textLines[footerAt];
      if (body && String(t.title) === importTitle(body)) {
        const title = fullTitle(body);
        const oneLine = body.replace(/\s+/g, " ").trim();
        if (title !== t.title) {
          patch.title = title;
          activity.push({ field: "title", oldValue: String(t.title), newValue: title });
          stats.titles += 1;
        }
        if (oneLine.length <= TITLE_MAX) {
          patch.description = tiptapDoc([footer]);
          patch.descriptionText = footer;
          stats.dropped += 1;
        } else {
          stats.longKept += 1; // too long for a title: keep the full text in Description
        }
      }
    }

    // History entries
    if (Array.isArray(t.sprintHistory) && t.sprintHistory.some((h: DocumentData) => LEGACY_STATUS[h.finalStatusInSprint])) {
      patch.sprintHistory = (t.sprintHistory as DocumentData[]).map((h) => ({
        ...h,
        finalStatusInSprint: LEGACY_STATUS[h.finalStatusInSprint] ?? h.finalStatusInSprint,
      }));
      stats.history += 1;
    }

    if (Object.keys(patch).length) plans.push({ id: snap.id, key, patch, activity, lines });
  }

  // Sprint reports from the old model
  const reports = await db.collection("sprintReports").get();
  const oldReports = reports.docs.filter((r) => "openBugsBySeverity" in r.data());

  console.log(`Tasks: ${tasks.length}, to update: ${plans.length}`);
  console.log("Status changes:");
  for (const [k, v] of stats.status) console.log(`  ${k}: ${v}`);
  console.log("Category changes:");
  for (const [k, v] of stats.type) console.log(`  ${k}: ${v}`);
  console.log(`Tasks gaining Excel co-owners: ${stats.multi}`);
  console.log(`Titles expanded to the full text: ${stats.titles}`);
  console.log(`Duplicate descriptions reduced to the import footer: ${stats.dropped}`);
  console.log(`Texts longer than ${TITLE_MAX} chars (Description kept): ${stats.longKept}`);
  console.log(`Tasks with carried history rewritten: ${stats.history}`);
  console.log(`Old-format release reports (left as-is, read with fallbacks): ${oldReports.length}`);
  if (stats.unmatched.size) console.log(`Owner spellings with no account: ${[...stats.unmatched].join(", ")}`);
  console.log(`Writes: ${plans.length} task updates + ${plans.reduce((a, p) => a + p.activity.length, 0)} activity entries\n`);

  console.log("Samples:");
  for (const p of plans.filter((x) => x.lines.length || x.patch.title).slice(0, 12)) {
    console.log(`  ${p.key}`);
    for (const l of p.lines) console.log(`    ${l}`);
    if (p.patch.title) console.log(`    title: "${String(p.patch.title).slice(0, 140)}${String(p.patch.title).length > 140 ? "…" : ""}"`);
  }

  if (!APPLY) {
    console.log("\nPreview only. Re-run with --apply to write.");
    return;
  }

  let ops = 0;
  // An update + its activity entries stay in one batch (≤ ~8 ops per task).
  for (const group of chunk(plans, 50)) {
    const batch = db.batch();
    for (const p of group) {
      batch.update(db.doc(`tasks/${p.id}`), { ...p.patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.id });
      for (const a of p.activity) {
        batch.set(db.collection(`tasks/${p.id}/activity`).doc(), {
          actorId: actor.id,
          action: "updated",
          field: a.field,
          oldValue: a.oldValue,
          newValue: a.newValue,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      ops += 1 + p.activity.length;
    }
    await batch.commit();
  }
  console.log(`\nDone: ${plans.length} tasks updated (${ops} writes).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
