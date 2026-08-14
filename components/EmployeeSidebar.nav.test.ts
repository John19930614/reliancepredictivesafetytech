// The commercial half of the sidebar reads as the funnel a deal travels.
//
// This guards a REGROUPING, which is the kind of change that loses a link
// without anything failing: nine items under one heading became nine items
// under five, and a link dropped on the way would simply stop appearing. The
// module stays reachable by URL, the catalog parity suite still passes because
// it only checks the links that ARE there, and nobody notices until someone
// asks where Proposals went.
//
// So the assertions below are about two things: every commercial link survived
// the split exactly once, and the four funnel headings appear in the order a
// deal actually moves through them. Access is not in scope here and cannot be —
// canAccessEmployeePath resolves from the path prefix, and a heading is not
// part of that.
//
// Reads the source rather than importing it: EmployeeSidebar is a "use client"
// component pulling in next/image, next/link and a server-action module, none
// of which load in the node environment this suite runs in.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getPortalModuleForPath } from "@/lib/user-management";

const sidebarSource = readFileSync(join(process.cwd(), "components", "EmployeeSidebar.tsx"), "utf8");

/** The navGroups literal, as `{ label, hrefs }` in declaration order. */
function navGroups(): Array<{ label: string; hrefs: string[] }> {
  const start = sidebarSource.indexOf("const navGroups = [");
  expect(start, "navGroups literal not found").toBeGreaterThan(-1);
  const end = sidebarSource.indexOf("\n];", start);
  expect(end, "navGroups literal is not terminated").toBeGreaterThan(start);
  const body = sidebarSource.slice(start, end);

  const groups: Array<{ label: string; hrefs: string[] }> = [];
  // Split on the group labels themselves, so an href is attributed to the
  // heading it actually sits under rather than to position in the file.
  const labels = [...body.matchAll(/label:\s*"([^"]+)",\s*\n\s*items:\s*\[/g)];
  labels.forEach((match, index) => {
    const from = match.index! + match[0].length;
    const to = index + 1 < labels.length ? labels[index + 1].index! : body.length;
    const hrefs = [...body.slice(from, to).matchAll(/href:\s*"([^"]+)"/g)].map((href) => href[1]);
    groups.push({ label: match[1], hrefs });
  });
  return groups;
}

describe("the commercial sidebar reads as a funnel", () => {
  const groups = navGroups();
  const labels = groups.map((group) => group.label);

  it("parses the groups it is asserting about", () => {
    // Guards the parser: a reformat that broke the regex would otherwise make
    // every assertion below vacuously pass.
    expect(groups.length).toBeGreaterThan(5);
    expect(labels).toContain("Command");
    expect(groups.every((group) => group.hrefs.length > 0)).toBe(true);
  });

  it("carries the four funnel headings", () => {
    for (const label of ["Leads", "Opportunities", "Contracts", "Accounts"]) {
      expect(labels, `${label} is missing from the sidebar`).toContain(label);
    }
  });

  // Contracts before Accounts is the whole point: a company becomes an account
  // because a contract was signed, not the other way round.
  it("orders them the way a deal travels", () => {
    const funnel = labels.filter((label) => ["Leads", "Opportunities", "Contracts", "Accounts"].includes(label));
    expect(funnel).toEqual(["Leads", "Opportunities", "Contracts", "Accounts"]);
  });

  it("puts each commercial module under the stage it belongs to", () => {
    const find = (label: string) => groups.find((group) => group.label === label)?.hrefs ?? [];

    expect(find("Leads")).toEqual(["/employee/inbox", "/employee/demo-showcase"]);
    expect(find("Opportunities")).toEqual(["/employee/lifecycle", "/employee/sales"]);
    expect(find("Contracts")).toEqual(["/employee/proposals", "/employee/proposals/templates"]);
    expect(find("Accounts")).toEqual(["/employee/active-companies"]);
  });

  // The failure this file exists for: a regroup that silently drops a link.
  it("kept every commercial link, exactly once", () => {
    const commercial = [
      "/employee/inbox",
      "/employee/demo-showcase",
      "/employee/lifecycle",
      "/employee/sales",
      "/employee/proposals",
      "/employee/proposals/templates",
      "/employee/active-companies",
      "/employee/talent-engine",
      "/employee/mail",
    ];
    const all = groups.flatMap((group) => group.hrefs);

    for (const href of commercial) {
      expect(all.filter((candidate) => candidate === href), `${href} should appear exactly once`).toHaveLength(1);
    }
  });

  // Talent Engine is a staffing vertical and Mail is a mailbox. Filing either
  // under Leads or Accounts would make that heading mean less, not more.
  it("leaves what the funnel does not describe under Commercial", () => {
    expect(groups.find((group) => group.label === "Commercial")?.hrefs).toEqual([
      "/employee/talent-engine",
      "/employee/mail",
    ]);
  });

  // Regrouping is presentation. If a heading had become load-bearing for
  // access, moving a link between headings would change who can reach it.
  it("changes no module resolution — every funnel link maps to the same module as before", () => {
    expect(getPortalModuleForPath("/employee/inbox")?.key).toBe("request_inbox");
    expect(getPortalModuleForPath("/employee/demo-showcase")?.key).toBe("demo_showcase");
    expect(getPortalModuleForPath("/employee/lifecycle")?.key).toBe("client_lifecycle");
    expect(getPortalModuleForPath("/employee/sales")?.key).toBe("sales_pipeline");
    expect(getPortalModuleForPath("/employee/proposals")?.key).toBe("client_proposals");
    expect(getPortalModuleForPath("/employee/proposals/templates")?.key).toBe("client_proposals");
    expect(getPortalModuleForPath("/employee/active-companies")?.key).toBe("active_companies");
  });
});
