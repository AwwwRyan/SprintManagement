"use client";

import { orderBy, query, where } from "firebase/firestore";
import { col } from "@/lib/firebase/refs";
import { useLiveQuery } from "./use-live";
import type { Attachment, Suggestion, Task } from "@/types";

/** Every suggestion, newest first (everyone sees all). */
export function useSuggestions(enabled = true) {
  return useLiveQuery<Suggestion>(enabled ? "suggestions" : null, () => query(col.suggestions(), orderBy("createdAt", "desc")));
}

/** New suggestions only (sidebar badge for QA/Admin). */
export function useNewSuggestions(enabled: boolean) {
  return useLiveQuery<Suggestion>(enabled ? "suggestions:new" : null, () => query(col.suggestions(), where("status", "==", "new")));
}

export function useSuggestionImages(suggestionId: string | null) {
  return useLiveQuery<Attachment>(suggestionId ? `suggestion-images:${suggestionId}` : null, () =>
    query(col.suggestionImages(suggestionId!), orderBy("uploadedAt", "asc")),
  );
}

/** Tasks created from suggestions (to show "Done" once released). One listener, any release. */
export function useSuggestionTasks(enabled = true) {
  return useLiveQuery<Task>(enabled ? "tasks:from-suggestions" : null, () => query(col.tasks(), where("suggestionId", "!=", null)));
}
