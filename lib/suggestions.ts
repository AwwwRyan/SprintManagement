/**
 * Suggestion box: wording, display status and the suggestion → task conversion. Pure, no Firebase.
 */
import type { Suggestion, SuggestionKind, TaskStatus, TaskType } from "@/types";

export const SUGGESTION_MAX_IMAGES = 5;
export const SUGGESTION_TITLE_MAX = 200;
export const SUGGESTION_DETAILS_MAX = 5000;

/** Plain words for every age group; the emoji gives a second, visual cue. */
export const SUGGESTION_KIND_META: Record<SuggestionKind, { emoji: string; label: string; hint: string }> = {
  idea: { emoji: "💡", label: "New idea", hint: "Something new the app could do" },
  problem: { emoji: "🐞", label: "Something's not working", hint: "An error or something behaving wrongly" },
  design: { emoji: "🎨", label: "Looks or ease of use", hint: "Hard to read, find or understand" },
  other: { emoji: "💬", label: "Other", hint: "Anything else" },
};

/** Default task category when a suggestion is added to a release (the person adding can change it). */
export function categoryForKind(kind: SuggestionKind): TaskType {
  if (kind === "problem") return "bug";
  if (kind === "other") return "task";
  return "improvement";
}

export type SuggestionDisplayStatus = "new" | "added" | "done" | "not_planned";

export const SUGGESTION_STATUS_META: Record<SuggestionDisplayStatus, { label: string; tone: string }> = {
  new: { label: "New", tone: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  added: { label: "Added to a release", tone: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  done: { label: "Done", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  not_planned: { label: "Not planned", tone: "bg-muted text-muted-foreground" },
};

/** An added suggestion counts as Done once its task is Released (looked up live, so it never goes stale). */
export function displayStatus(s: Pick<Suggestion, "status">, linkedTaskStatus: TaskStatus | undefined): SuggestionDisplayStatus {
  if (s.status === "added" && linkedTaskStatus === "released") return "done";
  return s.status;
}

/** One-line status sentence, e.g. "Added to Release 3 · TSK-301". */
export function statusSentence(
  s: Pick<Suggestion, "status" | "sprintName" | "taskKey" | "declineReason">,
  linkedTaskStatus: TaskStatus | undefined,
): string {
  const d = displayStatus(s, linkedTaskStatus);
  if (d === "new") return "New: waiting to be looked at";
  if (d === "not_planned") return s.declineReason ? `Not planned: ${s.declineReason}` : "Not planned";
  const where = [s.sprintName, s.taskKey].filter(Boolean).join(" · ");
  return d === "done" ? `Done: released${where ? ` (${where})` : ""}` : `Added to ${where || "a release"}`;
}

export type SuggestionFilter = "all" | "mine" | "new";

export function filterSuggestions<T extends Pick<Suggestion, "authorId" | "status">>(list: T[], filter: SuggestionFilter, uid: string): T[] {
  if (filter === "mine") return list.filter((s) => s.authorId === uid);
  if (filter === "new") return list.filter((s) => s.status === "new");
  return list;
}

/** Tiptap JSON (the task description format) from plain text: one paragraph per line. */
export function plainTextToDoc(lines: string[]): string {
  return JSON.stringify({
    type: "doc",
    content: lines.map((l) => ({ type: "paragraph", content: l ? [{ type: "text", text: l }] : [] })),
  });
}

/** Description of the task created from a suggestion: its details plus who suggested it and when. */
export function taskDescriptionFor(
  s: Pick<Suggestion, "details">,
  authorName: string,
  dateLabel: string,
): { description: string; descriptionText: string } {
  const lines = [...(s.details.trim() ? s.details.trim().split(/\r?\n/) : []), ...(s.details.trim() ? [""] : []), `Suggested by ${authorName} on ${dateLabel}.`];
  return { description: plainTextToDoc(lines), descriptionText: lines.join("\n") };
}
