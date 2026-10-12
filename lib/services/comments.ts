"use client";

import { collection, deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { addActivity } from "./tasks";

export async function addComment(taskId: string, body: string, actorId: string): Promise<void> {
  const batch = writeBatch(db());
  const commentRef = doc(collection(db(), "tasks", taskId, "comments"));
  batch.set(commentRef, { authorId: actorId, body: body.trim(), createdAt: serverTimestamp(), editedAt: null });
  addActivity(batch, taskId, actorId, { action: "comment_added", newValue: commentRef.id });
  await batch.commit();
}

export async function editComment(taskId: string, commentId: string, body: string): Promise<void> {
  await updateDoc(doc(db(), "tasks", taskId, "comments", commentId), {
    body: body.trim(),
    editedAt: serverTimestamp(),
  });
}

export async function deleteComment(taskId: string, commentId: string): Promise<void> {
  await deleteDoc(doc(db(), "tasks", taskId, "comments", commentId));
}
