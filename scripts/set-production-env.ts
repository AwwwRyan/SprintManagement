/**
 * One-off (2026-10-27): tasks imported from the Excel "Production issues" sheet get
 * environment = Production, so the Environment filter finds them. Only tasks with no environment
 * are touched; priorities are left as they are (someone may have changed one on purpose).
 * Each change is logged in the task's activity.
 *
 *   npx tsx scripts/set-production-env.ts            # preview, writes nothing
 *   npx tsx scripts/set-production-env.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { emulatorsEnabled, getAdminApp } from "../lib/firebase/admin-core";

const APPLY = process.argv.includes("--apply");
const SHEET = /Imported from Excel: sheet "Production issues"/;

async function main() {
  const app = getAdminApp();
  const db = getFirestore(app);
  const target = emulatorsEnabled() ? "EMULATOR" : `project ${app.options.projectId ?? process.env.FIREBASE_ADMIN_PROJECT_ID}`;
  console.log(`${APPLY ? "APPLYING" : "PREVIEW (nothing is written)"} on ${target}\n`);

  const admins = await db.collection("users").where("role", "==", "admin").get();
  const actor = admins.docs.find((u) => String(u.get("name")).startsWith("Aryan"));
  if (!actor) throw new Error("Owner admin account (Aryan) not found");

  const tasks = (await db.collection("tasks").get()).docs.filter(
    (d) => SHEET.test(String(d.get("descriptionText") ?? "")) && !d.get("environment"),
  );
  for (const d of tasks) {
    console.log(`  ${d.get("taskKey")}  ${String(d.get("status")).padEnd(11)} ${String(d.get("priority")).padEnd(8)} ${String(d.get("title")).slice(0, 80)}`);
  }
  console.log(`${tasks.length} task(s) -> environment Production (priorities unchanged)`);
  if (!APPLY) {
    console.log("Preview only. Re-run with --apply to write.");
    return;
  }
  if (tasks.length === 0) return;

  const batch = db.batch();
  for (const d of tasks) {
    batch.update(d.ref, { environment: "Production", updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.id });
    batch.set(d.ref.collection("activity").doc(), {
      actorId: actor.id,
      action: "updated",
      field: "environment",
      oldValue: null,
      newValue: "Production",
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`Updated ${tasks.length} task(s).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
