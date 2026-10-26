"use client";

/** "Date" filter button: choose which date, then a quick pick or a custom range. */
import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import {
  DATE_FIELD_LABELS,
  DATE_FIELDS,
  DATE_PRESET_LABELS,
  DATE_PRESETS,
  describeDateFilter,
  matchingPreset,
  presetDates,
  type DateField,
  type DateFilter,
} from "@/lib/date-filter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function DateFilterControl({
  value,
  onChange,
  defaultField = "due",
}: {
  value: DateFilter | null;
  onChange: (next: DateFilter | null) => void;
  defaultField?: DateField;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<DateField>(value?.field ?? defaultField);
  // The range is kept locally too: the parent may apply changes asynchronously (e.g. through the
  // URL), and a quick From-then-To must not lose the From.
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({ from: value?.from ?? null, to: value?.to ?? null });
  useEffect(() => {
    if (value) setField(value.field);
    setRange({ from: value?.from ?? null, to: value?.to ?? null });
  }, [value]);
  const active = !!value && !!(value.from || value.to);
  const current = range.from || range.to ? range : null;
  const preset = current ? matchingPreset(current) : null;

  const set = (from: string | null, to: string | null) => {
    setRange({ from, to });
    onChange(from || to ? { field, from, to } : null);
  };

  return (
    <div className="inline-flex items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(active && "rounded-r-none border-primary/50 bg-primary/5")}
            aria-label={active ? `Date filter: ${describeDateFilter(value!)}` : "Filter by date"}
          >
            <CalendarDays className="opacity-60" />
            {active ? <span className="max-w-56 truncate">{describeDateFilter(value!)}</span> : "Date"}
            <ChevronDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-3">
          <div className="grid gap-3">
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Which date?</div>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Which date">
                {DATE_FIELDS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={field === f}
                    onClick={() => {
                      setField(f);
                      // keep the chosen range, apply it to the other date
                      if (current) onChange({ field: f, ...current });
                    }}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      field === f ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {DATE_FIELD_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Quick picks</div>
              <div className="grid grid-cols-2 gap-1.5">
                {DATE_PRESETS.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    variant={preset === p ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      const r = presetDates(p);
                      set(r.from, r.to);
                    }}
                  >
                    {DATE_PRESET_LABELS[p]}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Or choose dates</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs">
                  From
                  <Input type="date" value={current?.from ?? ""} max={current?.to ?? undefined} onChange={(e) => set(e.target.value || null, current?.to ?? null)} />
                </label>
                <label className="grid gap-1 text-xs">
                  To
                  <Input type="date" value={current?.to ?? ""} min={current?.from ?? undefined} onChange={(e) => set(current?.from ?? null, e.target.value || null)} />
                </label>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">Tasks without a {DATE_FIELD_LABELS[field].toLowerCase()} are hidden while this is on.</p>
            </div>

            <div className="flex justify-between border-t pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} disabled={!active}>
                Clear date
              </Button>
              <Button type="button" size="sm" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {active && (
        <Button variant="outline" size="sm" className="rounded-l-none border-l-0 border-primary/50 bg-primary/5 px-2" onClick={() => onChange(null)} aria-label="Clear date filter">
          <X />
        </Button>
      )}
    </div>
  );
}
