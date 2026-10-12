"use client";

import { useEffect, useMemo, useState } from "react";
import { query } from "firebase/firestore";
import { col } from "@/lib/firebase/refs";
import { useLiveQuery } from "./use-live";
import { beat, leave } from "@/lib/services/presence";
import { PRESENCE_HEARTBEAT_MS, PRESENCE_STALE_MS } from "@/lib/constants";
import type { AppUser, PresenceViewer } from "@/types";

/**
 * Announces the current user as a viewer of `sprintId` (heartbeat every 30s, also re-sent
 * immediately when the viewed task changes) and returns the other users currently viewing.
 */
export function usePresence(sprintId: string | null, me: AppUser, viewingTaskId: string | null) {
  useEffect(() => {
    if (!sprintId) return;
    const send = () =>
      beat(sprintId, me.id, { name: me.name, initials: me.initials, viewingTaskId }).catch(() => undefined);
    send();
    const interval = setInterval(send, PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [sprintId, me.id, me.name, me.initials, viewingTaskId]);

  // Remove our viewer doc on unmount / tab close (best effort).
  useEffect(() => {
    if (!sprintId) return;
    const bye = () => void leave(sprintId, me.id).catch(() => undefined);
    window.addEventListener("beforeunload", bye);
    return () => {
      window.removeEventListener("beforeunload", bye);
      bye();
    };
  }, [sprintId, me.id]);

  const viewers = useLiveQuery<PresenceViewer>(sprintId ? `presence:${sprintId}` : null, () =>
    query(col.viewers(sprintId!)),
  );

  // Re-evaluate staleness periodically even when no snapshot arrives.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  return useMemo(
    () =>
      viewers.data.filter(
        (v) => v.id !== me.id && v.lastSeen && now - v.lastSeen.toMillis() < PRESENCE_STALE_MS,
      ),
    [viewers.data, me.id, now],
  );
}

/** "online" | "offline" (browser has no network) | "reconnecting" (network back, Firestore not synced yet). */
export function useConnectionStatus(fromCache: boolean): "online" | "offline" | "reconnecting" {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (!online) return "offline";
  return fromCache ? "reconnecting" : "online";
}
