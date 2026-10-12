/**
 * Bootstraps the first Admin (there is no sign-up page).
 *
 *   npx tsx scripts/create-admin.ts --email you@company.com --password "S3cure-pass" --name "Your Name"
 *
 * Reads .env.local. With NEXT_PUBLIC_USE_EMULATORS=true it targets the local emulators,
 * otherwise the real project using the FIREBASE_ADMIN_* service-account credentials.
 * If the email already exists, the user is promoted to Admin (and reactivated).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { parseArgs } from "node:util";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { emulatorsEnabled, getAdminApp } from "../lib/firebase/admin-core";
import { initialsFromName } from "../lib/utils";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      password: { type: "string" },
      name: { type: "string" },
    },
  });
  const { email, password, name } = values;
  if (!email || !password || !name) {
    console.error('Usage: npx tsx scripts/create-admin.ts --email <email> --password <password> --name "<name>"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const app = getAdminApp();
  const auth = getAuth(app);
  const db = getFirestore(app);
  console.log(`Target: ${emulatorsEnabled() ? "LOCAL EMULATORS" : `project ${app.options.projectId}`}`);

  let uid: string;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    await auth.updateUser(uid, { password, displayName: name, disabled: false });
    console.log(`User ${email} exists; promoting to Admin.`);
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
    uid = (await auth.createUser({ email, password, displayName: name })).uid;
    console.log(`Created auth user ${email}.`);
  }

  await auth.setCustomUserClaims(uid, { role: "admin" });
  await db.doc(`users/${uid}`).set(
    {
      name,
      email: email.toLowerCase(),
      role: "admin",
      designation: "Administrator",
      active: true,
      initials: initialsFromName(name),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`Done. ${name} <${email}> is an Admin (uid ${uid}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
