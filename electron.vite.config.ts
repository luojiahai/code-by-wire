import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The renderer can't read package.json at runtime, and an IPC round-trip just to
// print the version would flash empty on launch. Bake it in at build time. CI
// gates the release tag against package.json, so this string is the real version.
const { version } = JSON.parse(
  readFileSync(resolve("package.json"), "utf8"),
) as { version: string };

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ["better-sqlite3", "node-pty"],
        // Second entry: the transcript parse-worker utilityProcess (src/main/parse-worker/),
        // forked by client.ts as out/main/parse-worker.js.
        input: {
          index: resolve("src/main/index.ts"),
          "parse-worker": resolve("src/main/parse-worker/worker.ts"),
        },
      },
    },
    resolve: {
      alias: { "@shared": resolve("src/shared") },
    },
  },
  preload: {
    resolve: {
      alias: { "@shared": resolve("src/shared") },
    },
  },
  renderer: {
    root: "src/renderer",
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
        "@renderer": resolve("src/renderer/src"),
      },
    },
    build: {
      rollupOptions: { input: { index: resolve("src/renderer/index.html") } },
    },
  },
});
