/**
 * Read-only health check of the real Firebase project (prints no secrets):
 * admin accounts, composite index status, and whether the deployed rules match firestore.rules.
 *
 *   npm run verify-setup
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import fs from "node:fs";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getSecurityRules } from "firebase-admin/security-rules";
import { emulatorsEnabled, getAdminApp } from "../lib/firebase/admin-core";

async function main() {
  if (emulatorsEnabled()) {
    console.log("NEXT_PUBLIC_USE_EMULATORS=true: this checks the real project. Set it to false first.");
    process.exitCode = 1;
    return;
  }
  const app = getAdminApp();
  const projectId = app.options.projectId ?? process.env.FIREBASE_ADMIN_PROJECT_ID;
  console.log(`Project: ${projectId}`);

  // Admins: Auth claim + Firestore profile must agree
  const admins = await getFirestore(app).collection("users").where("role", "==", "admin").get();
  for (const d of admins.docs) {
    const user = await getAuth(app).getUser(d.id).catch(() => null);
    const ok = !!user && user.customClaims?.role === "admin" && !user.disabled && d.get("active") === true;
    console.log(`${ok ? "OK  " : "FAIL"} admin ${d.get("email")}${ok ? "" : " (claim/profile mismatch or disabled)"}`);
  }
  if (admins.empty) console.log("FAIL no admin profile found; run scripts/create-admin.ts");

  // Rules: deployed source == local file
  const deployed = await getSecurityRules(app).getFirestoreRuleset();
  const local = fs.readFileSync("firestore.rules", "utf8");
  const same = deployed.source.some((f) => f.content.trim() === local.trim());
  console.log(`${same ? "OK  " : "FAIL"} deployed rules ${same ? "match" : "differ from"} firestore.rules${same ? "" : " (run npm run deploy:firestore)"}`);

  // Indexes (listing needs only read access)
  const token = (await app.options.credential!.getAccessToken()).access_token;
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/-/indexes`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    console.log(`?    could not list indexes (${res.status}); check Firebase console → Firestore → Indexes`);
  } else {
    const { indexes = [] } = (await res.json()) as {
      indexes?: { name: string; state: string; fields: { fieldPath: string; order?: string }[] }[];
    };
    const expected = (JSON.parse(fs.readFileSync("firestore.indexes.json", "utf8")) as {
      indexes: { collectionGroup: string; fields: { fieldPath: string; order?: string }[] }[];
    }).indexes;
    const sig = (fields: { fieldPath: string; order?: string }[]) =>
      fields.filter((f) => f.fieldPath !== "__name__").map((f) => `${f.fieldPath}:${f.order}`).join(",");
    for (const e of expected) {
      const found = indexes.find((i) => i.name.includes(`/collectionGroups/${e.collectionGroup}/`) && sig(i.fields) === sig(e.fields));
      const state = found?.state ?? "MISSING";
      console.log(`${state === "READY" ? "OK  " : "WAIT"} index ${e.collectionGroup}(${sig(e.fields)}): ${state}`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
