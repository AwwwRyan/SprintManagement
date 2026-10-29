/**
 * One-off (2026-10-29): Open and On Hold were merged into the Backlog status (stored "pending"),
 * and a task with that status lives in the Backlog.
 *  - On Hold tasks (anywhere) -> Backlog status
 *  - tasks with the Backlog status in an open release -> moved to the Backlog
 * Each change is logged in the task's activity. Closed releases are left alone.
 *
 *   npx tsx scripts/migrate-backlog-status.ts            # preview, writes nothing
 *   npx tsx scripts/migrate-backlog-status.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { emulatorsEnabled, getAdminApp } from "../lib/firebase/admin-core";

const APPLY = process.argv.includes("--apply");
const BACKLOG = "backlog";

async function main() {
  const app = getAdminApp();
  const db = getFirestore(app);
  const target = emulatorsEnabled() ? "EMULATOR" : `project ${app.options.projectId ?? process.env.FIREBASE_ADMIN_PROJECT_ID}`;
  console.log(`${APPLY ? "APPLYING" : "PREVIEW (nothing is written)"} on ${target}\n`);

  const admins = await db.collection("users").where("role", "==", "admin").get();
  const actor = admins.docs.find((u) => String(u.get("name")).startsWith("Aryan"));
  if (!actor) throw new Error("Owner admin account (Aryan) not found");
  const backlog = await db.doc(`sprints/${BACKLOG}`).get();
  if (!backlog.exists) throw new Error("The Backlog isn't set up yet (Backlog page → Set up the Backlog).");

  const sprints = new Map((await db.collection("sprints").get()).docs.map((d) => [d.id, { name: String(d.get("name")), status: String(d.get("status")) }]));
  const tasks = (await db.collection("tasks").where("status", "in", ["pending", "on_hold"]).get()).docs;

  type Plan = { ref: FirebaseFirestore.DocumentReference; key: string; from: string; status: string; move: boolean; title: string };
  const plans: Plan[] = [];
  for (const d of tasks) {
    const sprint = sprints.get(String(d.get("sprintId")));
    const inOpenRelease = d.get("sprintId") !== BACKLOG && sprint && sprint.status !== "closed";
    const statusChange = d.get("status") === "on_hold";
    if (!statusChange && !inOpenRelease) continue;
    plans.push({
      ref: d.ref,
      key: String(d.get("taskKey")),
      from: sprint?.name ?? String(d.get("sprintId")),
      status: String(d.get("status")),
      move: !!inOpenRelease,
      title: String(d.get("title")),
    });
  }

  for (const p of plans) {
    console.log(`  ${p.key.padEnd(8)} ${p.status === "on_hold" ? "On Hold -> Backlog" : "Backlog          "}  ${p.move ? `moves ${p.from} -> Backlog` : `stays in ${p.from}`.padEnd(30)}  ${p.title.slice(0, 60)}`);
  }
  console.log(`\n${plans.filter((p) => p.status === "on_hold").length} status change(s), ${plans.filter((p) => p.move).length} move(s) to the Backlog.`);
  if (!APPLY) {
    console.log("Preview only. Re-run with --apply to write.");
    return;
  }

  const batch = db.batch();
  let order = Date.now();
  for (const p of plans) {
    batch.update(p.ref, {
      status: "pending",
      ...(p.move
        ? {
            sprintId: BACKLOG,
            order: order++,
            sprintHistory: FieldValue.arrayUnion({ sprintId: (await p.ref.get()).get("sprintId"), sprintName: p.from, finalStatusInSprint: p.status, movedAt: Timestamp.now() }),
          }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.id,
    });
    const log = (entry: Record<string, unknown>) =>
      batch.set(p.ref.collection("activity").doc(), { actorId: actor.id, createdAt: FieldValue.serverTimestamp(), ...entry });
    if (p.status === "on_hold") log({ action: "updated", field: "status", oldValue: "on_hold", newValue: "pending" });
    if (p.move) log({ action: "moved", field: "sprintId", oldValue: p.from, newValue: "Backlog" });
  }
  await batch.commit();
  console.log(`Updated ${plans.length} task(s).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
