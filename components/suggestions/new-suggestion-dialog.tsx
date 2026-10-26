"use client";

/** "Share a suggestion": three plain questions, pictures by click, drag or paste. */
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { createSuggestion } from "@/lib/services/suggestions";
import { notifyError } from "@/lib/notify";
import { ATTACHMENT_CONTENT_TYPES, ATTACHMENT_MAX_BYTES } from "@/lib/constants";
import { SUGGESTION_DETAILS_MAX, SUGGESTION_KIND_META, SUGGESTION_MAX_IMAGES, SUGGESTION_TITLE_MAX } from "@/lib/suggestions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SUGGESTION_KINDS, type SuggestionKind } from "@/types";

interface Picked {
  file: File;
  url: string;
}

export function NewSuggestionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { actor } = useCurrentUser();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [kind, setKind] = useState<SuggestionKind>("idea");
  const [pictures, setPictures] = useState<Picked[]>([]);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    pictures.forEach((p) => URL.revokeObjectURL(p.url));
    setTitle("");
    setDetails("");
    setKind("idea");
    setPictures([]);
    setTitleError(null);
  };
  // Free the preview URLs when the dialog unmounts (removals and resets free their own).
  const picturesRef = useRef(pictures);
  picturesRef.current = pictures;
  useEffect(() => () => picturesRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const addFiles = (files: File[]) => {
    const problems: string[] = [];
    const next = [...pictures];
    for (const f of files) {
      if (!(ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(f.type)) problems.push(`${f.name || "That file"} isn't a picture (PNG, JPG, WEBP or GIF).`);
      else if (f.size > ATTACHMENT_MAX_BYTES) problems.push(`${f.name} is larger than 10 MB.`);
      else if (next.length >= SUGGESTION_MAX_IMAGES) problems.push(`You can add up to ${SUGGESTION_MAX_IMAGES} pictures.`);
      else next.push({ file: f, url: URL.createObjectURL(f) });
    }
    setPictures(next);
    if (problems.length) toast.error([...new Set(problems)].join(" "));
  };

  const remove = (i: number) => {
    URL.revokeObjectURL(pictures[i].url);
    setPictures(pictures.filter((_, j) => j !== i));
  };

  const send = async () => {
    if (!title.trim()) {
      setTitleError("Please write your suggestion in a few words.");
      return;
    }
    setSending("Sending…");
    try {
      const { failed } = await createSuggestion({ title, details, kind }, pictures.map((p) => p.file), actor.uid, setSending);
      if (failed.length) toast.warning(`Your suggestion was sent, but ${failed.length} picture(s) couldn't be saved.`);
      else toast.success("Thanks! Your suggestion was sent.");
      reset();
      onOpenChange(false);
    } catch (err) {
      notifyError(err, "Couldn't send your suggestion");
    } finally {
      setSending(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (sending) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="max-h-[92svh] overflow-y-auto sm:max-w-xl"
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
          if (files.length) {
            e.preventDefault();
            addFiles(files);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">Share a suggestion</DialogTitle>
          <DialogDescription className="text-base">
            An idea, a problem, anything that would make your work easier. Everyone in the team can see suggestions.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-2">
            <label htmlFor="sg-title" className="text-base font-medium">
              1. What&rsquo;s your suggestion?
            </label>
            <Input
              id="sg-title"
              value={title}
              maxLength={SUGGESTION_TITLE_MAX}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(null);
              }}
              placeholder="For example: Show the due date on My Tasks"
              className="h-11 text-base"
              aria-invalid={!!titleError}
              aria-describedby={titleError ? "sg-title-error" : undefined}
              autoFocus
            />
            {titleError && (
              <p id="sg-title-error" className="text-sm text-destructive">
                {titleError}
              </p>
            )}
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-base font-medium">2. What is it about?</legend>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="What is it about?">
              {SUGGESTION_KINDS.map((k) => {
                const meta = SUGGESTION_KIND_META[k];
                const on = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setKind(k)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                    )}
                  >
                    <span className="text-xl leading-none" aria-hidden>
                      {meta.emoji}
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{meta.label}</span>
                      <span className="block text-xs text-muted-foreground">{meta.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-2">
            <label htmlFor="sg-details" className="text-base font-medium">
              3. Tell us more <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              id="sg-details"
              value={details}
              maxLength={SUGGESTION_DETAILS_MAX}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="What happens now, and what would make it better?"
              className="min-h-28 text-base"
            />
          </div>

          <div className="grid gap-2">
            <span className="text-base font-medium">
              4. Add pictures <span className="font-normal text-muted-foreground">(optional, up to {SUGGESTION_MAX_IMAGES})</span>
            </span>
            {pictures.length < SUGGESTION_MAX_IMAGES && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  addFiles(Array.from(e.dataTransfer.files));
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  dragOver ? "border-primary bg-primary/5" : "hover:bg-muted",
                )}
              >
                <ImagePlus className="size-7 text-muted-foreground" aria-hidden />
                <span className="text-sm font-medium">Click to choose pictures, or drag them here</span>
                <span className="text-xs text-muted-foreground">You can also paste a screenshot with Ctrl+V</span>
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={ATTACHMENT_CONTENT_TYPES.join(",")}
              multiple
              hidden
              aria-label="Choose pictures"
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            {pictures.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Pictures to send">
                {pictures.map((p, i) => (
                  <li key={p.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local preview (object URL) */}
                    <img src={p.url} alt={`Picture ${i + 1}`} className="aspect-square w-full rounded-md border object-cover" />
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      aria-label={`Remove picture ${i + 1}`}
                      className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={!!sending}>
            Cancel
          </Button>
          <Button size="lg" onClick={send} disabled={!!sending}>
            {sending ? (
              <>
                <Loader2 className="animate-spin" /> {sending}
              </>
            ) : (
              "Send suggestion"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
