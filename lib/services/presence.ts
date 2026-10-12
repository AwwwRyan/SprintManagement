"use client";

import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export interface PresenceInfo {
  name: string;
  initials: string;
  viewingTaskId: string | null;
}

export async function beat(sprintId: string, uid: string, info: PresenceInfo): Promise<void> {
  await setDoc(doc(db(), "presence", sprintId, "viewers", uid), { ...info, lastSeen: serverTimestamp() });
}

export async function leave(sprintId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db(), "presence", sprintId, "viewers", uid));
}
