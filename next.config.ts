import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The emulator-only E2E server (scripts/dev-emulator.ts) uses its own build folder, so it can run
  // next to the normal dev server without the two corrupting each other's `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
