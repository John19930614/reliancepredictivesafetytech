import { defineConfig, defaultExclude } from "vitest/config";
import path from "path";

// One `vitest run`, two environments.
//
//   node — every pure-module suite. `*.test.ts` (plus `*.test.mjs` for the
//          deploy gate, which is plain Node by necessity — it guards the path
//          to production and must not depend on the TypeScript pipeline it
//          checks), environment "node", no setup file. Deliberately unchanged
//          otherwise: the DOM harness (jsdom construction, Testing Library,
//          jest-dom matchers) is not a cost the pure suites pay.
//   dom  — component and route-render suites. `*.test.tsx`, environment "jsdom",
//          plus ./vitest.setup.dom.ts.
//
// The split is by file extension rather than a per-file `@vitest-environment`
// docblock so it cannot be forgotten: a component test is .tsx and therefore
// gets a DOM, a pure test is .ts and therefore never boots one.
//
// `.claude` holds session scratch (including stale worktree copies of the repo)
// — never a source of this project's tests.
const exclude = [...defaultExclude, "**/.claude/**"];

export default defineConfig({
  test: {
    environment: "node",
    exclude,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["**/*.test.ts", "**/*.test.mjs"],
          exclude,
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["**/*.test.tsx"],
          exclude,
          setupFiles: ["./vitest.setup.dom.ts"],
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "__mocks__/server-only.ts"),
    },
  },
});
