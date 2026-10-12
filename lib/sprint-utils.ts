import type { Sprint } from "@/types";

/** Suggests "Sprint N+1" from existing names like "Sprint 14". */
export function suggestSprintName(sprints: Pick<Sprint, "name">[]): string {
  const nums = sprints
    .map((s) => /(\d+)\s*$/.exec(s.name)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return `Sprint ${nums.length ? Math.max(...nums) + 1 : 1}`;
}

/** Sorts sprints: active first, then planned (soonest first), then closed (most recent first). */
export function sortSprints<T extends Pick<Sprint, "status" | "startDate">>(sprints: T[]): T[] {
  const rank = { active: 0, planned: 1, closed: 2 } as const;
  return [...sprints].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return a.status === "planned" ? a.startDate.localeCompare(b.startDate) : b.startDate.localeCompare(a.startDate);
  });
}
