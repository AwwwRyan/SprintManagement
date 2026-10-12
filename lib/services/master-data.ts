"use client";

import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { AppTypeInput, ModuleInput } from "@/lib/validation";

export async function createAppType(input: AppTypeInput): Promise<string> {
  const r = await addDoc(collection(db(), "appTypes"), { ...input, createdAt: serverTimestamp() });
  return r.id;
}

export async function updateAppType(id: string, input: Partial<AppTypeInput>): Promise<void> {
  await updateDoc(doc(db(), "appTypes", id), input);
}

export async function createModule(input: ModuleInput): Promise<string> {
  const r = await addDoc(collection(db(), "modules"), { ...input, createdAt: serverTimestamp() });
  return r.id;
}

export async function updateModule(id: string, input: Partial<ModuleInput>): Promise<void> {
  await updateDoc(doc(db(), "modules", id), input);
}
