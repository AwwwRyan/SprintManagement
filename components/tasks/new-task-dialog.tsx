"use client";

import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { useData } from "@/components/providers/data-provider";
import { taskFormSchema, type TaskFormInput, type TaskFormValues } from "@/lib/validation";
import { createTask } from "@/lib/services/tasks";
import { notifyError } from "@/lib/notify";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PropSelect } from "./property-controls";
import {
  appTypeOptions,
  moduleOptions,
  priorityOptions,
  severityOptions,
  statusOptions,
  typeOptions,
  userOptions,
  environmentOptions,
} from "./options";

const LAST_APP_TYPE_KEY = "stm.lastAppTypeId";

export function NewTaskDialog({
  open,
  onOpenChange,
  sprintId,
  defaultAssigneeId = null,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sprintId: string;
  defaultAssigneeId?: string | null;
  onCreated?: (taskKey: string) => void;
}) {
  const { actor } = useCurrentUser();
  const { appTypes, modules, users } = useData();

  const defaults = (): TaskFormInput => {
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_APP_TYPE_KEY);
    } catch {
      /* storage unavailable */
    }
    const active = appTypes.filter((a) => a.active);
    return {
      title: "",
      appTypeId: active.find((a) => a.id === last)?.id ?? active[0]?.id ?? "",
      type: "task",
      moduleId: null,
      assigneeId: defaultAssigneeId,
      priority: "medium",
      severity: null,
      status: "todo",
      estimatedHours: null,
      actualHours: null,
      dueDate: null,
      releaseDate: null,
      environment: "",
      stepsToReproduce: "",
      expectedResult: "",
      actualResult: "",
      remarks: "",
    };
  };

  const form = useForm<TaskFormInput, unknown, TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: defaults(),
  });
  const { control, register, formState, setValue } = form;
  const errors = formState.errors;
  const appTypeId = useWatch({ control, name: "appTypeId" });
  const type = useWatch({ control, name: "type" });

  useEffect(() => {
    if (open) form.reset(defaults());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const created = await createTask({ ...values, sprintId }, actor.uid);
      try {
        localStorage.setItem(LAST_APP_TYPE_KEY, values.appTypeId);
      } catch {
        /* storage unavailable */
      }
      toast.success(`${created.taskKey} created`);
      onOpenChange(false);
      onCreated?.(created.taskKey);
    } catch (err) {
      notifyError(err, "Couldn't create task");
    }
  });

  const hours = (name: "estimatedHours" | "actualHours") =>
    register(name, { setValueAs: (v: string) => (v === "" || v === null ? null : Number(v)) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Add a requirement, bug, enhancement or task to this release.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field label="Title" htmlFor="nt-title" error={errors.title?.message}>
            <Input id="nt-title" autoFocus {...register("title")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="App Type" error={errors.appTypeId?.message}>
              <Controller
                control={control}
                name="appTypeId"
                render={({ field }) => (
                  <PropSelect
                    label="App Type"
                    value={field.value || null}
                    options={appTypeOptions(appTypes)}
                    onChange={(v) => {
                      field.onChange(v ?? "");
                      setValue("moduleId", null); // modules belong to one App Type
                    }}
                  />
                )}
              />
            </Field>
            <Field label="Module">
              <Controller
                control={control}
                name="moduleId"
                render={({ field }) => (
                  <PropSelect
                    label="Module"
                    value={field.value}
                    options={moduleOptions(modules, appTypeId)}
                    onChange={field.onChange}
                    allowNone
                  />
                )}
              />
            </Field>
            <Field label="Type">
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <PropSelect label="Type" value={field.value} options={typeOptions} onChange={(v) => v && field.onChange(v)} />
                )}
              />
            </Field>
            {type === "bug" && (
              <Field label="Severity">
                <Controller
                  control={control}
                  name="severity"
                  render={({ field }) => (
                    <PropSelect label="Severity" value={field.value} options={severityOptions} onChange={field.onChange} allowNone />
                  )}
                />
              </Field>
            )}
            <Field label="Priority">
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <PropSelect label="Priority" value={field.value} options={priorityOptions} onChange={(v) => v && field.onChange(v)} />
                )}
              />
            </Field>
            <Field label="Status">
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <PropSelect label="Status" value={field.value} options={statusOptions} onChange={(v) => v && field.onChange(v)} />
                )}
              />
            </Field>
            <Field label="Assigned to">
              <Controller
                control={control}
                name="assigneeId"
                render={({ field }) => (
                  <PropSelect
                    label="Assigned to"
                    value={field.value}
                    options={userOptions(users)}
                    onChange={field.onChange}
                    allowNone
                    noneLabel="Unassigned"
                  />
                )}
              />
            </Field>
            <Field label="Due date" htmlFor="nt-due">
              <Input id="nt-due" type="date" {...register("dueDate", { setValueAs: (v: string) => v || null })} />
            </Field>
            <Field label="Release date" htmlFor="nt-release">
              <Input id="nt-release" type="date" {...register("releaseDate", { setValueAs: (v: string) => v || null })} />
            </Field>
            <Field label="Estimated hours" htmlFor="nt-est" error={errors.estimatedHours?.message}>
              <Input id="nt-est" type="number" min={0} step={0.5} {...hours("estimatedHours")} />
            </Field>
            <Field label="Environment">
              <Controller
                control={control}
                name="environment"
                render={({ field }) => (
                  <PropSelect
                    label="Environment"
                    value={field.value || null}
                    options={environmentOptions()}
                    onChange={(v) => field.onChange(v ?? "")}
                    allowNone
                  />
                )}
              />
            </Field>
          </div>
          {type === "bug" && (
            <div className="grid gap-4">
              <Field label="Steps to reproduce" htmlFor="nt-steps">
                <Textarea id="nt-steps" rows={3} {...register("stepsToReproduce")} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Expected result" htmlFor="nt-exp">
                  <Textarea id="nt-exp" rows={2} {...register("expectedResult")} />
                </Field>
                <Field label="Actual result" htmlFor="nt-act">
                  <Textarea id="nt-act" rows={2} {...register("actualResult")} />
                </Field>
              </div>
            </div>
          )}
          <Field label="Remarks" htmlFor="nt-remarks">
            <Textarea id="nt-remarks" rows={2} maxLength={2000} {...register("remarks")} />
          </Field>
          <p className="text-xs text-muted-foreground">
            Add the description and screenshots from the side panel after creating the task.
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
