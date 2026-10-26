"use client";

import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useSuggestions, useSuggestionTasks } from "@/lib/hooks/use-suggestions";
import { filterSuggestions, type SuggestionFilter } from "@/lib/suggestions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { NewSuggestionDialog } from "@/components/suggestions/new-suggestion-dialog";
import { SuggestionCard, SuggestionDetail, type SuggestionActions } from "@/components/suggestions/suggestion-parts";
import { AddToReleaseDialog, NotPlannedDialog } from "@/components/suggestions/triage-dialogs";
import type { Suggestion, TaskStatus } from "@/types";

const FILTERS: { key: SuggestionFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "new", label: "New" },
];

function SuggestionsPageInner() {
  const { actor } = useCurrentUser();
  const live = useSuggestions();
  const tasks = useSuggestionTasks();
  const [filter, setFilter] = useState<SuggestionFilter>("all");
  const [newOpen, setNewOpen] = useState(false);
  const [adding, setAdding] = useState<Suggestion | null>(null);
  const [declining, setDeclining] = useState<Suggestion | null>(null);

  // ?open=<id> opens a suggestion (e.g. from a task created from it)
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openId = params.get("open");
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("open", id);
    else next.delete("open");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const taskStatus = useMemo(() => new Map<string, TaskStatus>(tasks.data.map((t) => [t.id, t.status])), [tasks.data]);
  const statusOf = (s: Suggestion) => (s.taskId ? taskStatus.get(s.taskId) : undefined);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, filterSuggestions(live.data, f.key, actor.uid).length])) as Record<SuggestionFilter, number>,
    [live.data, actor.uid],
  );
  const shown = filterSuggestions(live.data, filter, actor.uid);
  const open = live.data.find((s) => s.id === openId) ?? null;
  const actions: SuggestionActions = { addToRelease: setAdding, notPlanned: setDeclining };

  return (
    <>
      <PageHeader
        title="Suggestions"
        description="Ideas and problems from the team. Anyone can share one, and everyone can see what happens to it."
        actions={
          <Button size="lg" onClick={() => setNewOpen(true)}>
            <Lightbulb /> Share a suggestion
          </Button>
        }
      />

      <div className="mb-4 inline-flex rounded-lg border p-1" role="tablist" aria-label="Show suggestions">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              filter === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label} <span className="tabular-nums opacity-70">({counts[f.key]})</span>
          </button>
        ))}
      </div>

      {live.loading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title={filter === "mine" ? "You haven't shared a suggestion yet" : filter === "new" ? "No new suggestions" : "No suggestions yet"}
          description="Spotted a problem, or have an idea that would make your work easier? Share it here."
          action={<Button onClick={() => setNewOpen(true)}>Share a suggestion</Button>}
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" aria-label="Suggestions">
          {shown.map((s) => (
            <SuggestionCard key={s.id} s={s} taskStatus={statusOf(s)} actions={actions} onOpen={() => setOpen(s.id)} />
          ))}
        </ul>
      )}

      <NewSuggestionDialog open={newOpen} onOpenChange={setNewOpen} />
      <SuggestionDetail s={open} taskStatus={open ? statusOf(open) : undefined} actions={actions} onClose={() => setOpen(null)} />
      <AddToReleaseDialog suggestion={adding} onClose={() => setAdding(null)} />
      <NotPlannedDialog suggestion={declining} onClose={() => setDeclining(null)} />
    </>
  );
}

export default function SuggestionsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <SuggestionsPageInner />
    </Suspense>
  );
}
