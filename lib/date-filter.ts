/**
 * Date filter for tasks: pick which date (created / due / release) and an inclusive range.
 * Dates are compared as local "YYYY-MM-DD" strings. Pure, no Firebase imports.
 */
import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from "date-fns";
import type { DateString } from "@/types";

export const DATE_FIELDS = ["created", "due", "release"] as const;
export type DateField = (typeof DATE_FIELDS)[number];
export const DATE_FIELD_LABELS: Record<DateField, string> = { created: "Created", due: "Due date", release: "Release date" };

export interface DateFilter {
  field: DateField;
  /** inclusive; null = open-ended */
  from: DateString | null;
  to: DateString | null;
}

export const DATE_PRESETS = ["today", "this_week", "next_7", "last_7", "this_month", "last_month"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];
export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  this_week: "This week",
  next_7: "Next 7 days",
  last_7: "Last 7 days",
  this_month: "This month",
  last_month: "Last month",
};

const day = (d: Date) => format(d, "yyyy-MM-dd");

/** Weeks start on Monday. */
export function presetDates(preset: DatePreset, today: Date = new Date()): { from: DateString; to: DateString } {
  switch (preset) {
    case "today":
      return { from: day(today), to: day(today) };
    case "this_week":
      return { from: day(startOfWeek(today, { weekStartsOn: 1 })), to: day(endOfWeek(today, { weekStartsOn: 1 })) };
    case "next_7":
      return { from: day(today), to: day(addDays(today, 6)) };
    case "last_7":
      return { from: day(addDays(today, -6)), to: day(today) };
    case "this_month":
      return { from: day(startOfMonth(today)), to: day(endOfMonth(today)) };
    case "last_month": {
      const m = subMonths(today, 1);
      return { from: day(startOfMonth(m)), to: day(endOfMonth(m)) };
    }
  }
}

/** Which preset a filter currently equals (for highlighting), if any. */
export function matchingPreset(f: Pick<DateFilter, "from" | "to">, today: Date = new Date()): DatePreset | null {
  return DATE_PRESETS.find((p) => {
    const r = presetDates(p, today);
    return r.from === f.from && r.to === f.to;
  }) ?? null;
}

export interface DatedTask {
  createdAt?: { toDate(): Date } | null;
  dueDate?: DateString | null;
  releaseDate?: DateString | null;
}

export function taskDate(t: DatedTask, field: DateField): DateString | null {
  if (field === "due") return t.dueDate ?? null;
  if (field === "release") return t.releaseDate ?? null;
  return t.createdAt ? day(t.createdAt.toDate()) : null;
}

/** A task without the chosen date never matches an active date filter. */
export function matchesDate(t: DatedTask, f: DateFilter | null): boolean {
  if (!f || (!f.from && !f.to)) return true;
  const d = taskDate(t, f.field);
  if (!d) return false;
  if (f.from && d < f.from) return false;
  if (f.to && d > f.to) return false;
  return true;
}

const short = (d: DateString) => format(new Date(`${d}T00:00:00`), "d MMM");

/** e.g. "Due date: This week", "Created: 1 Oct – 15 Oct", "Release date: from 3 Nov". */
export function describeDateFilter(f: DateFilter, today: Date = new Date()): string {
  const label = DATE_FIELD_LABELS[f.field];
  const preset = matchingPreset(f, today);
  if (preset) return `${label}: ${DATE_PRESET_LABELS[preset]}`;
  if (f.from && f.to) return f.from === f.to ? `${label}: ${short(f.from)}` : `${label}: ${short(f.from)} – ${short(f.to)}`;
  if (f.from) return `${label}: from ${short(f.from)}`;
  if (f.to) return `${label}: until ${short(f.to)}`;
  return label;
}
