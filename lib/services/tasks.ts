"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type DocumentReference,
  type WriteBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { col, ref } from "@/lib/firebase/refs";
import { diffPatch, normalizePatch, type FieldChange } from "@/lib/task-diff";
import { chunk, formatTaskKey } from "@/lib/utils";
import { BATCH_CHUNK_SIZE } from "@/lib/constants";
import type { ActivityAction, ActivityValue, Task, TaskPatch } from "@/types";

/** Shape of an activity entry before it is written. */
export interface ActivityInput {
  action: ActivityAction;
  field?: string | null;
  oldValue?: ActivityValue;
  newValue?: ActivityValue;
}

/** Adds an activity entry to an existing batch, so it commits atomically with the change it describes. */
export function addActivity(batch: WriteBatch, taskId: string, actorId: string, entry: ActivityInput) {
  const activityRef = doc(collection(db(), "tasks", taskId, "activity"));
  batch.set(activityRef, {
    actorId,
    action: entry.action,
    field: entry.field ?? null,
    oldValue: entry.oldValue ?? null,
    newValue: entry.newValue ?? null,
    createdAt: serverTimestamp(),
  });
}

/** New-task fields; everything not supplied gets a sensible default. */
export type NewTaskInput = Pick<Task, "title" | "appTypeId" | "sprintId"> & Partial<Omit<Task, "id" | "taskKey">>;

/**
 * Creates a task with a permanent global key (TSK-n). The counter increment, the task and its
 * "created" activity entry are written in a single transaction, so keys are never duplicated.
 */
export async function createTask(input: NewTaskInput, actorId: string): Promise<{ id: string; taskKey: string }> {
  const taskRef = doc(col.tasks());
  const counterRef = ref.taskCounter();
  const activityRef = doc(collection(db(), "tasks", taskRef.id, "activity"));

  const taskKey = await runTransaction(db(), async (tx) => {
    const counter = await tx.get(counterRef);
    const next = counter.exists() ? (counter.data().next as number) : 1;
    const key = formatTaskKey(next);
    if (counter.exists()) tx.update(counterRef, { next: next + 1 });
    else tx.set(counterRef, { next: next + 1 });

    const type = input.type ?? "task";
    tx.set(doc(db(), "tasks", taskRef.id), {
      taskKey: key,
      sprintId: input.sprintId,
      order: input.order ?? Date.now(),
      appTypeId: input.appTypeId,
      type,
      moduleId: input.moduleId ?? null,
      title: input.title.trim(),
      description: input.description ?? "",
      descriptionText: input.descriptionText ?? "",
      assigneeId: input.assigneeId ?? null,
      priority: input.priority ?? "medium",
      severity: type === "bug" ? (input.severity ?? null) : null,
      estimatedHours: input.estimatedHours ?? null,
      actualHours: input.actualHours ?? null,
      status: input.status ?? "todo",
      reporterId: actorId,
      dueDate: input.dueDate ?? null,
      environment: input.environment ?? "",
      stepsToReproduce: input.stepsToReproduce ?? "",
      expectedResult: input.expectedResult ?? "",
      actualResult: input.actualResult ?? "",
      attachmentCount: 0,
      carryOverCount: 0,
      sprintHistory: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: actorId,
    });
    tx.set(activityRef, {
      actorId,
      action: "created",
      field: null,
      oldValue: null,
      newValue: key,
      createdAt: serverTimestamp(),
    });
    return key;
  });

  return { id: taskRef.id, taskKey };
}

/**
 * Field-level update: only changed fields are written (last-write-wins per field), with one
 * activity entry per field in the same batch. Firestore applies the change to the local cache
 * immediately (optimistic) and rolls it back automatically if the server rejects it.
 * Returns the list of changes (empty if nothing changed).
 */
export async function updateTask(task: Task, patch: TaskPatch, actorId: string): Promise<FieldChange[]> {
  const { changed, changes } = diffPatch(task, normalizePatch(task, patch));
  if (Object.keys(changed).length === 0) return [];

  const batch = writeBatch(db());
  batch.update(doc(db(), "tasks", task.id), { ...changed, updatedAt: serverTimestamp(), updatedBy: actorId });
  for (const c of changes) {
    addActivity(batch, task.id, actorId, { action: "updated", field: c.field, oldValue: c.oldValue, newValue: c.newValue });
  }
  await batch.commit();
  return changes;
}

/**
 * Deletes a task, its attachments (chunks + metadata) and comments. Activity entries are append-only
 * (rules forbid deleting them) and are left orphaned; nothing reads them once the task is gone.
 */
export async function deleteTask(taskId: string): Promise<void> {
  const [attachments, comments] = await Promise.all([
    getDocs(col.attachments(taskId)),
    getDocs(col.comments(taskId)),
  ]);
  const chunkRefs = attachments.docs.flatMap((a) =>
    Array.from({ length: a.data().chunkCount }, (_, i) => doc(db(), "tasks", taskId, "attachments", a.id, "chunks", String(i))),
  );
  const docs: DocumentReference[] = [
    ...chunkRefs,
    ...attachments.docs.map((d) => d.ref.withConverter(null)),
    ...comments.docs.map((d) => d.ref.withConverter(null)),
  ];
  for (const group of chunk(docs, BATCH_CHUNK_SIZE)) {
    const batch = writeBatch(db());
    group.forEach((r) => batch.delete(r));
    await batch.commit();
  }
  await deleteDoc(doc(db(), "tasks", taskId));
}
