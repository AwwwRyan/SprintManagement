import { describe, expect, it } from "vitest";
import { pageQueryKey, parseTaskNumber, serverFilters } from "@/lib/task-page";

describe("parseTaskNumber", () => {
  it("accepts TSK-142, tsk 142 and 142", () => {
    expect(parseTaskNumber("TSK-142")).toBe("TSK-142");
    expect(parseTaskNumber(" tsk 142 ")).toBe("TSK-142");
    expect(parseTaskNumber("142")).toBe("TSK-142");
    expect(parseTaskNumber("0042")).toBe("TSK-42");
  });
  it("leaves real text searches alone", () => {
    expect(parseTaskNumber("login 142")).toBeNull();
    expect(parseTaskNumber("")).toBeNull();
    expect(parseTaskNumber("TSK-")).toBeNull();
  });
});

describe("serverFilters", () => {
  it("sends Release, Status and Category to the database", () => {
    const r = serverFilters({ sprintId: ["s1", "s2"], status: ["pending"], type: ["bug", "task"] });
    expect(r.server).toEqual({ sprintIds: ["s1", "s2"], statuses: ["pending"], types: ["bug", "task"], environments: [] });
    expect(r.leftInBrowser).toEqual([]);
  });
  it("keeps within Firestore's 30 combinations, leaving the rest to the browser", () => {
    const statuses = ["pending", "in_progress", "on_hold", "dev_done", "testing", "done", "released", "closed", "duplicate"] as const;
    const r = serverFilters({ sprintId: ["s1", "s2", "s3", "s4"], status: [...statuses], type: ["bug"] });
    expect(r.server.sprintIds).toHaveLength(4);
    expect(r.server.statuses).toEqual([]); // 4 x 9 = 36 > 30
    expect(r.server.types).toEqual(["bug"]);
    expect(r.leftInBrowser).toEqual(["Status"]);
  });
  it("sends Environment too, with 'Not set' as an empty value", () => {
    const r = serverFilters({ sprintId: [], status: [], type: ["bug"], environment: ["Production", "__none__"] });
    expect(r.server.environments).toEqual(["Production", ""]);
  });
  it("gives a stable key whatever the selection order", () => {
    const a = pageQueryKey({ sprintIds: ["b", "a"], statuses: [], types: [], environments: [] }, null);
    const b = pageQueryKey({ sprintIds: ["a", "b"], statuses: [], types: [], environments: [] }, null);
    expect(a).toBe(b);
    expect(pageQueryKey({ sprintIds: [], statuses: [], types: [], environments: [] }, { createdAtMs: 5, id: "x" })).toContain("after=5:x");
  });
});
