"use client";

/** Client wrappers for the Admin-SDK-backed user API (app/api/admin/users/...). */
import { auth } from "@/lib/firebase/client";
import type { CreateUserInput, UpdateUserInput } from "@/lib/validation";

async function call<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const user = auth().currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export const createUser = (input: CreateUserInput) =>
  call<{ uid: string; invited: boolean; emailSent: boolean }>("/api/admin/users", "POST", input);

/** Emails the user a fresh link to set their password. */
export const sendInvite = (uid: string) => call<{ ok: true }>(`/api/admin/users/${uid}/invite`, "POST", {});

export const updateUser = (uid: string, input: UpdateUserInput) =>
  call<{ ok: true }>(`/api/admin/users/${uid}`, "PATCH", input);

export const resetUserPassword = (uid: string, password: string) =>
  call<{ ok: true }>(`/api/admin/users/${uid}/password`, "POST", { password });
