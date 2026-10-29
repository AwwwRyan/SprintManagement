"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { EMPTY_FILTERS, hasActiveFilters, parseFilters, writeFilters, type TaskFilters } from "@/lib/task-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** URL query string <-> filter state. Other params (e.g. ?task=) are preserved. */
export function useTaskFilters(): [TaskFilters, (next: TaskFilters) => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const filters = useMemo(() => parseFilters(params), [params]);
  const setFilters = useCallback(
    (next: TaskFilters) => {
      const qs = writeFilters(new URLSearchParams(params.toString()), next).toString();
      // history.replaceState updates useSearchParams at once (no server round trip), so a quick
      // second click builds on the first instead of on stale filters
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [params, pathname],
  );
  return [filters, setFilters];
}

const filterStoreKey = (uid: string, view: string) => `stm.filters.${uid}.${view}`;
/** Filters as a query string without the search text (search isn't remembered). */
const storable = (f: TaskFilters) => writeFilters(new URLSearchParams(), { ...f, q: "" }).toString();

/**
 * Remembers each person's filters per view (release grid, My Tasks, Backlog, All Tasks) in this
 * browser and restores them when they come back, unless the link already carries filters.
 */
export function useRememberedFilters(uid: string, view: string, filters: TaskFilters, setFilters: (f: TaskFilters) => void) {
  const key = filterStoreKey(uid, view);
  // Until the restored filters show up in the URL, don't save (that would overwrite them with "none").
  const pending = useRef<string | null>(null);
  const restoredFor = useRef<string | null>(null);

  useEffect(() => {
    if (restoredFor.current === key) return;
    restoredFor.current = key;
    if (storable(filters)) return; // the link has filters: they win
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(key);
    } catch {
      /* storage unavailable */
    }
    if (!saved) return;
    pending.current = saved;
    setFilters({ ...parseFilters(new URLSearchParams(saved)), q: filters.q });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per view
  }, [key]);

  useEffect(() => {
    if (restoredFor.current !== key) return;
    const now = storable(filters);
    if (pending.current !== null) {
      if (now !== pending.current) return; // the restore hasn't reached the URL yet
      pending.current = null;
    }
    try {
      if (now) localStorage.setItem(key, now);
      else localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  }, [key, filters]);
}

/**
 * Above the table: search and "Clear filters" only. Every other filter is in its column header
 * (click a column name).
 */
export function TaskFiltersBar({ filters, onChange }: { filters: TaskFilters; onChange: (f: TaskFilters) => void }) {
  // Search is debounced into the URL.
  const [q, setQ] = useState(filters.q);
  useEffect(() => setQ(filters.q), [filters.q]);
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => onChange({ ...filters, q }), 250);
    return () => clearTimeout(t);
  }, [q, filters, onChange]);

  return (
    <>
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, description, ID"
          className="h-8 pl-8"
          aria-label="Search tasks"
        />
      </div>
      {hasActiveFilters(filters) ? (
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
          <X /> Clear filters
        </Button>
      ) : (
        <span className="hidden text-xs text-muted-foreground md:inline">Click a column name to sort or filter</span>
      )}
    </>
  );
}
