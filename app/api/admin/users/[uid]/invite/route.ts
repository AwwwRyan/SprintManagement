import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { handleError, HttpError, requireAdmin } from "@/lib/server/require-admin";
import { sendPasswordSetupEmail } from "@/lib/firebase/password-email";

export const runtime = "nodejs";

/** POST /api/admin/users/:uid/invite: (re)send the "set your password" email. */
export async function POST(req: Request, { params }: { params: Promise<{ uid: string }> }) {
  try {
    await requireAdmin(req);
    const { uid } = await params;
    const user = await adminAuth().getUser(uid);
    if (!user.email) throw new HttpError(400, "User has no email address");
    if (user.disabled) throw new HttpError(400, "Reactivate the user before sending an invite");
    await sendPasswordSetupEmail(user.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
