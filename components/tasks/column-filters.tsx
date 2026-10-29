"use client";

/**
 * Column header menu: click a column name to sort it and filter by it. Filters live in the same
 * URL-backed TaskFilters as before; only the search box stays above the table.
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Filter } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { DATE_PRESET_LABELS, DATE_PRESETS, matchingPreset, presetDates, type DateField, type DateFilter } from "@/lib/date-filter";
import { UNASSIGNED, type TaskFilters } from "@/lib/task-filters";
import { NO_ENVIRONMENT } from "@/lib/task-model";
import { ENVIRONMENTS } from "@/lib/constants";
import { sortSprints } from "@/lib/sprint-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { appTypeOptions, priorityOptions, statusOptions, typeOptions, userOptions, type Option } from "./options";

type ListKey = "appTypeId" | "type" | "moduleId" | "assigneeId" | "status" | "priority" | "environment" | "sprintId";

/** Which filter a column controls (null: sort only). */
const LIST_FILTER: Record<string, ListKey> = {
  appTypeId: "appTypeId",
  type: "type",
  moduleId: "moduleId",
  assigneeIds: "assigneeId",
  status: "status",
  priority: "priority",
  environment: "environment",
  sprintId: "sprintId",
};
const DATE_FILTER: Record<string, DateField> = { dueDate: "due", releaseDate: "release", createdAt: "created" };

export const hasColumnFilter = (colId: string) => colId in LIST_FILTER || colId in DATE_FILTER;

export function isColumnFiltered(colId: string, f: TaskFilters): boolean {
  const key = LIST_FILTER[colId];
  if (key) return f[key].length > 0;
  const field = DATE_FILTER[colId];
  return !!field && !!f.date && f.date.field === field && !!(f.date.from || f.date.to);
}

function useListOptions(key: ListKey, f: TaskFilters): Option[] {
  const { appTypes, modules, users, appTypeById, sprints, backlog } = useData();
  switch (key) {
    case "appTypeId":
      return appTypeOptions(appTypes);
    case "type":
      return typeOptions;
    case "moduleId":
      return modules
        .filter((m) => f.appTypeId.length === 0 || f.appTypeId.includes(m.appTypeId))
        .map((m) => ({ value: m.id, label: `${appTypeById.get(m.appTypeId)?.code ?? "?"} · ${m.name}` }));
    case "assigneeId":
      return [{ value: UNASSIGNED, label: "Unassigned" }, ...userOptions(users)];
    case "status":
      return statusOptions;
    case "priority":
      return priorityOptions;
    case "environment":
      return [...ENVIRONMENTS.map((e) => ({ value: e, label: e })), { value: NO_ENVIRONMENT, label: "Not set" }];
    case "sprintId":
      return [
        ...(backlog ? [{ value: backlog.id, label: "Backlog" }] : []),
        ...sortSprints(sprints).map((s) => ({
          value: s.id,
          label: `${s.name}${s.status === "closed" ? " (closed)" : s.status === "active" ? " (active)" : ""}`,
        })),
      ];
  }
}

function ListFilter({ filterKey, filters, onChange }: { filterKey: ListKey; filters: TaskFilters; onChange: (f: TaskFilters) => void }) {
  const options = useListOptions(filterKey, filters);
  const selected = filters[filterKey] as string[];
  const toggle = (v: string, on: boolean) =>
    onChange({ ...filters, [filterKey]: on ? [...selected, v] : selected.filter((x) => x !== v) });
  if (options.length === 0) return <p className="px-1 py-1 text-xs text-muted-foreground">Nothing to filter by.</p>;
  const all = options.length > 0 && options.every((o) => selected.includes(o.value));
  return (
    <div className="grid gap-1">
      {/* tick everything, then untick the few you don't want */}
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 flex-1"
          disabled={all}
          onClick={() => onChange({ ...filters, [filterKey]: options.map((o) => o.value) })}
        >
          Select all
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 flex-1"
          disabled={selected.length === 0}
          onClick={() => onChange({ ...filters, [filterKey]: [] })}
        >
          Clear
        </Button>
      </div>
    <div className="grid max-h-64 gap-0.5 overflow-y-auto" role="group" aria-label="Filter values">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted">
            <Checkbox checked={on} onCheckedChange={(c) => toggle(o.value, !!c)} aria-label={o.label} />
            <span className="min-w-0 flex-1 truncate">{o.node ?? o.label}</span>
          </label>
        );
      })}
    </div>
    </div>
  );
}

