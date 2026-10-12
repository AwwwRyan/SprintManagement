import "server-only";

/**
 * Firebase Admin SDK, used ONLY from Route Handlers (app/api/...) and never bundled for the client.
 * Credentials come from FIREBASE_ADMIN_* env vars. With NEXT_PUBLIC_USE_EMULATORS=true,
 * it talks to the local Auth/Firestore emulators and needs no credentials.
 */
import { getAdminApp } from "./admin-core";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = () => getFirestore(getAdminApp());
