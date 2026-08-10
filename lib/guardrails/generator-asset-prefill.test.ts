import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The proposal generator's inputs must never ship pre-filled prose. The
// embedded editor autosaves EVERY field value into client_proposals.form_data,
// and the document renderer cannot tell an example from an entry — so a value
// baked into the asset prints on a client-facing document as though the seller
// wrote it. That is how live proposals shipped addressed to "Client
// Representative" at "Street Address / City, State ZIP" (cleaned up in
// 20260809102000), and how a real draft's Executive Summary opened with the
// asset's writing guidance ("Summarize the engagement in two or three
// sentences: ...", cleaned up in 20260809190000).
//
// Guidance belongs in the `placeholder` attribute — visible in the editor,
// never part of the value, never autosaved. If this test fails, move the
// content there and re-run `node scripts/build-proposal-generator.mjs`.

const ROOT = join(__dirname, "..", "..");
const ASSET_PATH = join(ROOT, "assets", "proposal-generator-v15.html");
const BUILT_PATH = join(ROOT, "lib", "proposals", "generator-html.ts");

/**
 * Textareas that legitimately ship content: real default document copy that is
 * MEANT to print verbatim when the seller leaves it alone. Guidance about how
 * to write a section is never that.
 */
const TEXTAREA_CONTENT_ALLOWLIST = new Set(["customExclusions"]);

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? match[1] : null;
}

describe("proposal generator asset ships no pre-filled prose", () => {
  const asset = readFileSync(ASSET_PATH, "utf8");

  it("no text-type <input> carries a static value", () => {
    const offenders: string[] = [];
    for (const tag of asset.match(/<input\b[^>]*>/g) ?? []) {
      const value = attr(tag, "value");
      if (value === null || value.trim() === "") continue;
      // `value="${...}"` is a runtime row template inside the generator's own
      // script, filled from saved state — not static content.
      if (value.includes("${")) continue;
      const type = (attr(tag, "type") ?? "text").toLowerCase();
      // Numeric defaults (price, counts, percentages) are functional settings
      // the seller adjusts in place; hidden inputs are bridge storage. Prose
      // lives in type="text" and is what must never be pre-filled.
      if (type === "number" || type === "hidden") continue;
      offenders.push(tag);
    }
    expect(offenders).toEqual([]);
  });

  it("no <textarea> ships content outside the allowlist", () => {
    const offenders: string[] = [];
    for (const match of asset.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)) {
      const [, attrs, content] = match;
      if (content.trim() === "") continue;
      const id = attr(`<textarea ${attrs}>`, "id") ?? "(no id)";
      if (TEXTAREA_CONTENT_ALLOWLIST.has(id)) continue;
      offenders.push(id);
    }
    expect(offenders).toEqual([]);
  });

  it("the built generator html is in sync on the summary field", () => {
    // generator-html.ts is generated from the asset; a fixed asset with a stale
    // build would keep serving the defect. The full build is bridge-injection
    // over the same bytes, so the field's shape must match on both sides.
    const built = readFileSync(BUILT_PATH, "utf8");
    expect(asset).toContain('<textarea id="customSummary" placeholder=');
    expect(built).toContain('<textarea id=\\"customSummary\\" placeholder=');
    expect(built).not.toContain(">Summarize the engagement");
  });
});
