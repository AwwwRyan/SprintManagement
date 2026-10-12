import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { handleError, parseBody, requireAdmin } from "@/lib/server/require-admin";
import { createUserSchema } from "@/lib/validation";
import { initialsFromName } from "@/lib/utils";
import { randomPassword, sendPasswordSetupEmail } from "@/lib/firebase/password-email";

export const runtime = "nodejs";

/**
 * POST /api/admin/users: create an Auth user, set the role claim, write users/{uid}.
 * With `invite: true` (default) the user gets a random password and an email link to set their own.
 */
export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    const input = await parseBody(req, createUserSchema);

    const user = await adminAuth().createUser({
      email: input.email,
      password: input.invite ? randomPassword() : input.password,
      displayName: input.name,
    });
    try {
      await adminAuth().setCustomUserClaims(user.uid, { role: input.role });
      await adminDb()
        .doc(`users/${user.uid}`)
        .set({
          name: input.name,
          email: input.email,
          role: input.role,
          designation: input.designation,
          active: true,
          initials: initialsFromName(input.name),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
    } catch (err) {
      await adminAuth().deleteUser(user.uid).catch(() => undefined); // roll back the half-created user
      throw err;
    }
    let emailSent = false;
    if (input.invite) {
      // The account exists either way; if the email fails the Admin can resend from the Users page.
      emailSent = await sendPasswordSetupEmail(input.email).then(
        () => true,
        (err) => (console.error(err), false),
      );
    }
    return NextResponse.json({ uid: user.uid, invited: input.invite, emailSent }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
