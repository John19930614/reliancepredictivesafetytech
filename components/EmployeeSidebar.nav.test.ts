// The navigation is seven workspaces, and this file exists to stop a link
// disappearing into one of them.
//
// This guards a REGROUPING, which is the kind of change that loses a link
// without anything failing: fifty links under nine org-chart headings became
// fifty-two under seven workspaces, and a link dropped on the way would simply
// stop appearing. The module stays reachable by URL, the catalog parity suite
// still passes because it only checks the links that ARE there, and nobody
// notices until someone asks where Proposals went.
//
// So the assertions below are about two things: every link that existed before
// the regroup still exists exactly once, and no heading became load-bearing for
// access. Access cannot be asserted from a heading — canAccessEmployeePath
// resolves from the path prefix — so the last test pins module resolution
// instead, which is the thing that actually decides who can reach what.
//
// Reads the source rather than importing it: EmployeeSidebar is a "use client"
// component pulling in next/image, next/link and a server-action module, none
// of which load in the node environment this suite runs in.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getPortalModuleForPath } from "@/lib/user-management";

const sidebarSource = readFileSync(join(process.cwd(), "components", "EmployeeSidebar.tsx"), "utf8");

/** The workspaces literal, as `{ key, hrefs }` in declaration order. */
function workspaces(): Array<{ key: string; hrefs: string[] }> {
  const start = sidebarSource.indexOf("const workspaces = [");
  expect(start, "workspaces literal not found").toBeGreaterThan(-1);
  const end = sidebarSource.indexOf("\n];", start);
  expect(end, "workspaces literal is not terminated").toBeGreaterThan(start);
  const body = sidebarSource.slice(start, end);

  const result: Array<{ key: string; hrefs: string[] }> = [];
  // Split on the workspace keys themselves, so an href is attributed to the
  // workspace it actually sits under rather than to position in the file.
  const keys = [...body.matchAll(/^\s{4}key:\s*"([^"]+)",$/gm)];
  keys.forEach((match, index) => {
    const from = match.index! + match[0].length;
    const to = index + 1 < keys.length ? keys[index + 1].index! : body.length;
    const hrefs = [...body.slice(from, to).matchAll(/href:\s*"([^"]+)"/g)].map((href) => href[1]);
    result.push({ key: match[1], hrefs });
  });
  return result;
}

/**
 * Every href the org-chart sidebar carried before the regroup. Hard-coded on
 * purpose: reading it from git would make the test pass by construction, and
 * this list is exactly the thing a careless edit is allowed to shrink.
 */
const linksBeforeTheRegroup = [
  "/employee",
  "/m",
  "/employee/ai",
  "/employee/website-operations",
  "/employee/work",
  "/employee/parking-lots",
  "/employee/expenses",
  "/employee/reports",
  "/employee/finance",
  "/employee/payroll",
  "/employee/grants",
  "/employee/operations",
  "/employee/checklist",
  "/employee/inbox",
  "/employee/demo-showcase",
  "/employee/lifecycle",
  "/employee/sales",
  "/employee/proposals",
  "/employee/proposals/templates",
  "/employee/active-companies",
  "/employee/talent-engine",
  "/employee/mail",
  "/employee/company-tree",
  "/employee/hr-onboarding",
  "/employee/training",
  "/employee/performance",
  "/employee/hr-documents",
  "/employee/time-cards",
  "/employee/time-off",
  "/employee/calendar",
  "/employee/documents",
  "/employee/files",
  "/employee/document-builder",
  "/employee/legal-issues",
  "/employee/legal-register",
  "/employee/required-documents",
  "/employee/launch-gate",
  "/employee/users",
  "/employee/settings",
  "/employee/platform/sprint",
  "/employee/platform/releases",
  "/employee/platform/qa",
  "/employee/platform/metrics",
  "/employee/platform/docs",
  "/employee/platform/packages",
  "/employee/platform/billing",
  "/employee/platform/audit",
  "/employee/platform/ai-services",
  "/employee/platform/infrastructure",
  "/employee/platform/dev-command",
];

describe("the workspace rail keeps every link the org-chart sidebar had", () => {
  const parsed = workspaces();
  const keys = parsed.map((workspace) => workspace.key);
  const allHrefs = parsed.flatMap((workspace) => workspace.hrefs);

  it("parses the workspaces it is asserting about", () => {
    // Guards the parser: a reformat that broke the regex would otherwise make
    // every assertion below vacuously pass.
    expect(parsed.length).toBe(7);
    expect(parsed.every((workspace) => workspace.hrefs.length > 0)).toBe(true);
  });

  it("carries the seven workspaces in the order the rail shows them", () => {
    expect(keys).toEqual(["today", "revenue", "talent", "people", "governance", "operations", "platform"]);
  });

  // The failure this file exists for: a regroup that silently drops a link.
  it("kept every previous link, exactly once", () => {
    for (const href of linksBeforeTheRegroup) {
      expect(allHrefs.filter((candidate) => candidate === href), `${href} should appear exactly once`).toHaveLength(1);
    }
  });

  it("lists no link twice anywhere on the rail", () => {
    expect(allHrefs.length).toBe(new Set(allHrefs).size);
  });

  // Both of these had a working page and no way to reach it except by typing
  // the URL. They are the only additions the regroup is allowed to make.
  it("surfaces the two pages that had no link at all", () => {
    expect(allHrefs).toContain("/employee/proposals/bio");
    expect(allHrefs).toContain("/employee/invoices");
    expect(new Set(allHrefs)).toEqual(new Set([...linksBeforeTheRegroup, "/employee/proposals/bio", "/employee/invoices"]));
  });

  it("files the commercial surfaces under Revenue", () => {
    const revenue = parsed.find((workspace) => workspace.key === "revenue")?.hrefs ?? [];

    for (const href of ["/employee/sales", "/employee/lifecycle", "/employee/active-companies", "/employee/proposals", "/employee/invoices", "/employee/grants", "/employee/finance"]) {
      expect(revenue, `${href} belongs under Revenue`).toContain(href);
    }
  });

  // Regrouping is presentation. If a workspace had become load-bearing for
  // access, moving a link between workspaces would change who can reach it.
  it("changes no module resolution — every link maps to the module it always did", () => {
    expect(getPortalModuleForPath("/employee/inbox")?.key).toBe("request_inbox");
    expect(getPortalModuleForPath("/employee/demo-showcase")?.key).toBe("demo_showcase");
    expect(getPortalModuleForPath("/employee/lifecycle")?.key).toBe("client_lifecycle");
    expect(getPortalModuleForPath("/employee/sales")?.key).toBe("sales_pipeline");
    expect(getPortalModuleForPath("/employee/proposals")?.key).toBe("client_proposals");
    expect(getPortalModuleForPath("/employee/proposals/templates")?.key).toBe("client_proposals");
    expect(getPortalModuleForPath("/employee/proposals/bio")?.key).toBe("client_proposals");
    expect(getPortalModuleForPath("/employee/active-companies")?.key).toBe("active_companies");
    expect(getPortalModuleForPath("/employee/grants")?.key).toBe("grant_tracker");
  });

  // The ledger is new, so this is the one resolution the regroup does add. It
  // rides the finance module deliberately: portal_user_module_access has a
  // CHECK constraint enumerating the allowed keys, so a key of its own would
  // be ungrantable until a migration caught up.
  it("puts the invoice ledger behind the finance module", () => {
    expect(getPortalModuleForPath("/employee/invoices")?.key).toBe("finance");
  });
});
