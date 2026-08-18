import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getPortalModuleForPath, portalModuleCatalog } from "../user-management";

// CLAUDE.md's NOTHING MISSED checklist asks for two things on every new module:
// a catalog entry in lib/user-management.ts and a nav entry in
// components/EmployeeSidebar.tsx. Nothing enforced that pairing, and the two
// halves fail in opposite, equally quiet ways:
//
//   - a sidebar link with no catalog module resolves to `null` in
//     canAccessEmployeePath(), so the item is filtered out of every sidebar and
//     the page is unreachable for everyone including owners;
//   - a catalog module with no sidebar link is reachable only by typing the URL,
//     so the grant an admin hands out in the Users page opens nothing visible.
//
// The sidebar is a "use client" component that imports next/image, next/link and
// a server-action module, so this suite reads its source rather than importing
// it — the same approach lib/proposals/catalog-parity.test.ts takes with the
// generator asset. This file lives under talent-engine because the EHS Talent
// Engine was the module that needed the guard, but the assertions are
// platform-wide: they cover every group in the sidebar.

const sidebarPath = join(process.cwd(), "components", "EmployeeSidebar.tsx");
const sidebarSource = readFileSync(sidebarPath, "utf8");

/**
 * `href: "..."` entries from the navGroups literal. The JSX below it writes
 * `href="/employee"` and `item.href === "/employee/ai"`, neither of which uses
 * the object-literal `href:` form, so neither is picked up here.
 */
function sidebarHrefs(): string[] {
  const start = sidebarSource.indexOf("const workspaces = [");
  expect(start, "workspaces literal not found in EmployeeSidebar.tsx").toBeGreaterThan(-1);
  const end = sidebarSource.indexOf("\n];", start);
  expect(end, "workspaces literal is not terminated").toBeGreaterThan(start);

  const hrefs: string[] = [];
  for (const match of sidebarSource.slice(start, end).matchAll(/href:\s*"([^"]+)"/g)) {
    hrefs.push(match[1]);
  }
  return hrefs;
}

describe("sidebar nav and the portal module catalog stay in sync", () => {
  const hrefs = sidebarHrefs();

  it("reads a plausible number of nav links out of the sidebar", () => {
    // Guards the parser itself: a refactor that renames workspaces or reformats
    // the entries would otherwise make every assertion below vacuously pass.
    expect(hrefs.length).toBeGreaterThan(30);
    expect(hrefs).toContain("/employee");
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("resolves every sidebar href to a catalog module", () => {
    for (const href of hrefs) {
      expect(getPortalModuleForPath(href)?.key, `${href} has no module in portalModuleCatalog`).toBeTruthy();
    }
  });

  it("gives every catalog module at least one sidebar link", () => {
    const linkedKeys = new Set(hrefs.map((href) => getPortalModuleForPath(href)?.key));
    for (const module of portalModuleCatalog) {
      expect(linkedKeys.has(module.key), `${module.key} has no link in EmployeeSidebar.tsx`).toBe(true);
    }
  });
});

describe("ehs_talent_engine is wired into both halves of the platform", () => {
  it("has a Commercial catalog entry whose prefix covers both tabs", () => {
    const module = portalModuleCatalog.find((entry) => entry.key === "ehs_talent_engine");
    expect(module, "ehs_talent_engine is missing from portalModuleCatalog").toBeDefined();
    expect(module!.group).toBe("Commercial");
    expect(module!.pathPrefixes).toEqual(["/employee/talent-engine"]);
    expect(getPortalModuleForPath("/employee/talent-engine")?.key).toBe("ehs_talent_engine");
    expect(getPortalModuleForPath("/employee/talent-engine/framework")?.key).toBe("ehs_talent_engine");
  });

  it("has exactly one sidebar link, pointing at the live console", () => {
    const talentHrefs = sidebarHrefs().filter((href) => getPortalModuleForPath(href)?.key === "ehs_talent_engine");
    // The framework tab is reached from the console's tab pair, not the
    // sidebar — a second nav row for the same module key would only duplicate
    // the entry without widening access.
    expect(talentHrefs).toEqual(["/employee/talent-engine"]);
  });

  it("adds no module key and no nav row for the web-sourcing review queue", () => {
    // /employee/talent-engine/leads is a sub-path reached from the console and
    // the framework reference, not a sidebar row. Both halves of the parity
    // check are load-bearing here and fail in opposite directions:
    //   - a second module key would mean a second grant, so the people already
    //     trusted with bill/pay/spread would land on the queue locked out;
    //   - a second sidebar row would satisfy the platform-wide checks above
    //     while only duplicating an entry that widens nobody's access.
    const talentModules = portalModuleCatalog.filter((entry) =>
      entry.pathPrefixes.some((prefix) => prefix.startsWith("/employee/talent-engine")),
    );
    expect(talentModules.map((entry) => entry.key)).toEqual(["ehs_talent_engine"]);
    expect(getPortalModuleForPath("/employee/talent-engine/leads")?.key).toBe("ehs_talent_engine");
    expect(sidebarHrefs()).not.toContain("/employee/talent-engine/leads");
  });

  it("is not handed out by default — the module shows bill rates, pay rates and margin", () => {
    expect(sidebarSource).toContain('label: "Talent Engine"');
    // Belt and braces alongside lib/user-management.test.ts: the grant has to be
    // deliberate, so it must never be added to the invite-time default set.
    const defaults = readFileSync(join(process.cwd(), "lib", "user-management.ts"), "utf8");
    const defaultsLine = defaults.split("\n").find((line) => line.includes("defaultEmployeePortalModuleKeys ="));
    expect(defaultsLine, "defaultEmployeePortalModuleKeys declaration not found").toBeDefined();
    expect(defaultsLine).not.toContain("ehs_talent_engine");
  });
});
