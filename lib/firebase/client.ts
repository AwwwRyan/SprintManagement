"use client";

/**
 * Client-side Firebase initialization (browser only).
 * - Firestore uses a persistent multi-tab local cache so brief disconnects are tolerated.
 * - When NEXT_PUBLIC_USE_EMULATORS=true, all SDKs connect to the local Emulator Suite.
 * - No Firebase Storage: the project runs on the free Spark plan, so attachments live in Firestore.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

export const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

interface ClientSdks {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let sdks: ClientSdks | null = null;

export function firebase(): ClientSdks {
  if (sdks) return sdks;
  if (typeof window === "undefined") {
    throw new Error("The Firebase client SDK is only available in the browser.");
  }
  const isNew = getApps().length === 0;
  const app = isNew ? initializeApp(firebaseConfig) : getApp();

  let db: Firestore;
  if (isNew) {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  } else {
    db = getFirestore(app);
  }
  const auth = getAuth(app);

  if (isNew && useEmulators) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }

  sdks = { app, auth, db };
  return sdks;
}

export const auth = () => firebase().auth;
export const db = () => firebase().db;
