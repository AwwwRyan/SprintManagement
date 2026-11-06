"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeft, FileBarChart, FileDown } from "lucide-react";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { useReport, useSprintTasks } from "@/lib/hooks/use-tasks";
import { sanitizeFileName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/empty-state";
import { ExportModeContext } from "@/components/dashboard/export-mode";
import { REPORT_WIDTH } from "@/components/dashboard/dashboard-report";
import { PdfPreviewDialog } from "@/components/dashboard/pdf-preview-dialog";
import { usePdfExport } from "@/components/dashboard/use-pdf-export";
import { ReleaseReportView } from "@/components/reports/release-report-view";
import type { Sprint, SprintReport } from "@/types";

function ReportHeader({ report, sprint }: { report: SprintReport; sprint: Sprint | undefined }) {
  const fmt = (d: string) => format(parseISO(d), "MMM d, yyyy");
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{report.sprintName}: Release report</h1>
      <p className="text-sm text-muted-foreground">
        {fmt(report.startDate)} to {fmt(report.endDate)}
        {sprint?.closedAt && ` · closed ${format(sprint.closedAt.toDate(), "MMM d, yyyy")}`}
      </p>
      {report.goal && <p className="mt-1 text-sm">Goal: {report.goal}</p>}
    </div>
  );
}

export default function SprintReportPage() {
  const { sprintId } = useParams<{ sprintId: string }>();
  const { actor } = useCurrentUser();
  const { sprintById } = useData();
  const { data: report, loading } = useReport(sprintId);
  // released / cancelled tasks stay in the closed release, so they're read live
  const live = useSprintTasks(sprintId, actor.uid);
  const sprint = sprintById.get(sprintId);
  const pdfExport = usePdfExport();

  if (loading || live.loading) return <Skeleton className="h-96" />;
  if (!report)
    return (
      <EmptyState
        icon={FileBarChart}
        title="No report for this release"
        description="Reports are generated when a release is closed."
        action={
          <Button asChild variant="outline">
            <Link href={`/releases/${sprintId}`}>Back to release</Link>
          </Button>
        }
      />
    );

  const exportPdf = () => void pdfExport.start(`${sanitizeFileName(`Release report ${report.sprintName}`)}.pdf`);

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link href={`/releases/${sprintId}`}>
              <ArrowLeft /> Back to release
            </Link>
          </Button>
          <ReportHeader report={report} sprint={sprint} />
        </div>
        <Button variant="outline" size="sm" onClick={exportPdf} disabled={pdfExport.exporting}>
          <FileDown /> {pdfExport.exporting ? "Preparing PDF…" : "Export PDF"}
        </Button>
      </div>

      <ReleaseReportView report={report} sprint={sprint} tasks={live.tasks} />
      <p className="text-xs text-muted-foreground">
        Carried-over and Backlog lists are a snapshot taken when the release closed. Released tasks are read from the release itself.
      </p>

      {pdfExport.exporting && (
        <div aria-hidden className="pointer-events-none fixed top-0 -left-[20000px]">
          <ExportModeContext.Provider value={true}>
            <div ref={pdfExport.ref} className="grid gap-4 bg-background p-6 text-foreground" style={{ width: REPORT_WIDTH }}>
              <div className="border-b pb-4">
                <ReportHeader report={report} sprint={sprint} />
                <p className="mt-1 text-xs text-muted-foreground">Exported {format(new Date(), "MMM d, yyyy, h:mm a")}</p>
              </div>
              <ReleaseReportView report={report} sprint={sprint} tasks={live.tasks} fixedColumns />
            </div>
          </ExportModeContext.Provider>
        </div>
      )}
      <PdfPreviewDialog pdf={pdfExport.preview?.pdf ?? null} fileName={pdfExport.preview?.fileName ?? ""} onClose={pdfExport.closePreview} />
    </div>
  );
}
