import { describe, expect, it } from "vitest";
import { canGoToBacklog, planTaskMove } from "@/lib/move-plan";
import { BACKLOG_ID, type TaskStatus } from "@/types";

const t = (id: string, status: TaskStatus, sprintId = "s1", order = 1) => ({ id, taskKey: `TSK-${id}`, status, sprintId, order });

describe("canGoToBacklog", () => {
  it("keeps Ready to Release and Released tasks out of the Backlog", () => {
    expect(canGoToBacklog("done")).toBe(false);
    expect(canGoToBacklog("released")).toBe(false);
    for (const s of ["pending", "in_progress", "on_hold", "dev_done", "testing", "closed", "duplicate"] as const) {
      expect(canGoToBacklog(s)).toBe(true);
    }
  });
});

describe("planTaskMove", () => {
  it("moves tasks after the destination's last order, keeping their relative order", () => {
    const plan = planTaskMove([t("2", "pending", "s1", 20), t("1", "testing", "s1", 10)], "s2", 1000);
    expect(plan.moving.map((m) => [m.taskKey, m.newOrder, m.fromSprintId])).toEqual([
      ["TSK-1", 1001, "s1"],
      ["TSK-2", 1002, "s1"],
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips Ready to Release / Released tasks for the Backlog, and tasks already there", () => {
    const plan = planTaskMove([t("1", "pending"), t("2", "done"), t("3", "released"), t("4", "pending", BACKLOG_ID)], BACKLOG_ID, 0);
    expect(plan.moving.map((m) => m.taskKey)).toEqual(["TSK-1"]);
    expect(plan.skipped.map((s) => s.taskKey)).toEqual(["TSK-2", "TSK-3", "TSK-4"]);
  });

  it("lets Ready to Release tasks move between releases", () => {
    expect(planTaskMove([t("1", "done")], "s2", 0).moving).toHaveLength(1);
  });
});
