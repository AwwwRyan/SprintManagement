"use client";

/**
 * One-off reads for the date-range Excel export (not live listeners).
 * Cost: one read per task in the project plus one per status change in the range.
 */
import { collectionGroup, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { col } from "@/lib/firebase/refs";
import type { ReportTask, StatusChange } from "@/lib/range-report";

export async function fetchRangeData(fromMs: number, toMs: number): Promise<{ tasks: ReportTask[]; changes: StatusChange[] }> {
  const [taskSnap, changeSnap] = await Promise.all([
    getDocs(col.tasks()),
    getDocs(
      query(
        collectionGroup(db(), "activity"),
        where("field", "==", "status"),
        where("createdAt", ">=", Timestamp.fromMillis(fromMs)),
        where("createdAt", "<=", Timestamp.fromMillis(toMs)),
      ),
    ),
  ]);

  const tasks: ReportTask[] = taskSnap.docs.map((d) => {
    const t = d.data();
    return { ...t, createdAtMs: t.createdAt ? t.createdAt.toMillis() : null };
  });

  const changes: StatusChange[] = changeSnap.docs
    .filter((d) => d.ref.parent.parent?.parent.id === "tasks") // tasks/{taskId}/activity/{id}
    .map((d) => {
      const a = d.data() as { actorId: string; oldValue: string | null; newValue: string | null; createdAt: Timestamp | null };
      return {
        taskId: d.ref.parent.parent!.id,
        atMs: a.createdAt ? a.createdAt.toMillis() : 0,
        actorId: a.actorId,
        from: a.oldValue,
        to: a.newValue,
      };
    });

  return { tasks, changes };
}

/** Status changes since `fromMs` (dashboard trend). Cost: one read per status change in the period. */
export async function fetchStatusChangesSince(fromMs: number): Promise<StatusChange[]> {
  const snap = await getDocs(
    query(collectionGroup(db(), "activity"), where("field", "==", "status"), where("createdAt", ">=", Timestamp.fromMillis(fromMs))),
  );
  return snap.docs
    .filter((d) => d.ref.parent.parent?.parent.id === "tasks")
    .map((d) => {
      const a = d.data() as { actorId: string; oldValue: string | null; newValue: string | null; createdAt: Timestamp | null };
      return { taskId: d.ref.parent.parent!.id, atMs: a.createdAt ? a.createdAt.toMillis() : 0, actorId: a.actorId, from: a.oldValue, to: a.newValue };
    });
}
