import { existsSync, readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { interactiveDemos } from "./interactive-demos";

const publicDir = path.resolve(__dirname, "../../public");

function readDemo(href: string) {
  return readFileSync(path.join(publicDir, href.replace(/^\//, "")), "utf8");
}

describe("interactiveDemos", () => {
  it("exposes unique keys and hrefs", () => {
    const keys = interactiveDemos.map((demo) => demo.key);
    const hrefs = interactiveDemos.map((demo) => demo.href);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it.each(interactiveDemos)("$key ships a complete standalone HTML document", (demo) => {
    expect(demo.href.startsWith("/demos/")).toBe(true);
    expect(existsSync(path.join(publicDir, demo.href.replace(/^\//, "")))).toBe(true);

    const html = readDemo(demo.href);
    expect(html).toMatch(/^<!DOCTYPE html>/i);
    expect(html).toContain("<title>");
    expect(html).toMatch(/<\/html>\s*$/i);
  });

  // The demos must render with no network access — they are shown live in
  // front of customers, so a missing CDN asset would break the walkthrough.
  it.each(interactiveDemos)("$key loads no external subresources", (demo) => {
    const html = readDemo(demo.href);

    const remoteTags = html.match(
      /<(?:script|img|iframe|link|source|video|audio)\b[^>]*\b(?:src|href)\s*=\s*["'](?:https?:)?\/\/[^"']*["'][^>]*>/gi,
    );
    const remoteCss = html.match(/(?:@import|url\()\s*["']?(?:https?:)?\/\//gi);

    expect(remoteTags ?? []).toEqual([]);
    expect(remoteCss ?? []).toEqual([]);
  });
});
