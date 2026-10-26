/**
 * Per-user column order for the task grid. Pinned (sticky) columns always stay first, in their
 * default order; saved orders are repaired when columns are added or removed. Pure.
 */

/** Pinned first, then the saved order (known ids only), then any columns the saved order lacks, in default position. */
export function normalizeOrder(saved: readonly string[] | null, defaults: readonly string[], pinned: readonly string[]): string[] {
  const pins = defaults.filter((id) => pinned.includes(id));
  const movable = defaults.filter((id) => !pinned.includes(id));
  const kept = (saved ?? []).filter((id, i, arr) => movable.includes(id) && arr.indexOf(id) === i);
  const out = [...kept];
  // New columns go right after the column that precedes them by default.
  for (const id of movable) {
    if (out.includes(id)) continue;
    const before = movable.slice(0, movable.indexOf(id)).reverse().find((x) => out.includes(x));
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, id);
  }
  return [...pins, ...out];
}

/** Moves `id` before/after `targetId`. Pinned columns never move and nothing lands among them. */
export function moveColumn(order: readonly string[], id: string, targetId: string, pos: "before" | "after", pinned: readonly string[]): string[] {
  if (id === targetId || pinned.includes(id) || !order.includes(id) || !order.includes(targetId)) return [...order];
  const rest = order.filter((x) => x !== id);
  let at = rest.indexOf(targetId) + (pos === "after" ? 1 : 0);
  const firstMovable = rest.findIndex((x) => !pinned.includes(x));
  at = Math.max(at, firstMovable === -1 ? rest.length : firstMovable);
  rest.splice(at, 0, id);
  return rest;
}

/** Moves `id` one place left (-1) or right (+1) among the visible movable columns. */
export function shiftColumn(order: readonly string[], id: string, delta: -1 | 1, visible: readonly string[], pinned: readonly string[]): string[] {
  const seq = order.filter((x) => visible.includes(x) && !pinned.includes(x));
  const i = seq.indexOf(id);
  const neighbour = seq[i + delta];
  if (i < 0 || !neighbour) return [...order];
  return moveColumn(order, id, neighbour, delta === 1 ? "after" : "before", pinned);
}
