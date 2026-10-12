"use client";

import { useEffect, useState } from "react";
import { CloudOff, Loader2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useConnectionStatus } from "@/lib/hooks/use-presence";

/** Small "Offline / Reconnecting…" pill. Waits 2s before showing so brief blips don't flash it. */
export function ConnectionIndicator() {
  const { fromCache } = useAuth();
  const status = useConnectionStatus(fromCache);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === "online") {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(t);
  }, [status]);

  if (!visible || status === "online") return null;
  return (
    <div
      role="status"
      className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      {status === "offline" ? <CloudOff className="size-3.5" /> : <Loader2 className="size-3.5 animate-spin" />}
      {status === "offline" ? "Offline: changes will sync when you reconnect" : "Reconnecting…"}
    </div>
  );
}
