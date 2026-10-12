/**
 * Starts a dev server wired to the LOCAL EMULATORS on http://localhost:3001, regardless of what
 * .env.local says. Used by the E2E suite so tests never touch the real Firebase project.
 *
 *   npm run emulators          (terminal 1)
 *   npm run dev:emulator       (terminal 2; or let `npm run test:e2e` start it)
 */
import { config } from "dotenv";
import { spawn } from "node:child_process";

// Values already in process.env win over files in Next.js, so these override .env.local.
const { parsed = {} } = config({ path: ".env.emulator", quiet: true });
const env = {
  ...process.env,
  ...parsed,
  NEXT_PUBLIC_USE_EMULATORS: "true",
  NEXT_DIST_DIR: ".next-e2e",
  // no real Google credentials locally: skip the slow GCP metadata-server probe
  METADATA_SERVER_DETECTION: "none",
};

const child = spawn("npx", ["next", "dev", "-p", "3001"], { stdio: "inherit", shell: true, env });
child.on("exit", (code) => (process.exitCode = code ?? 0));
