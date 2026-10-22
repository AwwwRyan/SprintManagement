"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/auth-provider";
import { sprintSchema, type SprintInput } from "@/lib/validation";
import { createSprint, updateSprint } from "@/lib/services/sprints";
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
import type { Sprint } from "@/types";

export function defaultSprintInput(suggestedName = ""): SprintInput {
  const start = new Date();
  return {
    name: suggestedName,
    goal: "",
    startDate: format(start, "yyyy-MM-dd"),
    endDate: format(addDays(start, 13), "yyyy-MM-dd"),
  };
}

/** Reusable sprint fields (also used inline in the close-sprint dialog). */
export function SprintFields({
  form,
  idPrefix,
}: {
  form: ReturnType<typeof useForm<SprintInput>>;
  idPrefix: string;
}) {
  const errors = form.formState.errors;
  return (
    <div className="grid gap-3">
      <Field label="Name" htmlFor={`${idPrefix}-name`} error={errors.name?.message}>
        <Input id={`${idPrefix}-name`} placeholder="Release 15" {...form.register("name")} />
      </Field>
      <Field label="Goal" htmlFor={`${idPrefix}-goal`} error={errors.goal?.message}>
        <Textarea id={`${idPrefix}-goal`} rows={2} {...form.register("goal")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" htmlFor={`${idPrefix}-start`} error={errors.startDate?.message}>
          <Input id={`${idPrefix}-start`} type="date" {...form.register("startDate")} />
        </Field>
        <Field label="End date" htmlFor={`${idPrefix}-end`} error={errors.endDate?.message}>
          <Input id={`${idPrefix}-end`} type="date" {...form.register("endDate")} />
        </Field>
      </div>
    </div>
  );
}

export function SprintFormDialog({
  open,
  onOpenChange,
  sprint,
  suggestedName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** When set, edits this sprint; otherwise creates a new planned sprint. */
  sprint?: Sprint;
  suggestedName?: string;
  onSaved?: (sprintId: string) => void;
}) {
  const { actor } = useCurrentUser();
  const form = useForm<SprintInput>({ resolver: zodResolver(sprintSchema), defaultValues: defaultSprintInput() });

  useEffect(() => {
    if (!open) return;
    form.reset(
      sprint
        ? { name: sprint.name, goal: sprint.goal, startDate: sprint.startDate, endDate: sprint.endDate }
        : defaultSprintInput(suggestedName),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sprint?.id]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (sprint) {
        await updateSprint(sprint.id, values);
        toast.success("Release updated");
        onSaved?.(sprint.id);
      } else {
        const id = await createSprint(values, actor.uid);
        toast.success(`${values.name} created`);
        onSaved?.(id);
      }
      onOpenChange(false);
    } catch (err) {
      notifyError(err, "Couldn't save release");
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{sprint ? "Edit release" : "New release"}</DialogTitle>
          <DialogDescription>
            {sprint ? "Update the release details." : "New releases start as planned. Start one when it begins."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <SprintFields form={form} idPrefix="sf" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : sprint ? "Save" : "Create release"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
