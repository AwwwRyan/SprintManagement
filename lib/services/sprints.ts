"use client";

import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { col, ref } from "@/lib/firebase/refs";
import { buildSprintReport } from "@/lib/metrics";
import { carrySummary, planCarryForward } from "@/lib/carry-forward";
import { chunk } from "@/lib/utils";
import { BATCH_CHUNK_SIZE } from "@/lib/constants";
import { addActivity } from "./tasks";
import type { SprintInput } from "@/lib/validation";
import type { AppType, AppUser, Sprint, Task } from "@/types";

export async function createSprint(input: SprintInput, actorId: string): Promise<string> {
  const created = await addDoc(collection(db(), "sprints"), {
    name: input.name.trim(),
    goal: input.goal.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    status: "planned",
    createdBy: actorId,
    createdAt: serverTimestamp(),
    closedAt: null,
    closedBy: null,
  });
  return created.id;
}

export async function updateSprint(sprintId: string, input: SprintInput): Promise<void> {
  await updateDoc(doc(db(), "sprints", sprintId), {
    name: input.name.trim(),
    goal: input.goal.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
  });
}

export class SprintRuleError extends Error {}

/**
 * Starts a planned sprint. `meta/activeSprint` holds the id of the active sprint so the
 * "only one active sprint" rule can be checked inside a transaction (and by security rules).
 */
export async function startSprint(sprintId: string): Promise<void> {
  const metaRef = ref.activeSprintMeta();
  await runTransaction(db(), async (tx) => {
    const [meta, target] = await Promise.all([tx.get(metaRef), tx.get(ref.sprint(sprintId))]);
    if (!target.exists()) throw new SprintRuleError("Sprint not found.");
    if (target.data().status !== "planned") throw new SprintRuleError("Only planned sprints can be started.");

    const currentId = meta.exists() ? (meta.data().sprintId as string | null) : null;
    if (currentId && currentId !== sprintId) {
      const current = await tx.get(ref.sprint(currentId));
      if (current.exists() && current.data().status === "active") {
        throw new SprintRuleError(
          `"${current.data().name}" is already active. Close it before starting another sprint.`,
        );
      }
    }
    tx.update(doc(db(), "sprints", sprintId), { status: "active" });
    tx.set(metaRef, { sprintId });
  });
}

export type CarryTarget = { kind: "existing"; sprintId: string } | { kind: "new"; input: SprintInput };

export interface CloseSprintArgs {
  sprint: Sprint;
  tasks: Task[];
  selectedTaskIds: string[];
  target: CarryTarget | null;
  users: AppUser[];
  appTypes: AppType[];
  actorId: string;
}

/**
 * Close-sprint flow (spec §7):
 *  1. resolve / create the target sprint
 *  2. write the report snapshot (before any task moves)
 *  3. move selected unfinished tasks in chunks of 450 writes
 *  4. mark the sprint closed and clear meta/activeSprint
 * The sprint stays active until step 4, so a failure part-way through can simply be retried.
 */
export async function closeSprint(args: CloseSprintArgs): Promise<string> {
  const { sprint, tasks, selectedTaskIds, target, users, appTypes, actorId } = args;

  // 1. Target sprint
  let targetSprint: { id: string; name: string } | null = null;
  if (selectedTaskIds.length > 0) {
    if (!target) throw new SprintRuleError("Choose a sprint to carry tasks into.");
    if (target.kind === "new") {
      const id = await createSprint(target.input, actorId);
      targetSprint = { id, name: target.input.name.trim() };
    } else {
      const snap = await getDoc(ref.sprint(target.sprintId));
      if (!snap.exists() || snap.data().status !== "planned") {
        throw new SprintRuleError("The target sprint must be a planned sprint.");
      }
      targetSprint = { id: snap.id, name: snap.data().name };
    }
  }

  // 2. Report snapshot (skipped if a previous attempt already wrote it)
  const reportRef = doc(db(), "sprintReports", sprint.id);
  const existingReport = await getDoc(reportRef);
  if (!existingReport.exists()) {
    const report = buildSprintReport({
      sprint,
      tasks: tasks.map((t) => ({ ...t, createdAtMs: t.createdAt ? t.createdAt.toMillis() : null })),
      carriedTaskIds: selectedTaskIds,
      target: targetSprint,
      users,
      appTypes,
      closedAtMs: Date.now(),
    });
    await setDoc(reportRef, { ...report, createdBy: actorId, createdAt: serverTimestamp() });
  }

  // 3. Move tasks
  let startOrder = Date.now();
  if (targetSprint) {
    const last = await getDocs(
      query(col.tasks(), where("sprintId", "==", targetSprint.id), orderBy("order", "desc"), limit(1)),
    );
    if (!last.empty) startOrder = Math.max(startOrder, last.docs[0].data().order);
  }
  const plan = planCarryForward(tasks, selectedTaskIds, startOrder);
  const movedAt = Timestamp.now();

  // Each task needs 2 writes (task update + activity), so a chunk holds 450 writes.
  for (const group of chunk(plan.carried, Math.floor(BATCH_CHUNK_SIZE / 2))) {
    const batch = writeBatch(db());
    for (const item of group) {
      batch.update(doc(db(), "tasks", item.taskId), {
        sprintId: targetSprint!.id,
        order: item.newOrder,
        carryOverCount: increment(1),
        sprintHistory: arrayUnion({
          sprintId: sprint.id,
          sprintName: sprint.name,
          finalStatusInSprint: item.finalStatusInSprint,
          movedAt,
        }),
        updatedAt: serverTimestamp(),
        updatedBy: actorId,
      });
      addActivity(batch, item.taskId, actorId, {
        action: "carried_over",
        field: "sprintId",
        oldValue: sprint.name,
        newValue: targetSprint!.name,
      });
    }
    await batch.commit();
  }

  // 4. Close
  const finalBatch = writeBatch(db());
  finalBatch.update(doc(db(), "sprints", sprint.id), {
    status: "closed",
    closedAt: serverTimestamp(),
    closedBy: actorId,
  });
  finalBatch.set(ref.activeSprintMeta(), { sprintId: null });
  await finalBatch.commit();

  return carrySummary(plan, targetSprint?.name ?? null);
}
