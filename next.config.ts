import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The emulator-only E2E server (scripts/dev-emulator.ts) uses its own build folder, so it can run
  // next to the normal dev server without the two corrupting each other's `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // "Sprints" were renamed "Releases" in the UI; keep old links (bookmarks, shared ?task= links) working.
  async redirects() {
    return [
      { source: "/sprints", destination: "/releases", permanent: true },
      { source: "/sprints/:path*", destination: "/releases/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
