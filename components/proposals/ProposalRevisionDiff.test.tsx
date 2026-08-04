// Render tests for the revision comparison.
//
// `lib/proposals/diff.test.ts` covers the comparison logic. These assertions are
// about what a reader SEES when deciding whether to restore a revision: which
// side is "before", which is "after", and whether a line item was added, removed
// or edited. Getting before/after backwards here is invisible to the pure diff
// tests and would make someone restore the wrong version.

import { describe, expect, it } from "vitest";
import { render, within } from "@testing-library/react";
import { diffGeneratorState } from "@/lib/proposals/diff";
import type { GeneratorItem, GeneratorState } from "@/lib/proposals/generator-state";
import { ProposalRevisionDiff } from "./ProposalRevisionDiff";

function item(overrides: Partial<GeneratorItem> & Pick<GeneratorItem, "key">): GeneratorItem {
  return { type: "phase", name: "", qty: 1, price: 0, desc: "", unit: "", ...overrides };
}

const older: GeneratorState = {
  v: 1,
  fields: { clientCompany: "Acme", discountPct: 10, rushFlag: true, retiredField: "gone" },
  phases: [
    item({ key: "discovery", name: "Discovery", qty: 1, price: 3500, desc: "Intake." }),
    item({ key: "build", name: "Build", qty: 1, price: 10000, desc: "Configure." }),
  ],
  services: [item({ type: "service", key: "osha10", name: "OSHA 10", qty: 5, price: 175, desc: "Training." })],
};

const newer: GeneratorState = {
  v: 1,
  fields: { clientCompany: "Acme Holdings", discountPct: 10, rushFlag: false, newField: "added" },
  phases: [
    item({ key: "discovery", name: "Discovery & Intake", qty: 2, price: 4000, desc: "Expanded intake." }),
    item({ key: "launch", name: "Launch", qty: 1, price: 8000, desc: "Go-live support." }),
  ],
  // Untouched — the services section must therefore not render at all.
  services: [item({ type: "service", key: "osha10", name: "OSHA 10", qty: 5, price: 175, desc: "Training." })],
};

function renderDiff(a: GeneratorState, b: GeneratorState) {
  return render(
    <ProposalRevisionDiff diff={diffGeneratorState(a, b)} beforeLabel="v3" afterLabel="v7 (current)" />,
  );
}

/** The `<li>` whose chip reads `label` and whose bolded name is `name`. */
function entry(container: HTMLElement, label: string, name: string): HTMLElement {
  const items = Array.from(container.querySelectorAll<HTMLElement>("li"));
  const found = items.find(
    (li) =>
      li.querySelector(".badge")?.textContent?.trim() === label &&
      li.querySelector("strong")?.textContent?.trim() === name,
  );
  if (!found) throw new Error(`No "${label}" entry for "${name}".`);
  return found;
}

function sectionFor(container: HTMLElement, title: string): HTMLElement | null {
  const heading = Array.from(container.querySelectorAll("h4")).find((h) => h.textContent?.trim() === title);
  return (heading?.parentElement as HTMLElement) ?? null;
}

