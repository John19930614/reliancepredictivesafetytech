// The only supported way to ship this app to production.
//
// No shebang on purpose: this always runs as `node scripts/deploy.mjs` via the
// npm script, and on this Windows checkout git rewrites the file with CRLF
// endings, which turns a shebang line into a parse error for the test runner
// that imports this module.
//
// Production deploys run `vercel --prod` from the LOCAL WORKING TREE — merging
// to main does not deploy anything. That means whatever is on disk at the
// moment of the command is what ships, including uncommitted edits, and
// including edits made by a concurrent session in the same tree. CI runs the
// test suite on push, but CI is not on the path to production, so the suite has
// never actually gated a release.
//
// This script puts it on the path: clean tree, typecheck, full suite, then
// deploy. Any failure stops before Vercel is invoked.
//
//   npm run deploy              ship it
//   npm run deploy -- --dry-run run every check, print what would happen, stop
//
// Deliberately dependency-free and plain Node so it cannot itself break the
// deploy path.

import { spawnSync } from "node:child_process";

const dryRun = process.argv.includes("--dry-run");

/**
 * Local-machine artifacts that are habitually dirty on the dev box and carry no
 * shippable meaning: `next dev` rewrites next-env.d.ts to .next/dev paths, and
 * .claude/ holds session and worktree state. Anything else dirty is real work
 * that must be committed or stashed, so that what ships equals what is on a
 * branch someone can go back and read.
 */
const IGNORED_DIRTY = [/^next-env\.d\.ts$/, /^\.claude\//];

/** Porcelain paths that should block the deploy. Exported for tests. */
export function filterBlockingPaths(porcelain) {
  return String(porcelain ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // "XY path" and, for renames, "XY old -> new": the destination is what
      // would ship, so that is the path we judge.
      const path = line.slice(2).trim();
      const arrow = path.indexOf(" -> ");
      return arrow === -1 ? path : path.slice(arrow + 4).trim();
    })
    .map((path) => path.replace(/^"|"$/g, "").replace(/\\/g, "/"))
    .filter((path) => !IGNORED_DIRTY.some((pattern) => pattern.test(path)));
}

function step(label) {
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 60 - label.length))}`);
}

function run(command, args) {
  // shell:true so npx/npm resolve through .cmd shims on Windows, which is the
  // machine this actually ships from.
  const result = spawnSync(command, args, { stdio: "inherit", shell: true });
  return result.status === 0;
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: true });
  return result.status === 0 ? String(result.stdout ?? "") : null;
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function main() {
  step("Working tree");
  const porcelain = capture("git", ["status", "--porcelain"]);
  if (porcelain === null) fail("Could not read git status. Is this a git repository?");

  const blocking = filterBlockingPaths(porcelain);
  if (blocking.length > 0) {
    console.error("Uncommitted changes would ship without being recorded anywhere:");
    for (const path of blocking) console.error(`    ${path}`);
    fail("Commit or stash these before deploying.");
  }
  console.log("Clean (ignoring next-env.d.ts and .claude/).");

  const branch = (capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]) ?? "").trim();
  const sha = (capture("git", ["rev-parse", "--short", "HEAD"]) ?? "").trim();
  console.log(`On ${branch || "unknown branch"} at ${sha || "unknown commit"}.`);
  if (branch && branch !== "main") {
    console.log(`\n⚠  Deploying from "${branch}", not main. This ships that branch's code to production.`);
  }

  step("Type check");
  if (!run("npm", ["run", "typecheck"])) fail("Type check failed. Production deploy stopped.");

  step("Test suite");
  if (!run("npx", ["vitest", "run"])) fail("Tests failed. Production deploy stopped.");

  step("Deploy");
  if (dryRun) {
    console.log("[dry-run] All gates passed. Would run: npx vercel --prod --yes");
    process.exit(0);
  }

  if (!run("npx", ["vercel", "--prod", "--yes"])) fail("Vercel deploy failed.");
  console.log(`\n✓ Deployed ${branch}@${sha}.`);
}

// Importable by the test without deploying anything.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href) {
  main();
}
