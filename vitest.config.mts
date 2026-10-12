import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // rules tests share one emulator; run files sequentially
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
