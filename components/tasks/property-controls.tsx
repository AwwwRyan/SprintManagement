"use client";

/**
 * Always-visible field controls for the side panel. Text-like controls keep a local draft while
 * focused (remote changes don't overwrite what you're typing) and save on blur / Enter.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { autoGrow, singleLine } from "@/lib/auto-grow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { NONE, type Option } from "./options";

function useDraft<T>(value: T) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  return { draft, setDraft, focused };
}

export function PropSelect({
  value,
  options,
  onChange,
  disabled,
  allowNone,
  noneLabel = "None",
  label,
}: {
  value: string | null;
  options: Option[];
  onChange: (v: string | null) => void;
  disabled?: boolean;
  allowNone?: boolean;
  noneLabel?: string;
  label: string;
}) {
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger size="sm" className="w-full border-transparent shadow-none hover:border-input" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {allowNone && (
          <SelectItem value={NONE}>
            <span className="text-muted-foreground">{noneLabel}</span>
          </SelectItem>
        )}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.node ?? o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const quietInput = "h-7 border-transparent shadow-none hover:border-input focus-visible:border-ring";

export function PropText({
  value,
  onSave,
  disabled,
  placeholder,
  label,
  className,
  required,
}: {
  value: string;
  onSave: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  label: string;
  className?: string;
  required?: boolean;
}) {
  const { draft, setDraft, focused } = useDraft(value);
  const commit = () => {
    focused.current = false;
    if (required && !draft.trim()) return setDraft(value);
    if (draft !== value) onSave(draft);
  };
  return (
    <Input
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={label}
      className={cn(quietInput, className)}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          focused.current = false;
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** Task title in the side panel: wraps onto more lines and grows as you type. Enter saves. */
export function PropTitle({
  value,
  onSave,
  disabled,
  label,
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  const { draft, setDraft, focused } = useDraft(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    autoGrow(ref.current);
  }, [draft]);
  // re-fit when the panel width changes (window resize)
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => autoGrow(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const commit = () => {
    focused.current = false;
    const next = draft.trim();
    if (!next) return setDraft(value); // a task always needs a title
    if (next !== value) onSave(next);
  };
  return (
    <textarea
      ref={ref}
      rows={1}
      maxLength={300}
      value={draft}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "block w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent leading-snug outline-none hover:border-input focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed",
        className,
      )}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setDraft(singleLine(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(value);
          focused.current = false;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function PropNumber({
  value,
  onSave,
  disabled,
  label,
}: {
  value: number | null;
  onSave: (v: number | null) => void;
  disabled?: boolean;
  label: string;
}) {
  const { draft, setDraft, focused } = useDraft(value === null ? "" : String(value));
  const commit = () => {
    focused.current = false;
    const n = draft.trim() === "" ? null : Math.round(Number(draft) * 2) / 2;
    if (n !== null && (!Number.isFinite(n) || n < 0)) return setDraft(value === null ? "" : String(value));
    if (n !== value) onSave(n);
  };
  return (
    <Input
      type="number"
      min={0}
      step={0.5}
      inputMode="decimal"
      value={draft}
      disabled={disabled}
      aria-label={label}
      placeholder="-"
      className={quietInput}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function PropDate({
  value,
  onSave,
  disabled,
  label,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Input
      type="date"
      value={value ?? ""}
      disabled={disabled}
      aria-label={label}
      className={quietInput}
      onChange={(e) => onSave(e.target.value || null)}
    />
  );
}

export function PropTextarea({
  value,
  onSave,
  disabled,
  label,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  disabled?: boolean;
  label: string;
  placeholder?: string;
}) {
  const { draft, setDraft, focused } = useDraft(value);
  return (
    <Textarea
      value={draft}
      disabled={disabled}
      aria-label={label}
      placeholder={placeholder}
      rows={3}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        focused.current = false;
        if (draft !== value) onSave(draft);
      }}
    />
  );
}
