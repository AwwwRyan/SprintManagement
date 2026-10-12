import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { handleError, parseBody, requireAdmin } from "@/lib/server/require-admin";
import { resetPasswordSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** POST /api/admin/users/:uid/password: Admin sets a new password for a user. */
export async function POST(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  try {
    await requireAdmin(req);
    const { uid } = await params;
    const { password } = await parseBody(req, resetPasswordSchema);
    await adminAuth().updateUser(uid, { password });
    await adminAuth().revokeRefreshTokens(uid); // sign the user out everywhere
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
