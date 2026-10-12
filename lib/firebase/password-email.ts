/**
 * Asks Firebase Auth to email a user a link to set their password (the "Password reset" email
 * template, editable in Firebase console → Authentication → Templates). Used for invites, so
 * Admins never have to choose or share passwords. Works against the Auth emulator too.
 * Shared by the Admin API route and scripts (no "server-only").
 */
import crypto from "node:crypto";

/** Random throwaway password for invited users; they replace it via the emailed link. */
export function randomPassword(): string {
  return `${crypto.randomBytes(24).toString("base64url")}aA1!`;
}

export async function sendPasswordSetupEmail(email: string): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is not set");
  const host =
    process.env.NEXT_PUBLIC_USE_EMULATORS === "true"
      ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099"}/identitytoolkit.googleapis.com`
      : "https://identitytoolkit.googleapis.com";
  const res = await fetch(`${host}/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Couldn't send the set-password email: ${body.error?.message ?? res.status}`);
  }
}
