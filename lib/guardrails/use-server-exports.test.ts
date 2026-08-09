import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Next.js only allows async-function exports from a `"use server"` file. Any
// other runtime export — a const object, an enum, a sync function — builds
// fine and then throws at module evaluation the first time ANY action in the
// file is invoked:
//
//   Error: A "use server" file can only export async functions, found object.
//
// which the user sees as the route's error boundary. That is exactly how
// exporting `contactLimits` from app/employee/clients/[id]/actions.ts took
// down "Save address" on the client record page in production (2026-08-09).
// TypeScript can't catch it (`export interface` / `export type` are legal and
// erased), and `next build` didn't either — so this scan is the tripwire.
//
// If this test fails: either drop the `export` keyword (limits only the file
// itself reads) or move the value into a plain sibling module (limits a client
// component reads, e.g. app/employee/proposals/bio/limits.ts).

const ROOT = join(__dirname, "..", "..");
const SOURCE_ROOTS = ["app", "components", "lib"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".claude", ".vercel"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...sourceFiles(join(dir, entry.name)));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

/**
 * The directive must be the first statement — leading comments are allowed.
 * Scanned line by line rather than with one regex over the file: an
 * alternation like `(?:\s|\/\/[^\n]*\n?)*` backtracks exponentially on the
 * long leading comment blocks this codebase opens nearly every file with.
 */
function isUseServerFile(source: string): boolean {
  let inBlockComment = false;
  for (const raw of source.split("\n")) {
    let line = raw.trim();
    if (inBlockComment) {
      const end = line.indexOf("*/");
      if (end === -1) continue;
      line = line.slice(end + 2).trim();
      inBlockComment = false;
    }
    while (line.startsWith("/*")) {
      const end = line.indexOf("*/", 2);
      if (end === -1) {
        inBlockComment = true;
        line = "";
        break;
      }
      line = line.slice(end + 2).trim();
    }
    if (line === "" || line.startsWith("//")) continue;
    return line.startsWith('"use server"') || line.startsWith("'use server'");
  }
  return false;
}

/**
 * Export forms that put a non-async-function value on the module at runtime.
 * `export type` / `export interface` are erased by the compiler and legal;
 * `export async function` and `export const x = async (...)` are the only
 * runtime exports Next.js accepts.
 */
function disallowedExports(source: string): { line: number; text: string }[] {
  const violations: { line: number; text: string }[] = [];
  source.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (!line.startsWith("export ")) return;
    if (/^export\s+(type|interface)\b/.test(line)) return;
    if (/^export\s+(default\s+)?async\b/.test(line)) return;
    if (/^export\s+(const|let|var)\s+\w+(\s*:\s*[^=]+)?\s*=\s*async\b/.test(line)) return;
    violations.push({ line: index + 1, text: line });
  });
  return violations;
}

describe("use server files export only async functions", () => {
  it("finds no non-async-function exports in any 'use server' file", () => {
    const failures: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFiles(join(ROOT, root))) {
        const source = readFileSync(file, "utf8");
        if (!isUseServerFile(source)) continue;
        for (const violation of disallowedExports(source)) {
          failures.push(`${relative(ROOT, file)}:${violation.line} — ${violation.text}`);
        }
      }
    }
    expect(failures, `Non-async-function exports in "use server" files (each crashes every action in its file at runtime):\n${failures.join("\n")}`).toEqual([]);
  });

  it("recognizes the directive behind leading comments", () => {
    expect(isUseServerFile('"use server";\n')).toBe(true);
    expect(isUseServerFile("'use server';\nexport async function a() {}")).toBe(true);
    expect(isUseServerFile('// header\n// more header\n\n"use server";\n')).toBe(true);
    expect(isUseServerFile('/* block\n   comment */\n"use server";\n')).toBe(true);
    expect(isUseServerFile('/* inline */ "use server";\n')).toBe(true);
    expect(isUseServerFile('"use client";\nexport const x = 1;')).toBe(false);
    expect(isUseServerFile('// only a comment mentioning "use server"\nimport x from "y";')).toBe(false);
    expect(isUseServerFile("")).toBe(false);
  });

  it("recognizes the export forms this rule is about", () => {
    expect(disallowedExports('export const limits = Object.freeze({ a: 1 });')).toHaveLength(1);
    expect(disallowedExports("export enum Status { Open }")).toHaveLength(1);
    expect(disallowedExports("export function sync() {}")).toHaveLength(1);
    expect(disallowedExports('export { helper } from "./other";')).toHaveLength(1);
    expect(disallowedExports("export async function action() {}")).toHaveLength(0);
    expect(disallowedExports("export default async function action() {}")).toHaveLength(0);
    expect(disallowedExports("export const act = async () => {};")).toHaveLength(0);
    expect(disallowedExports("export interface Result { ok: boolean }")).toHaveLength(0);
    expect(disallowedExports("export type Result = { ok: boolean };")).toHaveLength(0);
  });
});
