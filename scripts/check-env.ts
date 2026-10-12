/**
 * Validates .env.local WITHOUT printing secret values, then checks the Admin SDK can reach
 * Auth and Firestore.   npm run check-env
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../lib/firebase/admin-core";

const e = process.env;
const checks: [string, boolean, string][] = [];
const add = (name: string, ok: boolean, hint = "") => checks.push([name, ok, hint]);

const pid = e.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
add("NEXT_PUBLIC_FIREBASE_API_KEY", /^AIza[\w-]{30,}$/.test(e.NEXT_PUBLIC_FIREBASE_API_KEY ?? ""), "should start with AIza");
add("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", (e.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "") === `${pid}.firebaseapp.com`, "should be <projectId>.firebaseapp.com");
add("NEXT_PUBLIC_FIREBASE_PROJECT_ID", /^[a-z0-9-]{4,}$/.test(pid) && !pid.startsWith("demo-"), "lowercase project id");
add("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", (e.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "").length > 0, "(unused, any value ok)");
add("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", /^\d{6,}$/.test(e.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? ""), "digits only");
add("NEXT_PUBLIC_FIREBASE_APP_ID", /^1:\d+:web:[0-9a-f]+$/.test(e.NEXT_PUBLIC_FIREBASE_APP_ID ?? ""), "looks like 1:123:web:abc");
add("FIREBASE_ADMIN_PROJECT_ID", e.FIREBASE_ADMIN_PROJECT_ID === pid, "must equal NEXT_PUBLIC_FIREBASE_PROJECT_ID");
add("FIREBASE_ADMIN_CLIENT_EMAIL", /^[^@\s]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(e.FIREBASE_ADMIN_CLIENT_EMAIL ?? ""), "…@<project>.iam.gserviceaccount.com");
const key = (e.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
add("FIREBASE_ADMIN_PRIVATE_KEY", key.startsWith("-----BEGIN PRIVATE KEY-----\n") && key.trim().endsWith("-----END PRIVATE KEY-----"), "full key incl. BEGIN/END lines, \\n kept");
add("NEXT_PUBLIC_USE_EMULATORS", e.NEXT_PUBLIC_USE_EMULATORS === "false", "should be false");

for (const [n, ok, hint] of checks) console.log(`${ok ? "OK  " : "FAIL"} ${n}${ok ? "" : `  -> ${hint}`}`);

async function live() {
  const app = getAdminApp();
  try {
    const list = await getAuth(app).listUsers(10);
    console.log(`OK   Admin SDK -> Auth reachable (${list.users.length} user(s) so far)`);
  } catch (err) {
    console.log(`FAIL Admin SDK -> Auth: ${(err as { code?: string }).code ?? (err as Error).message}`);
  }
  try {
    const admins = await getFirestore(app).collection("users").where("role", "==", "admin").get();
    console.log(`OK   Admin SDK -> Firestore reachable (${admins.size} admin profile(s))`);
  } catch (err) {
    console.log(`FAIL Admin SDK -> Firestore: ${(err as { code?: string | number }).code ?? ""} ${(err as Error).message.split("\n")[0]}`);
  }
}
if (checks.every(([, ok]) => ok)) live().then(() => process.exit(0));