describe("ProposalRevisionDiff — populated diff", () => {
  it("states which revisions are being compared and counts every kind of change", () => {
    const { container } = renderDiff(older, newer);
    expect(container.querySelector("p")?.textContent).toBe(
      "Comparing v3 with v7 (current) — 4 fields · 1 line item added · 1 line item removed · 1 line item changed.",
    );
  });

  it("renders changed fields with the older value on the before side", () => {
    const { container } = renderDiff(older, newer);
    const table = container.querySelector(".data-table") as HTMLElement;

    const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent);
    expect(headers).toEqual(["Field", "v3", "v7 (current)"]);

    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr")).map((row) =>
      Array.from(row.cells).map((cell) => cell.textContent),
    );

    // Keys are humanized and sorted; a field only on one side renders as a dash
    // on the other, and booleans read as Yes/No rather than "true"/"false".
    //
    // NOTE the humanized casing is title-ish ("Client Company"), not the
    // sentence case the humanizeKey() doc comment in ProposalRevisionDiff.tsx
    // advertises ("Client company"). The comment is what is wrong; this pins the
    // behaviour actually shipped.
    expect(rows).toEqual([
      ["Client Company", "Acme", "Acme Holdings"],
      ["New Field", "—", "added"],
      ["Retired Field", "gone", "—"],
      ["Rush Flag", "Yes", "No"],
    ]);

    // An unchanged field must not appear at all — noise here hides real edits.
    expect(table.textContent).not.toContain("Discount Pct");
  });

  it("renders a removed line item with its old quantity and price", () => {
    const { container } = renderDiff(older, newer);
    const removed = entry(container, "Removed", "Build");
    expect(removed.querySelector(".badge")).toHaveClass("badge-red");
    expect(removed.textContent).toContain("1 × $10,000");
  });

  it("renders an added line item with its new quantity and price", () => {
    const { container } = renderDiff(older, newer);
    const added = entry(container, "Added", "Launch");
    expect(added.querySelector(".badge")).toHaveClass("badge-green");
    expect(added.textContent).toContain("1 × $8,000");
  });

  it("renders a changed line item as an attribute-by-attribute before/after table", () => {
    const { container } = renderDiff(older, newer);
    // The entry is titled with the item's NEW name — the reader is deciding
    // about the current state of the row.
    const changed = entry(container, "Changed", "Discovery & Intake");
    expect(changed.querySelector(".badge")).toHaveClass("badge-yellow");

    const rows = Array.from(changed.querySelectorAll<HTMLTableRowElement>("tbody tr")).map((row) =>
      Array.from(row.cells).map((cell) => cell.textContent),
    );
    expect(rows).toEqual([
      ["Name", "Discovery", "Discovery & Intake"],
      ["Quantity", "1", "2"],
      // Prices are money-formatted on both sides, not raw numbers.
      ["Price", "$3,500", "$4,000"],
      ["Description", "Intake.", "Expanded intake."],
    ]);
  });

  it("omits a list section entirely when that list did not change", () => {
    const { container } = renderDiff(older, newer);
    expect(sectionFor(container, "Phases")).not.toBeNull();
    expect(sectionFor(container, "Services")).toBeNull();
  });

  it("labels an item that has no name, falling back to its catalog key", () => {
    const before: GeneratorState = { v: 1, fields: {}, phases: [], services: [] };
    const after: GeneratorState = {
      v: 1,
      fields: {},
      phases: [item({ key: "build", name: "", qty: 1, price: 500 }), item({ key: "", name: "", qty: 1, price: 25 })],
      services: [],
    };
    const { container } = renderDiff(before, after);
    expect(entry(container, "Added", "build")).toBeDefined();
    expect(entry(container, "Added", "Untitled line item")).toBeDefined();
  });
});

describe("ProposalRevisionDiff — empty diff", () => {
  it("says the two revisions are identical instead of rendering an empty table", () => {
    const { container, getByText } = renderDiff(older, older);

    expect(getByText("v3 and v7 (current) are identical — no fields or line items differ.")).toHaveClass(
      "empty-state",
    );
    // No half-rendered scaffolding behind the empty state.
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector(".badge")).toBeNull();
  });

  it("treats a revision that stored no generator data as an all-additions diff, not a crash", () => {
    // Older revisions predate form_data persistence; diffing against null must
    // still render something a human can read.
    const { container } = render(
      <ProposalRevisionDiff
        diff={diffGeneratorState(null, newer)}
        beforeLabel="v1"
        afterLabel="v7 (current)"
      />,
    );
    const table = container.querySelector(".data-table") as HTMLElement;
    expect(within(table).getByText("Client Company")).toBeInTheDocument();
    expect(entry(container, "Added", "Discovery & Intake")).toBeDefined();
    expect(entry(container, "Added", "OSHA 10")).toBeDefined();
  });
});
