import "server-only";

import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Verifies the Firebase ID token in `Authorization: Bearer <token>` and that the caller is an
 * active Admin. The token's custom claim AND the Firestore user doc must both say admin, so a
 * demoted admin with a not-yet-refreshed token is still rejected.
 */
export async function requireAdmin(req: Request): Promise<{ uid: string }> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Missing ID token");

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(token, true);
  } catch {
    throw new HttpError(401, "Invalid or expired ID token");
  }
  if (decoded.role !== "admin") throw new HttpError(403, "Admins only");

  const profile = await adminDb().doc(`users/${decoded.uid}`).get();
  if (!profile.exists || profile.get("active") !== true || profile.get("role") !== "admin") {
    throw new HttpError(403, "Admins only");
  }
  return { uid: decoded.uid };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const raw: unknown = await req.json().catch(() => {
    throw new HttpError(400, "Invalid JSON body");
  });
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new HttpError(400, result.error.issues.map((i) => i.message).join("; "));
  }
  return result.data;
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  const code = (err as { code?: string })?.code;
  if (code === "auth/email-already-exists") {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }
  if (code === "auth/user-not-found") return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (code === "auth/invalid-password") {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
