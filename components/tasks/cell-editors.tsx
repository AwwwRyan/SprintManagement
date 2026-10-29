"use client";

/**
 * Inline editors used inside table cells. Each keeps its own draft state, so a remote update
 * to the same field never clobbers what the user is typing; the draft wins until commit/cancel.
 * Enter / blur / select commits; Escape cancels.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { autoGrow, singleLine } from "@/lib/auto-grow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NONE, type Option } from "./options";

interface EditorProps<V> {
  initial: V;
  onCommit: (value: V) => void;
  onCancel: () => void;
}

const inputClass =
  "h-full w-full min-w-0 rounded-sm border border-ring bg-background px-2 py-1 text-sm outline-none ring-2 ring-ring/30";

export function TextCellEditor({ initial, onCommit, onCancel, required }: EditorProps<string> & { required?: boolean }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    if (required && !value.trim()) onCancel();
    else onCommit(value);
  };
  return (
    <input
      autoFocus
      className={inputClass}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          done.current = true;
          onCancel();
        }
      }}
    />
  );
}

/**
 * Task title in the table: wraps and grows with the text (no sideways scrolling). Enter saves,
 * Escape cancels, blur saves; an empty title is refused (the old one is kept).
 */
export function TitleCellEditor({ initial, onCommit, onCancel }: EditorProps<string>) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    autoGrow(ref.current);
  }, [value]);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    if (!value.trim()) onCancel();
    else onCommit(value.trim());
  };
  return (
    <textarea
      ref={ref}
      autoFocus
      rows={1}
      maxLength={300}
      aria-label="Task"
      className={`${inputClass} block resize-none overflow-hidden leading-snug font-medium`}
      value={value}
      onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
      onChange={(e) => setValue(singleLine(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          done.current = true;
          onCancel();
        }
      }}
    />
  );
}

/** Multi-line text: Enter saves, Shift+Enter adds a line, Escape cancels, blur saves. */
export function TextareaCellEditor({ initial, onCommit, onCancel }: EditorProps<string>) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    onCommit(value);
  };
  return (
    <textarea
      autoFocus
      rows={3}
      maxLength={2000}
      className={`${inputClass} resize-y`}
      value={value}
      onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          done.current = true;
          onCancel();
        }
      }}
    />
  );
}

export function NumberCellEditor({ initial, onCommit, onCancel }: EditorProps<number | null>) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    if (value.trim() === "") return onCommit(null);
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return onCancel();
    onCommit(Math.round(n * 2) / 2);
  };
  return (
    <input
      autoFocus
      type="number"
      min={0}
      step={0.5}
      inputMode="decimal"
      className={inputClass}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          done.current = true;
          onCancel();
        }
      }}
    />
  );
}

export function DateCellEditor({ initial, onCommit, onCancel }: EditorProps<string | null>) {
  const [value, setValue] = useState(initial ?? "");
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    onCommit(value || null);
  };
  return (
    <input
      autoFocus
      type="date"
      className={inputClass}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          done.current = true;
          onCancel();
        }
      }}
    />
  );
}

/** Opens immediately; choosing an option commits, closing without choosing cancels. */
export function SelectCellEditor({
  initial,
  onCommit,
  onCancel,
  options,
  allowNone,
  noneLabel = "None",
}: EditorProps<string | null> & { options: Option[]; allowNone?: boolean; noneLabel?: string }) {
  const committed = useRef(false);
  return (
    <Select
      defaultOpen
      value={initial ?? NONE}
      onValueChange={(v) => {
        committed.current = true;
        onCommit(v === NONE ? null : v);
      }}
      onOpenChange={(open) => {
        if (!open && !committed.current) onCancel();
      }}
    >
      <SelectTrigger size="sm" className="h-7 w-full border-ring">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" onKeyDown={(e) => e.stopPropagation()}>
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
