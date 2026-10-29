"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { FileDown, LayoutDashboard } from "lucide-react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { useSprintTasks } from "@/lib/hooks/use-tasks";
import { computeSprintMetrics, sprintProgress } from "@/lib/metrics";
import { canManageUsers } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { ReleaseOverview } from "@/components/dashboard/release-overview";
import { DashboardReport } from "@/components/dashboard/dashboard-report";
import { PdfPreviewDialog } from "@/components/dashboard/pdf-preview-dialog";
import { CategoryBreakdownCard } from "@/components/dashboard/category-breakdown";
import { DateFilterControl } from "@/components/tasks/date-filter-control";
import { describeDateFilter, matchesDate, type DateFilter } from "@/lib/date-filter";
import { SPRINT_STATUS_LABELS, TASK_TYPE_LABELS } from "@/lib/constants";
import { sortSprints } from "@/lib/sprint-utils";
import { elementToPdf } from "@/lib/export-pdf";
import { notifyError } from "@/lib/notify";
import { sanitizeFileName } from "@/lib/utils";
import { inProgressScope } from "@/lib/task-model";
import { TASK_TYPES, type TaskType } from "@/types";

const ALL = "__all__";

export default function DashboardPage() {
  const { actor } = useCurrentUser();
  const { activeSprint, sprints, sprintById, appTypes, users, loading } = useData();
  // Any release can be shown; the active one by default (then the most relevant: planned, then latest closed).
  const ordered = useMemo(() => sortSprints(sprints), [sprints]);
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const release = (releaseId ? sprintById.get(releaseId) : undefined) ?? activeSprint ?? ordered[0] ?? null;
  const live = useSprintTasks(release?.id ?? null, actor.uid);
  const [appTypeId, setAppTypeId] = useState(ALL);
  const [category, setCategory] = useState<TaskType | typeof ALL>(ALL);
  const [dateFilter, setDateFilter] = useState<DateFilter | null>(null);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ pdf: Blob; fileName: string } | null>(null);
  const isAdmin = canManageUsers(actor);

  // App Type and date filters apply everywhere; the category filter also narrows the top cards.
  // Everything counts only the work in flight: In Progress, Fixed, Testing, Ready to Release.
  const appTasks = useMemo(
    () => live.tasks.filter((t) => (appTypeId === ALL || t.appTypeId === appTypeId) && matchesDate(t, dateFilter)),
    [live.tasks, appTypeId, dateFilter],
  );
  const tasks = useMemo(
    () => appTasks.filter((t) => inProgressScope(t.status) && (category === ALL || t.type === category)),
    [appTasks, category],
  );
  const metrics = useMemo(() => computeSprintMetrics(tasks, users, appTypes), [tasks, users, appTypes]);
  const progress = useMemo(() => sprintProgress(tasks), [tasks]);

  // Admin "Export PDF": a report version of this view (same release and filters) is rendered
  // off-screen, captured once its charts have laid out, then removed; a preview opens before saving.
  const exportPdf = async () => {
    if (!release) return;
    setExporting(true);
    try {
      const started = Date.now();
      while (!reportRef.current && Date.now() - started < 5000) await new Promise((r) => requestAnimationFrame(r));
      if (!reportRef.current) throw new Error("The report didn't render");
      await new Promise((r) => setTimeout(r, 600)); // charts measure their container first
      const pdf = await elementToPdf(reportRef.current);
      setPreview({ pdf, fileName: `${sanitizeFileName(`Dashboard ${release.name}`)}_${format(new Date(), "yyyy-MM-dd")}.pdf` });
    } catch (err) {
      notifyError(err, "Couldn't create the PDF");
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <Skeleton className="h-96" />;
  if (!release)
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState
          icon={LayoutDashboard}
          title="No releases yet"
          description="Create a release under Releases; its progress shows up here."
          action={
            <Button asChild variant="outline">
              <Link href="/releases">Go to releases</Link>
            </Button>
          }
        />
      </>
    );

  const fmt = (d: string) => format(parseISO(d), "MMM d");

  const activeFilters = [
    category !== ALL && `Category: ${TASK_TYPE_LABELS[category]}`,
    appTypeId !== ALL && `App Type: ${appTypes.find((a) => a.id === appTypeId)?.name ?? "Unknown"}`,
    dateFilter && `Date: ${describeDateFilter(dateFilter)}`,
  ].filter((f): f is string => Boolean(f));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          <>
            <Link href={`/releases/${release.id}`} className="font-medium text-foreground hover:underline">
              {release.name}
            </Link>{" "}
            · {fmt(release.startDate)} to {fmt(release.endDate)} · {live.tasks.length} tasks in this release
            {release.status === "closed" && (
              <>
                {" "}
                · closed: carried-over tasks have moved on (
                <Link href={`/releases/${release.id}/report`} className="underline underline-offset-2">
                  see its report
                </Link>
                )
              </>
            )}
          </>
        }
        actions={
          <>
            <Select value={release.id} onValueChange={setReleaseId}>
              <SelectTrigger className="w-56" aria-label="Release shown on the dashboard">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {ordered.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} <span className="text-muted-foreground">({SPRINT_STATUS_LABELS[s.status].toLowerCase()})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DateFilterControl value={dateFilter} onChange={setDateFilter} defaultField="created" />
            <Select value={category} onValueChange={(v) => setCategory(v as TaskType | typeof ALL)}>
              <SelectTrigger className="w-44" aria-label="Filter dashboard by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={ALL}>All categories</SelectItem>
                {TASK_TYPES.map((ty) => (
                  <SelectItem key={ty} value={ty}>
                    {TASK_TYPE_LABELS[ty]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={appTypeId} onValueChange={setAppTypeId}>
              <SelectTrigger className="w-48" aria-label="Filter dashboard by App Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={ALL}>All App Types</SelectItem>
                {appTypes.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Button variant="outline" onClick={exportPdf} disabled={exporting || live.loading}>
                <FileDown /> {exporting ? "Preparing PDF…" : "Export PDF"}
              </Button>
            )}
          </>
        }
      />

      {live.loading ? (
        <div className="grid gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className="grid gap-4">
          {/* the release as a whole, then per category down to the individual items */}
          <ReleaseOverview metrics={metrics} progress={progress} />
          <CategoryBreakdownCard tasks={appTasks} sprint={release} only={category === ALL ? null : category} />
        </div>
      )}

      {exporting && (
        <div aria-hidden className="pointer-events-none fixed top-0 -left-[20000px]">
          <DashboardReport
            ref={reportRef}
            release={release}
            totalTasks={live.tasks.length}
            filters={activeFilters}
            metrics={metrics}
            progress={progress}
            breakdownTasks={appTasks}
            only={category === ALL ? null : category}
          />
        </div>
      )}
      <PdfPreviewDialog pdf={preview?.pdf ?? null} fileName={preview?.fileName ?? ""} onClose={() => setPreview(null)} />
    </>
  );
}
