import { describe, expect, it } from "vitest";
import { sortSprints, suggestSprintName } from "@/lib/sprint-utils";

describe("sprint utils", () => {
  it("suggests the next sprint number", () => {
    expect(suggestSprintName([{ name: "Sprint 9" }, { name: "Sprint 14" }, { name: "Hotfix" }])).toBe("Sprint 15");
    expect(suggestSprintName([])).toBe("Sprint 1");
  });

  it("orders active, then planned (soonest), then closed (latest)", () => {
    const s = sortSprints([
      { id: "c1", status: "closed" as const, startDate: "2026-01-01" },
      { id: "p2", status: "planned" as const, startDate: "2026-04-01" },
      { id: "a", status: "active" as const, startDate: "2026-03-01" },
      { id: "c2", status: "closed" as const, startDate: "2026-02-01" },
      { id: "p1", status: "planned" as const, startDate: "2026-03-15" },
    ]);
    expect(s.map((x) => x.id)).toEqual(["a", "p1", "p2", "c2", "c1"]);
  });
});
