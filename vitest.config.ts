import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@shared": resolve("src/shared") },
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [
      ["tests/renderer/**", "jsdom"],
      ["tests/xterm/**", "jsdom"],
    ],
    include: ["tests/**/*.test.ts"],
  },
});
