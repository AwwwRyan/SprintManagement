"use client";

import { toast } from "sonner";
import { errorMessage } from "@/lib/utils";

/** Centralized error reporting: logs and shows a toast. */
export function notifyError(err: unknown, context?: string): void {
  console.error(context ?? "error", err);
  const msg = errorMessage(err);
  toast.error(context ? `${context}: ${msg}` : msg);
}

/** Runs an async action, toasting on failure. Resolves to true on success. */
export async function attempt(action: () => Promise<unknown>, context?: string, success?: string): Promise<boolean> {
  try {
    await action();
    if (success) toast.success(success);
    return true;
  } catch (err) {
    notifyError(err, context);
    return false;
  }
}
