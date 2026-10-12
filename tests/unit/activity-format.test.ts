import { describe, expect, it } from "vitest";
import { describeActivity, formatValue, type Lookups } from "@/lib/activity-format";

const lookups: Lookups = {
  userName: (id) => ({ u1: "Alice", u2: "Bob" })[id],
  appTypeName: (id) => ({ a1: "Portal" })[id],
  moduleName: (id) => ({ m1: "Billing" })[id],
};

describe("activity log formatting", () => {
  it("uses names instead of ids", () => {
    expect(
      describeActivity({ action: "updated", field: "assigneeId", oldValue: "u1", newValue: "u2" }, lookups),
    ).toBe("changed assignee from Alice to Bob");
    expect(describeActivity({ action: "updated", field: "assigneeId", oldValue: null, newValue: "u1" }, lookups)).toBe(
      "changed assignee from none to Alice",
    );
  });

  it("uses labels for enum values", () => {
    expect(
      describeActivity({ action: "updated", field: "status", oldValue: "in_progress", newValue: "ready_for_qa" }, lookups),
    ).toBe("changed status from In Progress to Ready for QA");
  });

  it("summarizes description edits without content", () => {
    expect(describeActivity({ action: "updated", field: "description", oldValue: null, newValue: null }, lookups)).toBe(
      "updated description",
    );
  });

  it("describes non-update actions", () => {
    expect(describeActivity({ action: "created", field: null, oldValue: null, newValue: "TSK-1" }, lookups)).toBe(
      "created this task",
    );
    expect(
      describeActivity({ action: "carried_over", field: "sprintId", oldValue: "Sprint 1", newValue: "Sprint 2" }, lookups),
    ).toBe("carried this task over from Sprint 1 to Sprint 2");
    expect(
      describeActivity({ action: "attachment_added", field: null, oldValue: null, newValue: "shot.png" }, lookups),
    ).toBe("added attachment shot.png");
    expect(
      describeActivity({ action: "attachment_removed", field: null, oldValue: "shot.png", newValue: null }, lookups),
    ).toBe("removed attachment shot.png");
  });

  it("formats hours, unknown ids and long text", () => {
    expect(formatValue("estimatedHours", 2.5, lookups)).toBe("2.5h");
    expect(formatValue("moduleId", "gone", lookups)).toBe("unknown module");
    expect(formatValue("title", "x".repeat(100), lookups)).toHaveLength(78);
  });
});
