import { describe, expect, it } from "vitest";
import { moveColumn, normalizeOrder, shiftColumn } from "@/lib/column-order";

const defaults = ["srNo", "taskKey", "app", "category", "task", "assignees", "status"];
const pinned = ["srNo", "taskKey"];

describe("normalizeOrder", () => {
  it("uses the default order when nothing is saved", () => {
    expect(normalizeOrder(null, defaults, pinned)).toEqual(defaults);
  });

  it("keeps pinned columns first even if the saved order says otherwise", () => {
    expect(normalizeOrder(["status", "srNo", "task", "app", "category", "assignees"], defaults, pinned)).toEqual([
      "srNo", "taskKey", "status", "task", "app", "category", "assignees",
    ]);
  });

  it("drops unknown or duplicate ids and slots new columns after their default neighbour", () => {
    // category follows app and assignees follows task by default, so that's where they land
    expect(normalizeOrder(["task", "gone", "app", "task", "status"], defaults, pinned)).toEqual([
      "srNo", "taskKey", "task", "assignees", "app", "category", "status",
    ]);
  });
});

describe("moveColumn / shiftColumn", () => {
  const order = normalizeOrder(null, defaults, pinned);

  it("moves a column before or after another", () => {
    expect(moveColumn(order, "status", "app", "before", pinned)).toEqual(["srNo", "taskKey", "status", "app", "category", "task", "assignees"]);
    expect(moveColumn(order, "app", "task", "after", pinned)).toEqual(["srNo", "taskKey", "category", "task", "app", "assignees", "status"]);
  });

  it("never moves pinned columns or drops anything among them", () => {
    expect(moveColumn(order, "srNo", "status", "after", pinned)).toEqual(order);
    expect(moveColumn(order, "status", "srNo", "before", pinned)).toEqual(["srNo", "taskKey", "status", "app", "category", "task", "assignees"]);
  });

  it("shifts one place left/right among the given columns, skipping others", () => {
    expect(shiftColumn(order, "task", -1, ["app", "task", "status"], pinned)).toEqual(["srNo", "taskKey", "task", "app", "category", "assignees", "status"]);
    expect(shiftColumn(order, "task", 1, ["app", "task", "status"], pinned)).toEqual(["srNo", "taskKey", "app", "category", "assignees", "status", "task"]);
    expect(shiftColumn(order, "app", -1, ["app", "task"], pinned)).toEqual(order); // already first
  });
});
