/**
 * Admin app initialization shared by Route Handlers and the CLI scripts (scripts/*.ts).
 * Kept free of "server-only" so `npx tsx` scripts can import it.
 */
import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";

export function emulatorsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
}

export function getAdminApp(): App {
  if (getApps().length) return getApp();

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (emulatorsEnabled()) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
    // No real credentials locally: stop google-auth-library probing the GCP metadata server,
    // which otherwise adds a ~10s timeout to the first Admin SDK call.
    process.env.METADATA_SERVER_DETECTION ??= "none";
    if (projectId) process.env.GOOGLE_CLOUD_PROJECT ??= projectId;
    return initializeApp({ projectId });
  }

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Vercel/.env store the key with literal "\n" sequences; restore real newlines.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY.",
    );
  }
  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}
