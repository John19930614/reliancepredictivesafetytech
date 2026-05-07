import { describe, expect, it } from "vitest";
import { resolveWebsiteContentValue } from "./content-utils";
import { buildWebsiteNotificationDedupeKey, extractLinksFromHtml, inspectLinks, inspectSeo } from "./scan-utils";

describe("website operations scan utilities", () => {
  it("extracts links and flags unmanaged internal routes", () => {
    const links = extractLinksFromHtml(`
      <a href="/">Home</a>
      <a href="/missing">Missing</a>
      <a href="https://safety360docs.com">Platform</a>
      <a href="mailto:test@example.com">Email</a>
    `);
    const findings = inspectLinks(links, ["/"]);

    expect(findings).toEqual([
      expect.objectContaining({ href: "/", status: "ok" }),
      expect.objectContaining({ href: "/missing", status: "error" }),
      expect.objectContaining({ href: "https://safety360docs.com", status: "warning" }),
      expect.objectContaining({ href: "mailto:test@example.com", status: "ok" }),
    ]);
  });

  it("reports SEO gaps for short metadata", () => {
    const seo = inspectSeo("<html><head><title>Short</title></head><body><p>No heading</p></body></html>");

    expect(seo.contentGaps).toEqual([
      "Missing or short page title.",
      "Missing or short meta description.",
      "Missing H1.",
    ]);
  });

  it("uses stable notification dedupe keys", () => {
    expect(buildWebsiteNotificationDedupeKey("website_scan", "latest", "Website Scan Needs Review!")).toBe(
      "website:website_scan:latest:website-scan-needs-review",
    );
  });

  it("keeps static fallback content when no approved override exists", () => {
    const fallback = new Map([["home.hero.summary", "Static fallback"]]);
    const approved = new Map<string, string>();

    expect(resolveWebsiteContentValue(approved, fallback, "home.hero.summary")).toBe("Static fallback");

    approved.set("home.hero.summary", "Approved override");
    expect(resolveWebsiteContentValue(approved, fallback, "home.hero.summary")).toBe("Approved override");
  });
});
