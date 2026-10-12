"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, useEditorState, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Code2, Heading2, Italic, List, ListOrdered, Quote, Strikethrough } from "lucide-react";
import { DESCRIPTION_AUTOSAVE_MS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function parseDescription(raw: string): JSONContent | string {
  if (!raw) return "";
  try {
    return JSON.parse(raw) as JSONContent;
  } catch {
    return raw; // legacy plain text
  }
}

/**
 * Tiptap editor with debounced autosave. While the user is typing, remote changes are
 * not applied (local edit wins); once the editor loses focus, remote content syncs in.
 */
export function RichTextEditor({
  value,
  editable,
  onSave,
  placeholder = "Add a description…",
}: {
  value: string;
  editable: boolean;
  onSave: (json: string, text: string) => void;
  placeholder?: string;
}) {
  const lastSaved = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder })],
    content: parseDescription(value),
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "tiptap prose-sm max-w-none px-3 py-2 text-sm", "aria-label": "Description" },
    },
    onUpdate: ({ editor: ed }) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        const json = ed.isEmpty ? "" : JSON.stringify(ed.getJSON());
        if (json === lastSaved.current) return;
        lastSaved.current = json;
        saveRef.current(json, ed.getText({ blockSeparator: "\n" }).slice(0, 5000));
      }, DESCRIPTION_AUTOSAVE_MS);
    },
  });

  // Flush a pending save when the editor unmounts (panel closed / switched task).
  useEffect(() => {
    return () => {
      if (timer.current && editor) {
        clearTimeout(timer.current);
        const json = editor.isEmpty ? "" : JSON.stringify(editor.getJSON());
        if (json !== lastSaved.current) saveRef.current(json, editor.getText({ blockSeparator: "\n" }).slice(0, 5000));
      }
    };
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  // Apply remote changes when not actively editing.
  useEffect(() => {
    if (!editor || editor.isFocused || timer.current) return;
    if (value === lastSaved.current) return;
    lastSaved.current = value;
    editor.commands.setContent(parseDescription(value), { emitUpdate: false });
  }, [editor, value]);

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            bold: ed.isActive("bold"),
            italic: ed.isActive("italic"),
            strike: ed.isActive("strike"),
            h2: ed.isActive("heading", { level: 2 }),
            bullet: ed.isActive("bulletList"),
            ordered: ed.isActive("orderedList"),
            code: ed.isActive("codeBlock"),
            quote: ed.isActive("blockquote"),
          }
        : null,
  });

  const tools = editor
    ? [
        { key: "bold", icon: Bold, label: "Bold", run: () => editor.chain().focus().toggleBold().run() },
        { key: "italic", icon: Italic, label: "Italic", run: () => editor.chain().focus().toggleItalic().run() },
        { key: "strike", icon: Strikethrough, label: "Strikethrough", run: () => editor.chain().focus().toggleStrike().run() },
        { key: "h2", icon: Heading2, label: "Heading", run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
        { key: "bullet", icon: List, label: "Bullet list", run: () => editor.chain().focus().toggleBulletList().run() },
        { key: "ordered", icon: ListOrdered, label: "Numbered list", run: () => editor.chain().focus().toggleOrderedList().run() },
        { key: "code", icon: Code2, label: "Code block", run: () => editor.chain().focus().toggleCodeBlock().run() },
        { key: "quote", icon: Quote, label: "Quote", run: () => editor.chain().focus().toggleBlockquote().run() },
      ]
    : [];

  return (
    <div className={cn("rounded-lg border", editable && "focus-within:ring-2 focus-within:ring-ring/40")}>
      {editable && (
        <div className="flex flex-wrap gap-0.5 border-b p-1" role="toolbar" aria-label="Formatting">
          {tools.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={t.run}
              aria-label={t.label}
              aria-pressed={!!state?.[t.key as keyof typeof state]}
              title={t.label}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
                state?.[t.key as keyof typeof state] && "bg-muted text-foreground",
              )}
            >
              <t.icon className="size-3.5" />
            </button>
          ))}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
