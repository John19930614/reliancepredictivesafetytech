import { defineConfig, defaultExclude } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // .claude holds session scratch (including stale worktree copies of the
    // repo) — never a source of this project's tests.
    exclude: [...defaultExclude, "**/.claude/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "__mocks__/server-only.ts"),
    },
  },
});
