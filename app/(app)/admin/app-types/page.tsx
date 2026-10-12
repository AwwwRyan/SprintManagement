"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Shapes } from "lucide-react";
import type { z } from "zod";
import { useData } from "@/components/providers/data-provider";
import { appTypeSchema, type AppTypeInput } from "@/lib/validation";
import { createAppType, updateAppType } from "@/lib/services/master-data";
import { attempt } from "@/lib/notify";
import type { AppType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { AppTypeBadge } from "@/components/common/badges";

function AppTypeDialog({ open, onOpenChange, appType }: { open: boolean; onOpenChange: (o: boolean) => void; appType?: AppType }) {
  const form = useForm<z.input<typeof appTypeSchema>, unknown, AppTypeInput>({
    resolver: zodResolver(appTypeSchema),
    defaultValues: { name: "", code: "", color: "#2a78d6", active: true },
  });
  useEffect(() => {
    if (open) form.reset(appType ? { name: appType.name, code: appType.code, color: appType.color, active: appType.active } : { name: "", code: "", color: "#2a78d6", active: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appType?.id]);
  const errors = form.formState.errors;
  const onSubmit = form.handleSubmit(async (values) => {
    const ok = await attempt(
      () => (appType ? updateAppType(appType.id, values) : createAppType(values)),
      "Couldn't save App Type",
      appType ? "App Type updated" : "App Type created",
    );
    if (ok) onOpenChange(false);
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{appType ? "Edit App Type" : "New App Type"}</DialogTitle>
          <DialogDescription>App Types are the company&apos;s products. The color is used for badges.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3" noValidate>
          <Field label="Name" htmlFor="at-name" error={errors.name?.message}>
            <Input id="at-name" autoFocus {...form.register("name")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Short code" htmlFor="at-code" error={errors.code?.message} hint="Shown on badges, e.g. SERVICE-PROVIDER">
              <Input id="at-code" className="uppercase" maxLength={20} {...form.register("code")} />
            </Field>
            <Field label="Color" htmlFor="at-color" error={errors.color?.message}>
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Pick color"
                  className="h-8 w-10 cursor-pointer rounded border bg-transparent"
                  value={form.watch("color")}
                  onChange={(e) => form.setValue("color", e.target.value, { shouldValidate: true })}
                />
                <Input id="at-color" {...form.register("color")} />
              </div>
            </Field>
          </div>
          <Controller
            control={form.control}
            name="active"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={field.value} onCheckedChange={field.onChange} />
                Active (shown in dropdowns)
              </label>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AppTypesPage() {
  const { appTypes, modules, loading } = useData();
  const [dialog, setDialog] = useState<{ open: boolean; appType?: AppType }>({ open: false });

  return (
    <>
      <PageHeader
        title="App Types"
        description="Deactivated App Types are hidden from dropdowns but still show on existing tasks."
        actions={
          <Button onClick={() => setDialog({ open: true })}>
            <Plus /> New App Type
          </Button>
        }
      />
      {loading ? (
        <Skeleton className="h-48" />
      ) : appTypes.length === 0 ? (
        <EmptyState
          icon={Shapes}
          title="No App Types yet"
          description="Add your products so tasks can be tagged with them."
          action={
            <Button onClick={() => setDialog({ open: true })}>
              <Plus /> New App Type
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="p-2.5 text-left font-medium">Badge</th>
                <th className="p-2.5 text-left font-medium">Name</th>
                <th className="p-2.5 text-right font-medium">Modules</th>
                <th className="p-2.5 text-left font-medium">Active</th>
                <th className="w-12 p-2.5" />
              </tr>
            </thead>
            <tbody>
              {appTypes.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-2.5">
                    <AppTypeBadge appType={a} />
                  </td>
                  <td className="p-2.5 font-medium">{a.name}</td>
                  <td className="p-2.5 text-right tabular-nums">{modules.filter((m) => m.appTypeId === a.id).length}</td>
                  <td className="p-2.5">
                    <Switch
                      checked={a.active}
                      aria-label={`${a.name} active`}
                      onCheckedChange={(v) => void attempt(() => updateAppType(a.id, { active: v }), "Couldn't update")}
                    />
                  </td>
                  <td className="p-2.5">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${a.name}`} onClick={() => setDialog({ open: true, appType: a })}>
                      <Pencil />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AppTypeDialog open={dialog.open} appType={dialog.appType} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />
    </>
  );
}
