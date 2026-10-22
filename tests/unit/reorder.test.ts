import { describe, expect, it } from "vitest";
import { ORDER_STEP, planMove } from "@/lib/reorder";

const items = [
  { id: "a", order: 1000 },
  { id: "b", order: 2000 },
  { id: "c", order: 3000 },
  { id: "d", order: 4000 },
];

describe("planMove", () => {
  it("puts the task halfway between its new neighbours (one write)", () => {
    expect(planMove(items, "d", "b", "before")).toEqual({ kind: "one", id: "d", order: 1500 });
    expect(planMove(items, "a", "c", "after")).toEqual({ kind: "one", id: "a", order: 3500 });
  });

  it("moves to the top or the bottom with one step of room", () => {
    expect(planMove(items, "c", "a", "before")).toEqual({ kind: "one", id: "c", order: 1000 - ORDER_STEP });
    expect(planMove(items, "a", "d", "after")).toEqual({ kind: "one", id: "a", order: 4000 + ORDER_STEP });
  });

  it("does nothing when dropped where it already is", () => {
    expect(planMove(items, "b", "b", "before")).toEqual({ kind: "none" });
    expect(planMove(items, "b", "c", "before")).toEqual({ kind: "none" }); // already right above c
    expect(planMove(items, "c", "b", "after")).toEqual({ kind: "none" });
    expect(planMove(items, "x", "b", "after")).toEqual({ kind: "none" });
  });

  it("works on unsorted input and ignores hidden rows' positions only by order", () => {
    const shuffled = [items[2], items[0], items[3], items[1]];
    expect(planMove(shuffled, "d", "a", "after")).toEqual({ kind: "one", id: "d", order: 1500 });
  });

  it("renumbers once the gap is used up, keeping the last order in place", () => {
    const tight = [
      { id: "a", order: 1_700_000_000_000 },
      { id: "b", order: 1_700_000_000_000.005 },
      { id: "c", order: 1_700_000_000_001 },
    ];
    const plan = planMove(tight, "c", "a", "after");
    expect(plan.kind).toBe("renumber");
    if (plan.kind !== "renumber") return;
    expect(plan.orders.map((o) => o.id)).toEqual(["a", "c", "b"]);
    expect(plan.orders.at(-1)!.order).toBe(1_700_000_000_001);
    expect(plan.orders[1].order - plan.orders[0].order).toBe(ORDER_STEP);
  });

  it("repeated drops into the same gap keep strict order", () => {
    let list = [...items];
    for (let i = 0; i < 30; i++) {
      const plan = planMove(list, i % 2 ? "c" : "d", "a", "after");
      if (plan.kind === "one") list = list.map((t) => (t.id === plan.id ? { ...t, order: plan.order } : t));
      if (plan.kind === "renumber") list = plan.orders;
      const orders = [...list].sort((x, y) => x.order - y.order).map((t) => t.order);
      expect(new Set(orders).size).toBe(orders.length);
    }
  });
});
