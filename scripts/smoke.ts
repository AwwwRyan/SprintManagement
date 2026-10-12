/**
 * Setup/cleanup for the real-project smoke test (tests/smoke).
 *
 *   npx tsx scripts/smoke.ts setup     creates 2 temporary users (admin + developer), random passwords
 *   npx tsx scripts/smoke.ts cleanup   deletes ONLY what the smoke test created ([SMOKE]-tagged data + the users)
 *
 * Credentials are written to .smoke-creds.json (git-ignored) and removed by cleanup.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { emulatorsEnabled, getAdminApp } from "../lib/firebase/admin-core";

export const SMOKE_TAG = "[SMOKE]";
const CREDS_FILE = ".smoke-creds.json";
const DOMAIN = "smoke-test.invalid";
const USERS = [
  { key: "admin", email: `smoke-admin@${DOMAIN}`, name: "Smoke Admin", role: "admin" },
  { key: "dev", email: `smoke-dev@${DOMAIN}`, name: "Smoke Developer", role: "developer" },
] as const;

const app = getAdminApp();
const auth = getAuth(app);
const db = getFirestore(app);

async function setup() {
  const creds: Record<string, { email: string; password: string }> = {};
  for (const u of USERS) {
    const password = crypto.randomBytes(12).toString("base64url");
    let uid: string;
    try {
      uid = (await auth.getUserByEmail(u.email)).uid;
      await auth.updateUser(uid, { password, disabled: false });
    } catch {
      uid = (await auth.createUser({ email: u.email, password, displayName: u.name })).uid;
    }
    await auth.setCustomUserClaims(uid, { role: u.role });
    await db.doc(`users/${uid}`).set({
      name: `${SMOKE_TAG} ${u.name}`,
      email: u.email,
      role: u.role,
      designation: "Smoke test (temporary)",
      active: true,
      initials: "SM",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    creds[u.key] = { email: u.email, password };
  }
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));
  console.log(`Created ${USERS.length} temporary smoke users; credentials in ${CREDS_FILE}`);
}

async function cleanup() {
  let removed = 0;
  // Tasks tagged [SMOKE] (with comments/attachments/chunks/activity)
  const tasks = await db.collection("tasks").get();
  for (const t of tasks.docs.filter((d) => String(d.get("title")).startsWith(SMOKE_TAG))) {
    await db.recursiveDelete(t.ref);
    removed++;
  }
  // Sprints tagged [SMOKE] (+ their reports and presence)
  const sprints = await db.collection("sprints").get();
  const smokeSprintIds = sprints.docs.filter((d) => String(d.get("name")).startsWith(SMOKE_TAG)).map((d) => d.id);
  for (const id of smokeSprintIds) {
    await db.recursiveDelete(db.doc(`sprints/${id}`));
    await db.recursiveDelete(db.doc(`sprintReports/${id}`));
    await db.recursiveDelete(db.doc(`presence/${id}`));
    removed++;
  }
  const meta = await db.doc("meta/activeSprint").get();
  if (meta.exists && smokeSprintIds.includes(meta.get("sprintId"))) await db.doc("meta/activeSprint").set({ sprintId: null });

  // App Types / Modules tagged [SMOKE]
  for (const c of ["modules", "appTypes"]) {
    const snap = await db.collection(c).get();
    for (const d of snap.docs.filter((x) => String(x.get("name")).startsWith(SMOKE_TAG))) {
      await d.ref.delete();
      removed++;
    }
  }
  // Task key counter: reset only if no real tasks exist, so the first real task is TSK-1
  if ((await db.collection("tasks").limit(1).get()).empty) await db.doc("counters/tasks").delete();

  // Smoke users, including any created through the UI with the smoke domain
  const all = await auth.listUsers(1000);
  for (const u of all.users.filter((x) => x.email?.endsWith(`@${DOMAIN}`))) {
    await db.recursiveDelete(db.doc(`users/${u.uid}`));
    await auth.deleteUser(u.uid);
    removed++;
  }
  fs.rmSync(CREDS_FILE, { force: true });
  console.log(`Cleanup done: removed ${removed} smoke item(s). Your own data was not touched.`);
}

/** setup → Playwright smoke spec → cleanup (cleanup always runs). */
async function run() {
  await setup();
  let status = 1;
  try {
    const result = spawnSync("npx", ["playwright", "test", "-c", "playwright.smoke.config.ts"], {
      stdio: "inherit",
      shell: true,
    });
    status = result.status ?? 1;
  } finally {
    await cleanup();
  }
  console.log(status === 0 ? "SMOKE TEST PASSED" : "SMOKE TEST FAILED");
  process.exitCode = status;
}

async function main() {
  if (emulatorsEnabled()) console.log("(running against the local emulators)");
  const cmd = process.argv[2];
  if (cmd === "setup") await setup();
  else if (cmd === "cleanup") await cleanup();
  else if (cmd === "run") await run();
  else {
    console.error("Usage: npx tsx scripts/smoke.ts setup|cleanup|run");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
