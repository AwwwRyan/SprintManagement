import { describe, expect, it } from "vitest";
import {
  categoryForKind,
  displayStatus,
  filterSuggestions,
  statusSentence,
  taskDescriptionFor,
} from "@/lib/suggestions";

const base = { status: "added" as const, sprintName: "Release 3", taskKey: "TSK-301", declineReason: "" };

describe("suggestion status", () => {
  it("is Done once the linked task is Released, otherwise Added", () => {
    expect(displayStatus(base, "released")).toBe("done");
    expect(displayStatus(base, "done")).toBe("added"); // Ready to Release isn't live yet
    expect(displayStatus(base, undefined)).toBe("added");
    expect(displayStatus({ status: "new" }, "released")).toBe("new");
  });

  it("explains itself in plain words", () => {
    expect(statusSentence(base, "testing")).toBe("Added to Release 3 · TSK-301");
    expect(statusSentence(base, "released")).toBe("Done: released (Release 3 · TSK-301)");
    expect(statusSentence({ ...base, status: "not_planned", declineReason: "Duplicate" }, undefined)).toBe("Not planned: Duplicate");
    expect(statusSentence({ ...base, status: "new" }, undefined)).toBe("New: waiting to be looked at");
  });
});

describe("filterSuggestions", () => {
  const list = [
    { authorId: "u1", status: "new" as const },
    { authorId: "u2", status: "added" as const },
    { authorId: "u1", status: "not_planned" as const },
  ];
  it("filters All / Mine / New", () => {
    expect(filterSuggestions(list, "all", "u1")).toHaveLength(3);
    expect(filterSuggestions(list, "mine", "u1")).toHaveLength(2);
    expect(filterSuggestions(list, "new", "u1")).toEqual([list[0]]);
  });
});

describe("suggestion → task", () => {
  it("picks a sensible default category", () => {
    expect(categoryForKind("problem")).toBe("bug");
    expect(categoryForKind("idea")).toBe("improvement");
    expect(categoryForKind("design")).toBe("improvement");
    expect(categoryForKind("other")).toBe("task");
  });

  it("copies the details and credits who suggested it", () => {
    const d = taskDescriptionFor({ details: "Line one\nLine two" }, "Nagma", "26 Oct 2026");
    expect(d.descriptionText).toBe("Line one\nLine two\n\nSuggested by Nagma on 26 Oct 2026.");
    expect(JSON.parse(d.description).content).toHaveLength(4);
    expect(taskDescriptionFor({ details: "  " }, "Bala", "1 Nov 2026").descriptionText).toBe("Suggested by Bala on 1 Nov 2026.");
  });
});
