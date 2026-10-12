/**
 * Bulk-adds team members from a JSON file. New users get a random password and a Firebase
 * "set your password" email; existing users (matched by email) get their name/role/designation
 * updated and no email. Nobody's password is ever chosen or shared by an admin.
 *
 *   npx tsx scripts/invite-users.ts team.json            # preview only, changes nothing
 *   npx tsx scripts/invite-users.ts team.json --apply    # create/update + send emails
 *   npx tsx scripts/invite-users.ts team.json --apply --no-email
 *       create accounts now, invite later (Admin → Users → "Send set-password email", or
 *       `npx tsx scripts/invite-users.ts team.json --send-invites`)
 *
 * team.json: [{ "name": "…", "email": "…", "role": "admin|qa|developer", "designation": "…" }]
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import fs from "node:fs";
import { z } from "zod";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { emulatorsEnabled, getAdminApp } from "../lib/firebase/admin-core";
import { randomPassword, sendPasswordSetupEmail } from "../lib/firebase/password-email";
import { initialsFromName } from "../lib/utils";
import { ROLES } from "../types";

const memberSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ROLES),
  designation: z.string().trim().max(100).default(""),
});

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) {
    console.error("Usage: npx tsx scripts/invite-users.ts <team.json> [--apply [--no-email]] | [--send-invites]");
    process.exitCode = 1;
    return;
  }
  const apply = flags.includes("--apply");
  const noEmail = flags.includes("--no-email");
  const sendInvites = flags.includes("--send-invites");
  const parsed = z.array(memberSchema).safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) console.error(`✖ entry ${issue.path.join(".")}: ${issue.message}`);
    process.exitCode = 1;
    return;
  }
  const app = getAdminApp();
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (sendInvites) {
    // Later step: email set-password links to existing, active members of the file.
    for (const m of parsed.data) {
      const user = await auth.getUserByEmail(m.email).catch(() => null);
      if (!user) console.log(`✖ ${m.email}: no account yet (run --apply first)`);
      else if (user.disabled) console.log(`✖ ${m.email}: deactivated, skipped`);
      else {
        const sent = await sendPasswordSetupEmail(m.email).then(() => true, (err: Error) => (console.error(`  ${err.message}`), false));
        console.log(`${sent ? "✔ invite sent" : "✖ EMAIL FAILED"}  ${m.name} <${m.email}>`);
      }
    }
    return;
  }

  console.log(`${apply ? "APPLYING to" : "Preview for"} ${emulatorsEnabled() ? "LOCAL EMULATORS" : `project ${app.options.projectId ?? process.env.FIREBASE_ADMIN_PROJECT_ID}`}\n`);

  for (const m of parsed.data) {
    const existing = await auth.getUserByEmail(m.email).catch(() => null);
    const label = `${m.name} <${m.email}> as ${m.role}${m.designation ? ` (${m.designation})` : ""}`;
    if (!apply) {
      console.log(`${existing ? "update" : "invite"}  ${label}`);
      continue;
    }
    const uid = existing ? existing.uid : (await auth.createUser({ email: m.email, password: randomPassword(), displayName: m.name })).uid;
    await auth.setCustomUserClaims(uid, { ...(existing?.customClaims ?? {}), role: m.role });
    await db.doc(`users/${uid}`).set(
      {
        name: m.name,
        email: m.email,
        role: m.role,
        designation: m.designation,
        active: true,
        initials: initialsFromName(m.name),
        updatedAt: FieldValue.serverTimestamp(),
        ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
    if (existing) {
      console.log(`✔ updated  ${label}`);
    } else if (noEmail) {
      console.log(`✔ created  ${label} (no email sent; they can't sign in until invited)`);
    } else {
      const sent = await sendPasswordSetupEmail(m.email).then(
        () => true,
        (err: Error) => (console.error(`  ${err.message}`), false),
      );
      console.log(`✔ invited  ${label}${sent ? " (email sent)" : " (account created, EMAIL FAILED, resend from Admin → Users)"}`);
    }
  }
  if (!apply) console.log("\nNothing changed. Re-run with --apply to create the accounts and send the emails.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
