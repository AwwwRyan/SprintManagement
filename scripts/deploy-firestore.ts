/**
 * Deploys firestore.rules and firestore.indexes.json to the real project using the
 * FIREBASE_ADMIN_* service account from .env.local (no `firebase login` needed).
 *
 *   npm run deploy:firestore
 *
 * Equivalent to `npx firebase deploy --only firestore:rules,firestore:indexes`.
 * Rules always work with the Admin SDK key. Creating indexes needs the "Cloud Datastore Index Admin"
 * role, which the default firebase-adminsdk service account lacks; if it's missing, the script says
 * so and you run `npx firebase login` + `npx firebase deploy --only firestore:indexes` instead.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import fs from "node:fs";
import path from "node:path";
import { getSecurityRules } from "firebase-admin/security-rules";
import { emulatorsEnabled, getAdminApp } from "../lib/firebase/admin-core";

interface IndexField {
  fieldPath: string;
  order?: "ASCENDING" | "DESCENDING";
  arrayConfig?: "CONTAINS";
}
interface IndexDef {
  collectionGroup: string;
  queryScope: "COLLECTION" | "COLLECTION_GROUP";
  fields: IndexField[];
}

async function main() {
  if (emulatorsEnabled()) {
    console.error("NEXT_PUBLIC_USE_EMULATORS=true: this deploys to the REAL project. Set it to false first.");
    process.exit(1);
  }
  const app = getAdminApp();
  const projectId = app.options.projectId ?? process.env.FIREBASE_ADMIN_PROJECT_ID;
  console.log(`Deploying to project: ${projectId}`);

  // 1. Rules
  const source = fs.readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8");
  const ruleset = await getSecurityRules(app).releaseFirestoreRulesetFromSource(source);
  console.log(`✔ Firestore rules released (ruleset ${ruleset.name.split("/").pop()})`);

  // 2. Indexes (Firestore Admin REST API, authenticated with the service account)
  const token = (await app.options.credential!.getAccessToken()).access_token;
  const { indexes } = JSON.parse(fs.readFileSync(path.join(process.cwd(), "firestore.indexes.json"), "utf8")) as {
    indexes: IndexDef[];
  };
  // Listing only needs read access, so skip indexes that already exist.
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups`;
  const listed = await fetch(`${base}/-/indexes`, { headers: { Authorization: `Bearer ${token}` } });
  const existing = listed.ok
    ? (((await listed.json()) as { indexes?: { name: string; fields: IndexField[] }[] }).indexes ?? [])
    : [];
  const sig = (fields: IndexField[]) =>
    fields.filter((f) => f.fieldPath !== "__name__").map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`).join(",");

  for (const idx of indexes) {
    const url = `${base}/${idx.collectionGroup}/indexes`;
    const present = existing.some(
      (e) => e.name.includes(`/collectionGroups/${idx.collectionGroup}/`) && sig(e.fields) === sig(idx.fields),
    );
    if (present) {
      console.log(`✔ Index exists: ${idx.collectionGroup}(${sig(idx.fields)})`);
      continue;
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ queryScope: idx.queryScope, fields: idx.fields }),
    });
    const label = `${idx.collectionGroup}(${idx.fields.map((f) => `${f.fieldPath} ${f.order ?? f.arrayConfig}`).join(", ")})`;
    if (res.ok) console.log(`✔ Index creation started: ${label}`);
    else if (res.status === 409) console.log(`✔ Index already exists: ${label}`);
    else if (res.status === 403) {
      console.log("✖ The service account can't create indexes (needs the Cloud Datastore Index Admin role).");
      console.log("  Deploy them with your own account instead:");
      console.log("    npx firebase login");
      console.log(`    npx firebase deploy --only firestore:indexes --project ${projectId}`);
      process.exitCode = 2;
      return;
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`Index ${label} failed (${res.status}): ${body.error?.message ?? res.statusText}`);
    }
  }
  console.log("Done. New indexes take a few minutes to build (Firebase console → Firestore → Indexes).");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1; // not process.exit(): it can crash libuv on Windows while sockets close
});
