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
import { planTaskMove, statusAfterMove, type MovePlan } from "@/lib/move-plan";
import { chunk } from "@/lib/utils";
import { BATCH_CHUNK_SIZE } from "@/lib/constants";
import { addActivity } from "./tasks";
import type { SprintInput } from "@/lib/validation";
import { BACKLOG_ID, type AppType, type AppUser, type Sprint, type Task } from "@/types";

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
    if (!target.exists()) throw new SprintRuleError("Release not found.");
    if (target.data().status !== "planned") throw new SprintRuleError("Only planned releases can be started.");

    const currentId = meta.exists() ? (meta.data().sprintId as string | null) : null;
    if (currentId && currentId !== sprintId) {
      const current = await tx.get(ref.sprint(currentId));
      if (current.exists() && current.data().status === "active") {
        throw new SprintRuleError(
          `"${current.data().name}" is already active. Close it before starting another release.`,
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
  /** unfinished tasks going to the next release */
  releaseTaskIds: string[];
  /** unfinished tasks going to the Backlog (never Ready to Release) */
  backlogTaskIds: string[];
  target: CarryTarget | null;
  users: AppUser[];
  appTypes: AppType[];
  actorId: string;
}

/** Highest `order` in a release/Backlog (new arrivals go after it). */
async function lastOrder(sprintId: string): Promise<number> {
  const last = await getDocs(query(col.tasks(), where("sprintId", "==", sprintId), orderBy("order", "desc"), limit(1)));
  return Math.max(Date.now(), last.empty ? 0 : last.docs[0].data().order);
}

/**
 * Close-release flow (spec §7). Every unfinished task must have a destination: the next
 * release or the Backlog (owner's rule: nothing is left behind).
 *  1. check the plan, resolve / create the target release
 *  2. write the report snapshot (before any task moves)
 *  3. move tasks in chunks of 450 writes
 *  4. mark the release closed and clear meta/activeSprint
 * The release stays active until step 4, so a failure part-way through can simply be retried.
 */
export async function closeSprint(args: CloseSprintArgs): Promise<string> {
  const { sprint, tasks, releaseTaskIds, backlogTaskIds, target, users, appTypes, actorId } = args;

  // 1. Plan check + target release
  const check = planCarryForward(tasks, releaseTaskIds, backlogTaskIds, 0);
  if (check.unassigned.length) {
    throw new SprintRuleError(`Choose where these go first: ${check.unassigned.join(", ")}.`);
  }
  if (check.notAllowedInBacklog.length) {
    throw new SprintRuleError(`Ready to Release tasks can't go to the Backlog: ${check.notAllowedInBacklog.join(", ")}.`);
  }
  let targetSprint: { id: string; name: string } | null = null;
  if (check.carried.length > 0) {
    if (!target) throw new SprintRuleError("Choose a release to carry tasks into.");
    if (target.kind === "new") {
      const id = await createSprint(target.input, actorId);
      targetSprint = { id, name: target.input.name.trim() };
    } else {
      const snap = await getDoc(ref.sprint(target.sprintId));
      if (!snap.exists() || snap.data().status !== "planned") {
        throw new SprintRuleError("The target release must be a planned release.");
      }
      targetSprint = { id: snap.id, name: snap.data().name };
    }
  }
  if (check.toBacklog.length > 0) {
    const backlog = await getDoc(ref.sprint(BACKLOG_ID));
    if (!backlog.exists()) throw new SprintRuleError("The Backlog isn't set up yet. An admin can set it up on the Backlog page.");
  }

  // 2. Report snapshot (skipped if a previous attempt already wrote it)
  const reportRef = doc(db(), "sprintReports", sprint.id);
  const existingReport = await getDoc(reportRef);
  if (!existingReport.exists()) {
    const report = buildSprintReport({
      sprint,
      tasks: tasks.map((t) => ({ ...t, createdAtMs: t.createdAt ? t.createdAt.toMillis() : null })),
      carriedTaskIds: check.carried.map((c) => c.taskId),
      backlogTaskIds: check.toBacklog.map((c) => c.taskId),
      target: targetSprint,
      users,
      appTypes,
      closedAtMs: Date.now(),
    });
    await setDoc(reportRef, { ...report, createdBy: actorId, createdAt: serverTimestamp() });
  }

  // 3. Move tasks
  const plan = planCarryForward(
    tasks,
    releaseTaskIds,
    backlogTaskIds,
    targetSprint ? await lastOrder(targetSprint.id) : Date.now(),
    check.toBacklog.length ? await lastOrder(BACKLOG_ID) : Date.now(),
  );
  const movedAt = Timestamp.now();
  const moves = [
    ...plan.carried.map((item) => ({ item, to: targetSprint! })),
    ...plan.toBacklog.map((item) => ({ item, to: { id: BACKLOG_ID, name: "Backlog" } })),
  ];

  // Up to 3 writes per task (update + carried entry + status entry), so a chunk holds 150 tasks.
  for (const group of chunk(moves, Math.floor(BATCH_CHUNK_SIZE / 3))) {
    const batch = writeBatch(db());
    for (const { item, to } of group) {
      const status = statusAfterMove(item.finalStatusInSprint, to.id);
      if (status !== item.finalStatusInSprint) {
        addActivity(batch, item.taskId, actorId, { action: "updated", field: "status", oldValue: item.finalStatusInSprint, newValue: status });
      }
      batch.update(doc(db(), "tasks", item.taskId), {
        sprintId: to.id,
        order: item.newOrder,
        ...(status !== item.finalStatusInSprint ? { status } : {}),
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
        newValue: to.name,
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

/**
 * QA/Admin: moves tasks to another open release or the Backlog, keeping their key, history,
 * comments and pictures. Ready to Release / Released tasks are skipped for the Backlog.
 * Returns the keys that were skipped and why.
 */
export async function moveTasks(
  tasks: Task[],
  target: Pick<Sprint, "id" | "name">,
  sprintNames: Map<string, string>,
  actorId: string,
): Promise<MovePlan["skipped"]> {
  const plan = planTaskMove(tasks, target.id, await lastOrder(target.id));
  const movedAt = Timestamp.now();
  // up to 3 writes per task (update + "moved" + status entry)
  for (const group of chunk(plan.moving, Math.floor(BATCH_CHUNK_SIZE / 3))) {
    const batch = writeBatch(db());
    for (const m of group) {
      const fromName = sprintNames.get(m.fromSprintId) ?? "another release";
      const status = statusAfterMove(m.status, target.id);
      batch.update(doc(db(), "tasks", m.taskId), {
        sprintId: target.id,
        order: m.newOrder,
        ...(status !== m.status ? { status } : {}),
        sprintHistory: arrayUnion({ sprintId: m.fromSprintId, sprintName: fromName, finalStatusInSprint: m.status, movedAt }),
        updatedAt: serverTimestamp(),
        updatedBy: actorId,
      });
      addActivity(batch, m.taskId, actorId, { action: "moved", field: "sprintId", oldValue: fromName, newValue: target.name });
      if (status !== m.status) addActivity(batch, m.taskId, actorId, { action: "updated", field: "status", oldValue: m.status, newValue: status });
    }
    await batch.commit();
  }
  return plan.skipped;
}

/** Admin: sets up the Backlog once (a permanent special doc; see BACKLOG_ID). */
export async function setUpBacklog(actorId: string): Promise<void> {
  await setDoc(doc(db(), "sprints", BACKLOG_ID), {
    name: "Backlog",
    goal: "",
    startDate: "",
    endDate: "",
    status: "backlog",
    createdBy: actorId,
    createdAt: serverTimestamp(),
    closedAt: null,
    closedBy: null,
  });
}
