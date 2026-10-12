"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Boxes, Pencil, Plus } from "lucide-react";
import { useData } from "@/components/providers/data-provider";
import { moduleSchema, type ModuleInput } from "@/lib/validation";
import { createModule, updateModule } from "@/lib/services/master-data";
import { attempt } from "@/lib/notify";
import type { Module } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PropSelect } from "@/components/tasks/property-controls";
import { appTypeOptions } from "@/components/tasks/options";

function ModuleDialog({
  open,
  onOpenChange,
  module,
  defaultAppTypeId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  module?: Module;
  defaultAppTypeId?: string;
}) {
  const { appTypes } = useData();
  const form = useForm<ModuleInput>({
    resolver: zodResolver(moduleSchema),
    defaultValues: { name: "", appTypeId: "", active: true },
  });
  useEffect(() => {
    if (open)
      form.reset(
        module
          ? { name: module.name, appTypeId: module.appTypeId, active: module.active }
          : { name: "", appTypeId: defaultAppTypeId ?? appTypes.find((a) => a.active)?.id ?? "", active: true },
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, module?.id, defaultAppTypeId]);
  const errors = form.formState.errors;
  const onSubmit = form.handleSubmit(async (values) => {
    const ok = await attempt(
      () => (module ? updateModule(module.id, values) : createModule(values)),
      "Couldn't save module",
      module ? "Module updated" : "Module created",
    );
    if (ok) onOpenChange(false);
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{module ? "Edit module" : "New module"}</DialogTitle>
          <DialogDescription>Each module belongs to one App Type.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3" noValidate>
          <Field label="App Type" error={errors.appTypeId?.message}>
            <Controller
              control={form.control}
              name="appTypeId"
              render={({ field }) => (
                <PropSelect
                  label="App Type"
                  value={field.value || null}
                  options={appTypeOptions(appTypes, field.value)}
                  onChange={(v) => field.onChange(v ?? "")}
                />
              )}
            />
          </Field>
          <Field label="Name" htmlFor="m-name" error={errors.name?.message}>
            <Input id="m-name" autoFocus {...form.register("name")} />
          </Field>
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

export default function ModulesPage() {
  const { appTypes, modules, loading } = useData();
  const [dialog, setDialog] = useState<{ open: boolean; module?: Module; appTypeId?: string }>({ open: false });

  return (
    <>
      <PageHeader
        title="Modules"
        description="Modules are grouped by App Type. Task forms only offer modules of the selected App Type."
        actions={
          appTypes.length > 0 && (
            <Button onClick={() => setDialog({ open: true })}>
              <Plus /> New module
            </Button>
          )
        }
      />
      {loading ? (
        <Skeleton className="h-48" />
      ) : appTypes.length === 0 ? (
        <EmptyState icon={Boxes} title="Create an App Type first" description="Modules belong to App Types." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {appTypes.map((a) => {
            const list = modules.filter((m) => m.appTypeId === a.id);
            return (
              <Card key={a.id} className="gap-2 py-4">
                <CardHeader className="flex flex-row items-center justify-between px-4">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <AppTypeBadge appType={a} /> {a.name}
                  </CardTitle>
                  <Button variant="ghost" size="icon-sm" aria-label={`Add module to ${a.name}`} onClick={() => setDialog({ open: true, appTypeId: a.id })}>
                    <Plus />
                  </Button>
                </CardHeader>
                <CardContent className="px-4">
                  {list.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No modules.</p>
                  ) : (
                    <ul className="divide-y">
                      {list.map((m) => (
                        <li key={m.id} className="flex items-center gap-2 py-1.5 text-sm">
                          <span className={m.active ? "flex-1" : "flex-1 text-muted-foreground line-through"}>{m.name}</span>
                          <Switch
                            checked={m.active}
                            aria-label={`${m.name} active`}
                            onCheckedChange={(v) => void attempt(() => updateModule(m.id, { active: v }), "Couldn't update")}
                          />
                          <Button variant="ghost" size="icon-xs" aria-label={`Edit ${m.name}`} onClick={() => setDialog({ open: true, module: m })}>
                            <Pencil />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <ModuleDialog
        open={dialog.open}
        module={dialog.module}
        defaultAppTypeId={dialog.appTypeId}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
      />
    </>
  );
}
