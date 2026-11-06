/**
 * Grid copy & paste (Ctrl+C on a cell, Ctrl+V onto selected cells in the same column). Pure, no
 * Firebase imports. A copied cell keeps its typed value; text pasted from elsewhere is parsed per
 * kind of column (option labels, user names, numbers, dates, plain text).
 */

export type PasteKind = "select" | "assignees" | "number" | "date" | "text";

export interface PasteOption {
  value: string;
  label: string;
}

/** What Ctrl+C put on the clipboard: the column (field and label), the typed value, and its text. */
export interface CellClip {
  field: string;
  /** column label, for messages ("Environment") */
  column: string;
  value: unknown;
  text: string;
}

export type ParseResult = { ok: true; value: unknown } | { ok: false; reason: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const isBlank = (s: string) => s.trim() === "" || s.trim() === "-";

/** Text from outside the app (or another column) → a value for a cell of this kind. */
export function parsePastedText(
  kind: PasteKind,
  raw: string,
  ctx: { options?: PasteOption[]; allowNone?: boolean; users?: { id: string; name: string }[] } = {},
): ParseResult {
  const text = raw.replace(/\r?\n$/, ""); // spreadsheets add a trailing newline
  switch (kind) {
    case "select": {
      if (isBlank(text)) return ctx.allowNone ? { ok: true, value: null } : { ok: false, reason: "This column can't be left empty" };
      const hit = (ctx.options ?? []).find((o) => norm(o.label) === norm(text) || o.value === text.trim());
      return hit ? { ok: true, value: hit.value } : { ok: false, reason: "Not one of this column's choices" };
    }
    case "assignees": {
      if (isBlank(text)) return { ok: true, value: [] };
      const ids: string[] = [];
      for (const name of text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)) {
        const u = (ctx.users ?? []).find((x) => norm(x.name) === norm(name));
        if (!u) return { ok: false, reason: `No one called “${name}” can be assigned` };
        if (!ids.includes(u.id)) ids.push(u.id);
      }
      return { ok: true, value: ids };
    }
    case "number": {
      if (isBlank(text)) return { ok: true, value: null };
      const n = Number(text.trim());
      return Number.isFinite(n) && n >= 0 ? { ok: true, value: n } : { ok: false, reason: "Not a number of hours" };
    }
    case "date": {
      if (isBlank(text)) return { ok: true, value: null };
      return DATE.test(text.trim()) ? { ok: true, value: text.trim() } : { ok: false, reason: "Not a date (dates look like 2026-11-05)" };
    }
    case "text":
      return { ok: true, value: text };
  }
}

/** The value to paste: the copied cell's own value when the clipboard still holds it, else the parsed text. */
export function valueToPaste(
  clip: CellClip | null,
  field: string,
  kind: PasteKind,
  text: string,
  ctx: Parameters<typeof parsePastedText>[2] = {},
): ParseResult {
  if (clip && clip.text === text && clip.field === field) return { ok: true, value: clip.value };
  return parsePastedText(kind, text, ctx);
}

/** Shift+click: every id between the anchor and the clicked row, in the order shown. */
export function rangeBetween(orderedIds: string[], anchorId: string | null, targetId: string): string[] {
  const to = orderedIds.indexOf(targetId);
  const from = anchorId === null ? -1 : orderedIds.indexOf(anchorId);
  if (to === -1) return [];
  if (from === -1) return [targetId];
  const [a, b] = from <= to ? [from, to] : [to, from];
  return orderedIds.slice(a, b + 1);
}

/** Two values are the same cell content (arrays compared as sets). */
export function sameCellValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x) => b.includes(x));
  return (a ?? null) === (b ?? null);
}