function DateRangeFilter({ field, filters, onChange }: { field: DateField; filters: TaskFilters; onChange: (f: TaskFilters) => void }) {
  const current = filters.date && filters.date.field === field ? filters.date : null;
  // local copy so a quick From-then-To doesn't lose From while the URL catches up
  const [range, setRange] = useState({ from: current?.from ?? null, to: current?.to ?? null });
  const set = (from: string | null, to: string | null) => {
    setRange({ from, to });
    const date: DateFilter | null = from || to ? { field, from, to } : null;
    onChange({ ...filters, date });
  };
  const preset = range.from || range.to ? matchingPreset(range) : null;
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-1.5">
        {DATE_PRESETS.map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={preset === p ? "default" : "outline"}
            onClick={() => {
              const r = presetDates(p);
              set(r.from, r.to);
            }}
          >
            {DATE_PRESET_LABELS[p]}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs">
          From
          <Input type="date" value={range.from ?? ""} max={range.to ?? undefined} onChange={(e) => set(e.target.value || null, range.to)} />
        </label>
        <label className="grid gap-1 text-xs">
          To
          <Input type="date" value={range.to ?? ""} min={range.from ?? undefined} onChange={(e) => set(range.from, e.target.value || null)} />
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">Tasks without this date are hidden while the filter is on. One date filter at a time.</p>
    </div>
  );
}

function clearColumn(colId: string, f: TaskFilters): TaskFilters {
  const key = LIST_FILTER[colId];
  if (key) return { ...f, [key]: [] };
  if (DATE_FILTER[colId] && f.date?.field === DATE_FILTER[colId]) return { ...f, date: null };
  return f;
}

/** The clickable column name with its sort + filter menu. */
export function HeaderMenu({
  colId,
  label,
  sorted,
  onSort,
  filters,
  onFiltersChange,
}: {
  colId: string;
  label: React.ReactNode;
  sorted: false | "asc" | "desc";
  onSort: (dir: "asc" | "desc" | null) => void;
  filters?: TaskFilters;
  onFiltersChange?: (f: TaskFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const canFilter = !!filters && !!onFiltersChange && hasColumnFilter(colId);
  const filtered = canFilter && isColumnFiltered(colId, filters);
  const listKey = LIST_FILTER[colId];
  const dateField = DATE_FILTER[colId];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("inline-flex items-center gap-1 hover:text-foreground", filtered && "font-semibold text-foreground")}
          tabIndex={-1}
          aria-label={`${typeof label === "string" ? label : colId}: sort and filter`}
        >
          {label}
          {filtered && <Filter className="size-3 fill-current text-primary" aria-label="filtered" />}
          {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-30" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("p-2", dateField ? "w-80" : "w-64")} onClick={(e) => e.stopPropagation()}>
        <div className="grid gap-1">
          <div className="flex gap-1">
            <Button type="button" size="sm" variant={sorted === "asc" ? "default" : "ghost"} className="flex-1 justify-start" onClick={() => onSort("asc")}>
              <ArrowUp /> Sort A→Z
            </Button>
            <Button type="button" size="sm" variant={sorted === "desc" ? "default" : "ghost"} className="flex-1 justify-start" onClick={() => onSort("desc")}>
              <ArrowDown /> Sort Z→A
            </Button>
          </div>
          {sorted && (
            <Button type="button" size="sm" variant="ghost" className="justify-start text-muted-foreground" onClick={() => onSort(null)}>
              Back to the normal order
            </Button>
          )}
        </div>
        {canFilter && (
          <div className="mt-2 border-t pt-2">
            <div className="mb-1.5 flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">
              <span>Filter</span>
              {filtered && (
                <button type="button" className="text-primary hover:underline" onClick={() => onFiltersChange!(clearColumn(colId, filters!))}>
                  Clear
                </button>
              )}
            </div>
            {listKey && <ListFilter filterKey={listKey} filters={filters!} onChange={onFiltersChange!} />}
            {dateField && <DateRangeFilter field={dateField} filters={filters!} onChange={onFiltersChange!} />}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
