"use client";

/**
 * Multiple assignees: a display ("Nagma, Sameeh" with stacked avatars) and a searchable
 * checkbox picker used by the table cell, the side panel and the New Task form.
 */
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { UserAvatar } from "@/components/common/user-avatar";
import { cn } from "@/lib/utils";

/** Read-only display of a task's assignees. `wrap`: names run onto more lines instead of being cut off. */
export function AssigneeStack({ ids, max = 3, wrap = false }: { ids: string[]; max?: number; wrap?: boolean }) {
  const { userById } = useData();
  if (ids.length === 0) return <span className="text-muted-foreground">Unassigned</span>;
  const users = ids.map((id) => userById.get(id));
  const names = users.map((u) => u?.name ?? "Unknown user").join(", ");
  return (
    <span className={cn("min-w-0 gap-1.5", wrap ? "flex items-start" : "inline-flex items-center")} title={names}>
      <span className="flex shrink-0 -space-x-1.5">
        {ids.slice(0, max).map((id, i) => (
          <UserAvatar key={id} id={id} initials={users[i]?.initials ?? "?"} name={users[i]?.name} size="xs" className="ring-2 ring-background" />
        ))}
        {ids.length > max && (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold ring-2 ring-background">
            +{ids.length - max}
          </span>
        )}
      </span>
      <span className={wrap ? "min-w-0 break-words whitespace-normal" : "truncate"}>{names}</span>
    </span>
  );
}

/** The checkbox list itself (reused inside a popover). */
function AssigneeList({ value, onToggle }: { value: string[]; onToggle: (id: string) => void }) {
  const { users } = useData();
  // Active users, plus anyone already assigned even if deactivated since.
  const options = users.filter((u) => u.active || value.includes(u.id));
  return (
    <Command>
      <CommandInput placeholder="Search people…" />
      <CommandList>
        <CommandEmpty>No one found.</CommandEmpty>
        {options.map((u) => {
          const on = value.includes(u.id);
          return (
            <CommandItem key={u.id} value={u.name} onSelect={() => onToggle(u.id)} aria-checked={on} role="option">
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-sm border",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                )}
                aria-hidden
              >
                {on && <Check className="size-3" />}
              </span>
              <UserAvatar id={u.id} initials={u.initials} name={u.name} size="xs" />
              <span className={cn(!u.active && "text-muted-foreground line-through")}>{u.name}</span>
            </CommandItem>
          );
        })}
      </CommandList>
    </Command>
  );
}

const toggleIn = (value: string[], id: string) => (value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

/** Trigger + popover picker. Changes apply on each click (side panel / form). */
export function AssigneePicker({
  value,
  onChange,
  disabled,
  label = "Assignees",
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={label}
          className="flex h-auto min-h-7 w-full items-center justify-between gap-2 rounded-lg border border-transparent px-2.5 py-1 text-left text-sm hover:border-input disabled:cursor-not-allowed disabled:opacity-50"
        >
          <AssigneeStack ids={value} />
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <AssigneeList value={value} onToggle={(id) => onChange(toggleIn(value, id))} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Table-cell editor: opens immediately; the selection is saved once when the popover closes
 * (one write + one activity entry, instead of one per click). Escape inside the search clears it.
 */
export function AssigneeCellEditor({
  initial,
  onCommit,
}: {
  initial: string[];
  onCommit: (ids: string[]) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Popover defaultOpen onOpenChange={(open) => !open && onCommit(value)}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-7 w-full items-center rounded-sm border border-ring px-2 text-left text-sm ring-2 ring-ring/30">
          <AssigneeStack ids={value} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start" onKeyDown={(e) => e.stopPropagation()}>
        <AssigneeList value={value} onToggle={(id) => setValue((v) => toggleIn(v, id))} />
      </PopoverContent>
    </Popover>
  );
}
