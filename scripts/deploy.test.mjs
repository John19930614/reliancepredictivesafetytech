import { describe, expect, it } from "vitest";
import { filterBlockingPaths } from "./deploy.mjs";

// The deploy gate's judgement call: which dirty paths mean "someone's work
// would ship unrecorded" and which are dev-machine noise on this box.
describe("filterBlockingPaths", () => {
  it("treats a clean tree as nothing to block on", () => {
    expect(filterBlockingPaths("")).toEqual([]);
    expect(filterBlockingPaths(null)).toEqual([]);
    expect(filterBlockingPaths(undefined)).toEqual([]);
  });

  it("ignores the two artifacts that are always dirty on this machine", () => {
    const porcelain = [" M next-env.d.ts", " M .claude/launch.json", "?? .claude/worktrees/thing"].join("\n");
    expect(filterBlockingPaths(porcelain)).toEqual([]);
  });

  it("blocks on real modified and untracked source", () => {
    const porcelain = [" M next-env.d.ts", " M lib/proposals/pricing.ts", "?? app/employee/new/page.tsx"].join("\n");
    expect(filterBlockingPaths(porcelain)).toEqual(["lib/proposals/pricing.ts", "app/employee/new/page.tsx"]);
  });

  it("judges a rename by its destination, which is what would ship", () => {
    expect(filterBlockingPaths("R  lib/old-name.ts -> lib/new-name.ts")).toEqual(["lib/new-name.ts"]);
  });

  it("handles staged, quoted and backslash paths", () => {
    const porcelain = ['A  "app/employee/with space/page.tsx"', "M  lib\\files\\access.ts"].join("\n");
    expect(filterBlockingPaths(porcelain)).toEqual([
      "app/employee/with space/page.tsx",
      "lib/files/access.ts",
    ]);
  });

  it("does not mistake a file merely named like the ignored ones", () => {
    // next-env.d.ts is ignored only at the repo root, and .claude only as a
    // directory prefix — a source file that happens to contain those strings
    // must still block.
    const porcelain = [" M app/next-env.d.ts.backup", " M lib/.claude-helper.ts"].join("\n");
    expect(filterBlockingPaths(porcelain)).toEqual(["app/next-env.d.ts.backup", "lib/.claude-helper.ts"]);
  });
});
