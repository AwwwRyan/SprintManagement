"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { onSnapshot } from "firebase/firestore";
import { toast } from "sonner";
import { auth } from "@/lib/firebase/client";
import { ref } from "@/lib/firebase/refs";
import type { Actor } from "@/lib/permissions";
import type { AppUser } from "@/types";

interface AuthState {
  /** true until we know whether someone is signed in (and have their profile). */
  loading: boolean;
  firebaseUser: User | null;
  profile: AppUser | null;
  actor: Actor | null;
  /** true while the Firestore connection is serving cached data (offline / reconnecting). */
  fromCache: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [profileResolved, setProfileResolved] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const claimRole = useRef<string | null>(null);

  const signOut = useCallback(async () => {
    await fbSignOut(auth());
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth(), async (user) => {
      claimRole.current = null;
      if (user) {
        try {
          claimRole.current = ((await user.getIdTokenResult()).claims.role as string | undefined) ?? null;
        } catch {
          // Revoked/disabled session: sign out instead of hanging on the loading screen.
          await fbSignOut(auth()).catch(() => undefined);
          return;
        }
      }
      setFirebaseUser(user);
      setProfile(null);
      setProfileResolved(!user);
      setAuthResolved(true);
    });
  }, []);

  // Live profile: kicks out deactivated users and refreshes the token when the role changes.
  useEffect(() => {
    if (!firebaseUser) return;
    const unsub = onSnapshot(
      ref.user(firebaseUser.uid),
      { includeMetadataChanges: true },
      async (snap) => {
        setFromCache(snap.metadata.fromCache);
        if (snap.metadata.fromCache && !snap.exists()) return; // wait for the server
        if (!snap.exists()) {
          toast.error("Your account is not set up. Ask an admin to create your user profile.");
          await fbSignOut(auth());
          return;
        }
        const data = snap.data();
        if (!data.active) {
          toast.error("Your account has been deactivated.");
          await fbSignOut(auth());
          return;
        }
        if (data.role !== claimRole.current) {
          // Role changed by an admin: refresh the ID token so security rules see the new claim.
          const result = await firebaseUser.getIdTokenResult(true);
          claimRole.current = (result.claims.role as string | undefined) ?? null;
        }
        setProfile(data);
        setProfileResolved(true);
      },
      (err) => {
        console.error("profile listener", err);
        setProfileResolved(true);
      },
    );
    return unsub;
  }, [firebaseUser]);

  const value = useMemo<AuthState>(() => {
    const actor: Actor | null =
      firebaseUser && profile ? { uid: firebaseUser.uid, role: profile.role, active: profile.active } : null;
    return {
      loading: !authResolved || !profileResolved,
      firebaseUser,
      profile,
      actor,
      fromCache,
      signOut,
    };
  }, [authResolved, profileResolved, firebaseUser, profile, fromCache, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** For components rendered inside the protected layout, where a signed-in profile is guaranteed. */
export function useCurrentUser(): { profile: AppUser; actor: Actor } {
  const { profile, actor } = useAuth();
  if (!profile || !actor) throw new Error("useCurrentUser used outside the protected layout");
  return { profile, actor };
}
