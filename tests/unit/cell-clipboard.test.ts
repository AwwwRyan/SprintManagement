import { describe, expect, it } from "vitest";
import { parsePastedText, rangeBetween, sameCellValue, valueToPaste } from "@/lib/cell-clipboard";

const statusOptions = [
  { value: "pending", label: "Backlog" },
  { value: "in_progress", label: "In Progress" },
];
const users = [
  { id: "u1", name: "Nagma" },
  { id: "u2", name: "Sameeh" },
];

describe("parsePastedText", () => {
  it("matches option labels (any case, extra spaces) or values", () => {
    expect(parsePastedText("select", "in  progress\n", { options: statusOptions })).toEqual({ ok: true, value: "in_progress" });
    expect(parsePastedText("select", "pending", { options: statusOptions })).toEqual({ ok: true, value: "pending" });
    expect(parsePastedText("select", "Shipped", { options: statusOptions }).ok).toBe(false);
  });

  it("allows an empty select only where the column can be empty", () => {
    expect(parsePastedText("select", "-", { options: statusOptions, allowNone: true })).toEqual({ ok: true, value: null });
    expect(parsePastedText("select", "", { options: statusOptions }).ok).toBe(false);
  });

  it("turns names into assignee ids", () => {
    expect(parsePastedText("assignees", "Nagma, sameeh", { users })).toEqual({ ok: true, value: ["u1", "u2"] });
    expect(parsePastedText("assignees", "Nobody", { users }).ok).toBe(false);
    expect(parsePastedText("assignees", "", { users })).toEqual({ ok: true, value: [] });
  });

  it("parses numbers and dates, and empties them", () => {
    expect(parsePastedText("number", "2.5")).toEqual({ ok: true, value: 2.5 });
    expect(parsePastedText("number", "abc").ok).toBe(false);
    expect(parsePastedText("date", "2026-11-05")).toEqual({ ok: true, value: "2026-11-05" });
    expect(parsePastedText("date", "05/11/2026").ok).toBe(false);
    expect(parsePastedText("date", "-")).toEqual({ ok: true, value: null });
  });
});

describe("valueToPaste", () => {
  it("uses the copied cell's own value when the clipboard still holds its text", () => {
    const clip = { field: "assigneeIds", column: "Assignees", value: ["u2", "u1"], text: "Sameeh, Nagma" };
    expect(valueToPaste(clip, "assigneeIds", "assignees", "Sameeh, Nagma", { users })).toEqual({ ok: true, value: ["u2", "u1"] });
    // something else was copied since: parse the text
    expect(valueToPaste(clip, "assigneeIds", "assignees", "Nagma", { users })).toEqual({ ok: true, value: ["u1"] });
  });
});

describe("rangeBetween", () => {
  const ids = ["a", "b", "c", "d"];
  it("covers the rows between anchor and target either way", () => {
    expect(rangeBetween(ids, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeBetween(ids, "d", "b")).toEqual(["b", "c", "d"]);
    expect(rangeBetween(ids, null, "c")).toEqual(["c"]);
    expect(rangeBetween(ids, "gone", "c")).toEqual(["c"]);
  });
});

it("sameCellValue compares lists as sets", () => {
  expect(sameCellValue(["a", "b"], ["b", "a"])).toBe(true);
  expect(sameCellValue(null, undefined)).toBe(true);
  expect(sameCellValue("x", "y")).toBe(false);
});
