"use client";

import { useEffect, useState } from "react";
import { onSnapshot, type DocumentReference, type Query } from "firebase/firestore";
import { errorMessage } from "@/lib/utils";

export interface LiveResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

/**
 * Subscribes to a query with onSnapshot. `key` identifies the query: the listener is
 * re-created only when it changes (pass null to unsubscribe). Unsubscribes on unmount.
 */
export function useLiveQuery<T>(key: string | null, build: () => Query<T>): LiveResult<T[]> {
  const [state, setState] = useState<{ key: string | null } & LiveResult<T[]>>({
    key: null,
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (key === null) return;
    const unsub = onSnapshot(
      build(),
      (snap) => setState({ key, data: snap.docs.map((d) => d.data()), loading: false, error: null }),
      (err) => setState({ key, data: [], loading: false, error: errorMessage(err) }),
    );
    return unsub;
    // `build` is intentionally excluded: `key` fully describes the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (key === null) return { data: [], loading: false, error: null };
  // While a new key's first snapshot is pending, don't show the previous key's data.
  if (state.key !== key) return { data: [], loading: true, error: null };
  return state;
}

export function useLiveDoc<T>(key: string | null, build: () => DocumentReference<T>): LiveResult<T | null> {
  const [state, setState] = useState<{ key: string | null } & LiveResult<T | null>>({
    key: null,
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (key === null) return;
    const unsub = onSnapshot(
      build(),
      (snap) => setState({ key, data: snap.exists() ? snap.data() : null, loading: false, error: null }),
      (err) => setState({ key, data: null, loading: false, error: errorMessage(err) }),
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (key === null) return { data: null, loading: false, error: null };
  if (state.key !== key) return { data: null, loading: true, error: null };
  return state;
}
