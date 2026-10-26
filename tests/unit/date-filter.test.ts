import { describe, expect, it } from "vitest";
import { describeDateFilter, matchesDate, matchingPreset, presetDates, taskDate } from "@/lib/date-filter";
import { applyFilters, EMPTY_FILTERS, hasActiveFilters, parseFilters, writeFilters } from "@/lib/task-filters";
import type { Task } from "@/types";

const wed = new Date("2026-10-28T12:00:00"); // a Wednesday
const ts = (s: string) => ({ toDate: () => new Date(s) });

describe("presetDates", () => {
  it("covers today, weeks (Monday start), rolling 7 days and months", () => {
    expect(presetDates("today", wed)).toEqual({ from: "2026-10-28", to: "2026-10-28" });
    expect(presetDates("this_week", wed)).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(presetDates("next_7", wed)).toEqual({ from: "2026-10-28", to: "2026-11-03" });
    expect(presetDates("last_7", wed)).toEqual({ from: "2026-10-22", to: "2026-10-28" });
    expect(presetDates("this_month", wed)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetDates("last_month", wed)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });
  it("recognises a preset for the button highlight and the label", () => {
    expect(matchingPreset({ from: "2026-10-26", to: "2026-11-01" }, wed)).toBe("this_week");
    expect(matchingPreset({ from: "2026-10-02", to: "2026-10-05" }, wed)).toBeNull();
    expect(describeDateFilter({ field: "due", from: "2026-10-26", to: "2026-11-01" }, wed)).toBe("Due date: This week");
    expect(describeDateFilter({ field: "created", from: "2026-10-02", to: "2026-10-05" }, wed)).toBe("Created: 2 Oct – 5 Oct");
    expect(describeDateFilter({ field: "release", from: "2026-11-03", to: null }, wed)).toBe("Release date: from 3 Nov");
  });
});

describe("matchesDate", () => {
  const task = { createdAt: ts("2026-10-20T23:30:00"), dueDate: "2026-10-30", releaseDate: null };
  it("uses the chosen date, inclusive at both ends", () => {
    expect(taskDate(task, "created")).toBe("2026-10-20");
    expect(matchesDate(task, { field: "due", from: "2026-10-30", to: "2026-10-30" })).toBe(true);
    expect(matchesDate(task, { field: "due", from: "2026-10-31", to: null })).toBe(false);
    expect(matchesDate(task, { field: "created", from: null, to: "2026-10-20" })).toBe(true);
  });
  it("hides tasks without that date, and passes everything when off", () => {
    expect(matchesDate(task, { field: "release", from: "2026-01-01", to: null })).toBe(false);
    expect(matchesDate(task, null)).toBe(true);
    expect(matchesDate(task, { field: "due", from: null, to: null })).toBe(true);
  });
});

describe("date filter in the task filters", () => {
  it("round-trips through the URL and keeps other params", () => {
    const f = { ...EMPTY_FILTERS, date: { field: "due" as const, from: "2026-10-01", to: "2026-10-31" } };
    const params = writeFilters(new URLSearchParams("task=TSK-1"), f);
    expect(params.toString()).toBe("task=TSK-1&date=due&from=2026-10-01&to=2026-10-31");
    expect(parseFilters(params)).toEqual(f);
    expect(hasActiveFilters(f)).toBe(true);
    expect(writeFilters(params, EMPTY_FILTERS).toString()).toBe("task=TSK-1");
  });
  it("ignores bad values in the URL", () => {
    expect(parseFilters(new URLSearchParams("date=nope&from=2026-10-01")).date).toBeNull();
    expect(parseFilters(new URLSearchParams("date=due&from=yesterday")).date).toBeNull();
    expect(parseFilters(new URLSearchParams("date=release&to=2026-12-31")).date).toEqual({ field: "release", from: null, to: "2026-12-31" });
  });
  it("filters tasks together with the other filters", () => {
    const tasks = [
      { id: "1", type: "bug", dueDate: "2026-10-29" },
      { id: "2", type: "bug", dueDate: "2026-11-15" },
      { id: "3", type: "task", dueDate: "2026-10-29" },
      { id: "4", type: "bug", dueDate: null },
    ].map((t) => ({ appTypeId: "a", moduleId: null, assigneeIds: [], status: "pending", priority: "medium", title: "", descriptionText: "", taskKey: "", ...t }) as unknown as Task);
    const f = { ...EMPTY_FILTERS, type: ["bug" as const], date: { field: "due" as const, from: "2026-10-26", to: "2026-11-01" } };
    expect(applyFilters(tasks, f).map((t) => t.id)).toEqual(["1"]);
  });
});
