"use client";

import { useEffect, useRef, useState } from "react";
import { onSnapshot, orderBy, query, where, type Query } from "firebase/firestore";
import { col, ref } from "@/lib/firebase/refs";
import { useLiveDoc, useLiveQuery } from "./use-live";
import { errorMessage } from "@/lib/utils";
import type { Activity, Attachment, Comment, SprintReport, Task } from "@/types";

const FLASH_MS = 1500;

export interface LiveTasks {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  /** Ids of rows just changed by ANOTHER user (for the background flash). */
  flashing: Set<string>;
}

function useLiveTasks(key: string | null, build: () => Query<Task>, myUid: string): LiveTasks {
  const [state, setState] = useState<{ key: string | null; tasks: Task[]; loading: boolean; error: string | null }>({
    key: null,
    tasks: [],
    loading: true,
    error: null,
  });
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (key === null) return;
    let first = true;
    const pending = timers.current;
    const unsub = onSnapshot(
      build(),
      (snap) => {
        if (!first) {
          const remote = snap
            .docChanges()
            .filter((c) => c.type === "modified" && !c.doc.metadata.hasPendingWrites && c.doc.data().updatedBy !== myUid)
            .map((c) => c.doc.id);
          if (remote.length) {
            setFlashing((prev) => new Set([...prev, ...remote]));
            for (const id of remote) {
              clearTimeout(pending.get(id));
              pending.set(
                id,
                setTimeout(() => {
                  setFlashing((prev) => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                  });
                  pending.delete(id);
                }, FLASH_MS),
              );
            }
          }
        }
        first = false;
        setState({ key, tasks: snap.docs.map((d) => d.data()), loading: false, error: null });
      },
      (err) => setState({ key, tasks: [], loading: false, error: errorMessage(err) }),
    );
    return () => {
      unsub();
      pending.forEach(clearTimeout);
      pending.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, myUid]);

  if (key === null) return { tasks: [], loading: false, error: null, flashing };
  if (state.key !== key) return { tasks: [], loading: true, error: null, flashing };
  return { ...state, flashing };
}

export function useSprintTasks(sprintId: string | null, myUid: string): LiveTasks {
  return useLiveTasks(
    sprintId ? `sprint-tasks:${sprintId}` : null,
    () => query(col.tasks(), where("sprintId", "==", sprintId), orderBy("order")),
    myUid,
  );
}

/** Every task in every release and the Backlog (All Tasks page). Reads all tasks: mind the Spark quota. */
export function useAllTasks(myUid: string, enabled = true): LiveTasks {
  return useLiveTasks(enabled ? "all-tasks" : null, () => query(col.tasks(), orderBy("order")), myUid);
}

export function useMyTasks(sprintId: string | null, myUid: string): LiveTasks {
  return useLiveTasks(
    sprintId ? `my-tasks:${sprintId}:${myUid}` : null,
    () => query(col.tasks(), where("sprintId", "==", sprintId), where("assigneeIds", "array-contains", myUid), orderBy("order")),
    myUid,
  );
}

/** Live tasks of several sprints at once (sprint list counts). Firestore `in` allows up to 30 values. */
export function useTasksInSprints(sprintIds: string[]) {
  const ids = sprintIds.slice(0, 30).sort();
  return useLiveQuery(ids.length ? `tasks-in:${ids.join(",")}` : null, () =>
    query(col.tasks(), where("sprintId", "in", ids)),
  );
}

export function useTask(taskId: string | null) {
  return useLiveDoc(taskId ? `task:${taskId}` : null, () => ref.task(taskId!));
}

export function useTaskByKey(taskKey: string | null) {
  return useLiveQuery(taskKey ? `task-key:${taskKey}` : null, () =>
    query(col.tasks(), where("taskKey", "==", taskKey)),
  );
}

export function useComments(taskId: string | null) {
  return useLiveQuery<Comment>(taskId ? `comments:${taskId}` : null, () =>
    query(col.comments(taskId!), orderBy("createdAt", "asc")),
  );
}

export function useAttachments(taskId: string | null) {
  return useLiveQuery<Attachment>(taskId ? `attachments:${taskId}` : null, () =>
    query(col.attachments(taskId!), orderBy("uploadedAt", "asc")),
  );
}

export function useActivity(taskId: string | null) {
  return useLiveQuery<Activity>(taskId ? `activity:${taskId}` : null, () =>
    query(col.activity(taskId!), orderBy("createdAt", "desc")),
  );
}

export function useReport(sprintId: string | null) {
  return useLiveDoc<SprintReport>(sprintId ? `report:${sprintId}` : null, () => ref.report(sprintId!));
}

export function useReports() {
  return useLiveQuery<SprintReport>("reports", () => query(col.reports()));
}
