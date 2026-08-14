import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { portalModuleKeys } from "@/lib/user-management";
import { grantStatusKeys } from "./statuses";

/**
 * Static guard over the Grant Tracker migration. It reads the SQL rather than a
 * database, so it runs in the normal `npm test` pass and still catches the
 * drift that only shows up at runtime: a status TypeScript accepts and the
 * CHECK rejects, or a module key the catalog offers and the constraint refuses.
 */
const migrationPath = join(process.cwd(), "supabase", "migrations", "20260816090000_grant_tracker.sql");
const sql = readFileSync(migrationPath, "utf8");

function parseInList(source: string, marker: string): string[] {
  const start = source.indexOf(marker);
  if (start === -1) return [];
  const open = source.indexOf("(", start + marker.length - 1);
  const close = source.indexOf(")", open);
  if (open === -1 || close === -1) return [];
  return source
    .slice(open + 1, close)
    .split(",")
    .map((part) => part.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);
}

describe("grant tracker migration parity", () => {
  it("lists exactly the TypeScript status keys in the status CHECK", () => {
    const checked = parseInList(sql, "status in (");
    // Guards against a reformat making this assertion vacuously true.
    expect(checked.length).toBeGreaterThan(5);
    expect([...checked].sort()).toEqual([...grantStatusKeys].sort());
  });

  it("keeps the module_key constraint in step with the module catalog", () => {
    const checked = parseInList(sql, "module_key in (");
    expect(checked.length).toBeGreaterThan(40);
    expect(new Set(checked)).toEqual(new Set(portalModuleKeys));
  });

  it("enables RLS and writes a policy for every operation", () => {
    expect(sql).toContain("alter table public.company_grant_opportunities enable row level security");
    for (const operation of ["for select", "for insert", "for update", "for delete"]) {
      expect(sql, `no policy ${operation}`).toContain(operation);
    }
  });

  it("attaches the updated_at trigger", () => {
    expect(sql).toContain("execute function public.set_updated_at()");
  });

  it("keeps status_changed_at in the database rather than the caller", () => {
    expect(sql).toContain("execute function public.set_grant_status_changed_at()");
  });

  it("documents a rollback", () => {
    expect(sql).toContain("ROLLBACK:");
    expect(sql).toContain("drop table if exists public.company_grant_opportunities;");
  });
});
