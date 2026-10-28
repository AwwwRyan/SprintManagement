import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { handleError, HttpError, parseBody, requireAdmin } from "@/lib/server/require-admin";
import { updateUserSchema } from "@/lib/validation";
import { initialsFromName } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/users/:uid: change name / designation / role / active / assignable.
 * Role changes update the custom claim (the client sees the Firestore doc change and force-refreshes
 * its token). Deactivation disables the Auth user and revokes refresh tokens; the open session is
 * kicked out by the client's listener on users/{uid}.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const caller = await requireAdmin(req);
    const { uid } = await params;
    const input = await parseBody(req, updateUserSchema);

    if (uid === caller.uid && (input.active === false || (input.role && input.role !== "admin"))) {
      throw new HttpError(400, "You can't deactivate or demote your own account");
    }

    const userRef = adminDb().doc(`users/${uid}`);
    const existing = await userRef.get();
    if (!existing.exists) throw new HttpError(404, "User not found");

    const authUpdate: { displayName?: string; disabled?: boolean } = {};
    if (input.name) authUpdate.displayName = input.name;
    if (input.active !== undefined) authUpdate.disabled = !input.active;
    if (Object.keys(authUpdate).length) await adminAuth().updateUser(uid, authUpdate);

    if (input.role) {
      const { customClaims } = await adminAuth().getUser(uid);
      await adminAuth().setCustomUserClaims(uid, { ...customClaims, role: input.role });
    }
    if (input.active === false) await adminAuth().revokeRefreshTokens(uid);

    await userRef.update({
      ...input,
      ...(input.name ? { initials: initialsFromName(input.name) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
