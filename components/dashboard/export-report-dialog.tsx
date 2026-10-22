"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/components/providers/data-provider";
import { buildRangeReport, presetRange, rangeBounds, type RangePreset } from "@/lib/range-report";
import { fetchRangeData } from "@/lib/services/reports";
import { downloadRangeReport, reportFileName } from "@/lib/export-xlsx";
import { notifyError } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ALL = "__all__";
const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "this_week", label: "This week" },
  { key: "last_week", label: "Last week" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "custom", label: "Custom dates" },
];

/** Admin-only: export what happened between two dates (all sprints) to Excel. */
export function ExportReportDialog({
  open,
  onOpenChange,
  defaultAppTypeId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultAppTypeId: string | null;
}) {
  const { appTypes, appTypeById, userById, sprintById } = useData();
  const [preset, setPreset] = useState<RangePreset>("this_week");
  const initial = presetRange("this_week");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [appTypeId, setAppTypeId] = useState<string>(defaultAppTypeId ?? ALL);
  const [busy, setBusy] = useState(false);

  const choose = (p: RangePreset) => {
    setPreset(p);
    if (p !== "custom") {
      const r = presetRange(p);
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const invalid = !from || !to || from > to;

  const run = async () => {
    if (invalid) return;
    setBusy(true);
    try {
      const { fromMs, toMs } = rangeBounds(from, to);
      const data = await fetchRangeData(fromMs, toMs);
      const appId = appTypeId === ALL ? null : appTypeId;
      const report = buildRangeReport({
        ...data,
        from,
        to,
        appTypeId: appId,
        lookups: {
          userName: (id) => (id ? (userById.get(id)?.name ?? "Unknown user") : "Unassigned"),
          appName: (id) => appTypeById.get(id)?.name ?? "Unknown",
          sprintName: (id) => sprintById.get(id)?.name ?? "Unknown",
        },
      });
      await downloadRangeReport(report, reportFileName(report, appId ? (appTypeById.get(appId)?.name ?? null) : null));
      toast.success("Report downloaded", {
        description: `${report.completed.length} completed · ${report.created.length} created · ${report.openNow.length} open now`,
      });
      onOpenChange(false);
    } catch (err) {
      notifyError(err, "Couldn't export the report");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export report</DialogTitle>
          <DialogDescription>
            Excel file covering all releases: what was created and completed in the period, plus everything open right now.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Period</Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Period">
              {PRESETS.map((p) => (
                <Button
                  key={p.key}
                  type="button"
                  size="sm"
                  variant={preset === p.key ? "default" : "outline"}
                  role="radio"
                  aria-checked={preset === p.key}
                  onClick={() => choose(p.key)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rep-from">From</Label>
              <Input id="rep-from" type="date" value={from} max={to || undefined} onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rep-to">To</Label>
              <Input id="rep-to" type="date" value={to} min={from || undefined} onChange={(e) => { setPreset("custom"); setTo(e.target.value); }} />
            </div>
          </div>
          {invalid && <p className="text-xs text-destructive">Choose a start date on or before the end date.</p>}
          <div className="grid gap-1.5">
            <Label>App Type</Label>
            <Select value={appTypeId} onValueChange={setAppTypeId}>
              <SelectTrigger className="w-full" aria-label="App Type for the report">
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
          </div>
          <p className="text-xs text-muted-foreground">
            Sheets: Summary · Completed · Created · Open now · By person · By app. Tasks imported from Excel have no
            completion date, so they only appear under &quot;Open now&quot;.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void run()} disabled={busy || invalid}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
            {busy ? "Preparing…" : "Download Excel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
