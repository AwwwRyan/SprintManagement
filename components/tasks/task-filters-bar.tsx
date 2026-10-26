"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search, X } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  parseFilters,
  UNASSIGNED,
  writeFilters,
  type TaskFilters,
} from "@/lib/task-filters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  appTypeOptions,
  priorityOptions,
  statusOptions,
  typeOptions,
  userOptions,
  type Option,
} from "./options";
import { DateFilterControl } from "./date-filter-control";

/** URL query string <-> filter state. Other params (e.g. ?task=) are preserved. */
export function useTaskFilters(): [TaskFilters, (next: TaskFilters) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useMemo(() => parseFilters(params), [params]);
  const setFilters = useCallback(
    (next: TaskFilters) => {
      const qs = writeFilters(new URLSearchParams(params.toString()), next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname],
  );
  return [filters, setFilters];
}

function MultiFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const count = selected.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn(count > 0 && "border-primary/50 bg-primary/5")}>
          {label}
          {count > 0 && (
            <span className="rounded bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{count}</span>
          )}
          <ChevronDown className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-max min-w-48 max-w-[calc(100vw-2rem)] overflow-y-auto">
        {options.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">No options</div>}
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) =>
              onChange(checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))
            }
          >
            {o.node ?? o.label}
          </DropdownMenuCheckboxItem>
        ))}
        {count > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Clear</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TaskFiltersBar({
  filters,
  onChange,
  hideAssignee,
}: {
  filters: TaskFilters;
  onChange: (f: TaskFilters) => void;
  hideAssignee?: boolean;
}) {
  const { appTypes, modules, users, appTypeById } = useData();

  // Search is debounced into the URL.
  const [q, setQ] = useState(filters.q);
  useEffect(() => setQ(filters.q), [filters.q]);
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => onChange({ ...filters, q }), 250);
    return () => clearTimeout(t);
  }, [q, filters, onChange]);

  // Module filter lists modules of the selected App Types (or all, grouped by App Type name).
  const moduleOpts: Option[] = modules
    .filter((m) => filters.appTypeId.length === 0 || filters.appTypeId.includes(m.appTypeId))
    .map((m) => ({ value: m.id, label: `${appTypeById.get(m.appTypeId)?.code ?? "?"} · ${m.name}` }));

  const assigneeOpts: Option[] = [{ value: UNASSIGNED, label: "Unassigned" }, ...userOptions(users)];

  return (
    <>
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, description, ID"
          className="h-8 pl-8"
          aria-label="Search tasks"
        />
      </div>
      <MultiFilter
        label="App Type"
        options={appTypeOptions(appTypes)}
        selected={filters.appTypeId}
        onChange={(v) => onChange({ ...filters, appTypeId: v })}
      />
      <MultiFilter
        label="Category"
        options={typeOptions}
        selected={filters.type}
        onChange={(v) => onChange({ ...filters, type: v as TaskFilters["type"] })}
      />
      <MultiFilter
        label="Module"
        options={moduleOpts}
        selected={filters.moduleId}
        onChange={(v) => onChange({ ...filters, moduleId: v })}
      />
      {!hideAssignee && (
        <MultiFilter
          label="Assignee"
          options={assigneeOpts}
          selected={filters.assigneeId}
          onChange={(v) => onChange({ ...filters, assigneeId: v })}
        />
      )}
      <MultiFilter
        label="Status"
        options={statusOptions}
        selected={filters.status}
        onChange={(v) => onChange({ ...filters, status: v as TaskFilters["status"] })}
      />
      <MultiFilter
        label="Priority"
        options={priorityOptions}
        selected={filters.priority}
        onChange={(v) => onChange({ ...filters, priority: v as TaskFilters["priority"] })}
      />
      <DateFilterControl value={filters.date} onChange={(date) => onChange({ ...filters, date })} />
      {hasActiveFilters(filters) && (
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
          <X /> Clear filters
        </Button>
      )}
    </>
  );
}
