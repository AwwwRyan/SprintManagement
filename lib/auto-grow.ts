/** Grows a textarea to fit its text (no inner scrollbar). Call on mount and on every change. */
export function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** Titles are one line of text that wraps visually: newlines (e.g. from paste) become spaces. */
export const singleLine = (v: string) => v.replace(/\s*\n+\s*/g, " ");
