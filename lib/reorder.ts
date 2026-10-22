/**
 * Manual task ordering (drag and drop). A moved task gets an `order` halfway between its new
 * neighbours, so a move is normally one write. When the gap is used up (about 20 drops into the
 * same spot), the whole list is renumbered once. Pure, no Firebase imports.
 */

export const ORDER_STEP = 1000;
/** Below this gap a midpoint loses precision (orders are ~1.7e12 ms timestamps). */
const MIN_GAP = 0.01;

export interface OrderedItem {
  id: string;
  order: number;
}

export type MovePlan =
  | { kind: "none" }
  | { kind: "one"; id: string; order: number }
  | { kind: "renumber"; orders: OrderedItem[] };

/**
 * Plans moving `movedId` before or after `targetId`.
 * `items` is the full list (not only the visible rows), so hidden tasks keep their place.
 */
export function planMove(items: OrderedItem[], movedId: string, targetId: string, position: "before" | "after"): MovePlan {
  if (movedId === targetId) return { kind: "none" };
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const from = sorted.findIndex((t) => t.id === movedId);
  const rest = sorted.filter((t) => t.id !== movedId);
  const targetAt = rest.findIndex((t) => t.id === targetId);
  if (from < 0 || targetAt < 0) return { kind: "none" };

  const insertAt = position === "before" ? targetAt : targetAt + 1;
  if (insertAt === from) return { kind: "none" }; // dropped where it already is

  const prev = rest[insertAt - 1]?.order ?? null;
  const next = rest[insertAt]?.order ?? null;
  if (prev === null && next !== null) return { kind: "one", id: movedId, order: next - ORDER_STEP };
  if (next === null && prev !== null) return { kind: "one", id: movedId, order: prev + ORDER_STEP };
  if (prev !== null && next !== null && next - prev >= MIN_GAP * 2) {
    return { kind: "one", id: movedId, order: (prev + next) / 2 };
  }

  // No room left: renumber everything, keeping the last order where it was (new tasks still land last).
  const moved = sorted[from];
  const final = [...rest.slice(0, insertAt), moved, ...rest.slice(insertAt)];
  const last = Math.max(...sorted.map((t) => t.order));
  return {
    kind: "renumber",
    orders: final.map((t, i) => ({ id: t.id, order: last - (final.length - 1 - i) * ORDER_STEP })),
  };
}
