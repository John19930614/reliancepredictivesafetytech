import { describe, expect, it } from "vitest";
import { diffGeneratorState, summarizeDiff } from "./diff";
import type { GeneratorItem, GeneratorState } from "./generator-state";

const state = (overrides: Partial<GeneratorState> = {}): GeneratorState => ({
  v: 1,
  fields: {},
  phases: [],
  services: [],
  ...overrides,
});

const item = (overrides: Partial<GeneratorItem> = {}): GeneratorItem => ({
  type: "service",
  key: "fieldDay",
  name: "Field Support Day",
  qty: 1,
  price: 1250,
  desc: "Daily on-site field safety support (Qty = days).",
  unit: "Day",
  ...overrides,
});

describe("diffGeneratorState — no changes", () => {
  it("returns an empty diff for identical states", () => {
    const a = state({
      fields: { clientCompany: "Acme", discountPct: "10", docRush: true },
      phases: [item({ type: "phase", key: "discovery" })],
      services: [item()],
    });
    const b = structuredClone(a);
    const diff = diffGeneratorState(a, b);

    expect(diff.fields).toEqual([]);
    expect(diff.phases).toEqual({ added: [], removed: [], changed: [] });
    expect(diff.services).toEqual({ added: [], removed: [], changed: [] });
    expect(summarizeDiff(diff)).toMatchObject({ total: 0, hasChanges: false });
  });

  it("ignores the schema version and derived item attributes", () => {
    const a = state({ services: [item({ unit: "Day", type: "service" })] });
    const b = state({ v: 2, services: [item({ unit: "Session", type: "svc" })] });
    expect(summarizeDiff(diffGeneratorState(a, b)).hasChanges).toBe(false);
  });

  it("does not report a change when a number and its string form are equivalent", () => {
    const a = state({ services: [item({ qty: 2, price: 1250 })] });
    const b = state({ services: [item({ qty: "2" as unknown as number, price: "1250" as unknown as number })] });
    expect(diffGeneratorState(a, b).services.changed).toEqual([]);
  });
});

describe("diffGeneratorState — fields", () => {
  it("reports a changed field with its before and after values", () => {
    const diff = diffGeneratorState(
      state({ fields: { clientCompany: "Acme", discountPct: "0" } }),
      state({ fields: { clientCompany: "Acme Construction", discountPct: "0" } }),
    );
    expect(diff.fields).toEqual([{ key: "clientCompany", before: "Acme", after: "Acme Construction" }]);
    expect(summarizeDiff(diff)).toMatchObject({ fields: 1, total: 1, hasChanges: true });
  });

  it("reports added and removed fields with null on the missing side", () => {
    const diff = diffGeneratorState(state({ fields: { removedField: "gone" } }), state({ fields: { addedField: "new" } }));
    expect(diff.fields).toEqual([
      { key: "addedField", before: null, after: "new" },
      { key: "removedField", before: "gone", after: null },
    ]);
  });

  it("sorts field changes by key so rendering is stable", () => {
    const diff = diffGeneratorState(
      state({ fields: { zeta: "1", alpha: "1", middle: "1" } }),
      state({ fields: { zeta: "2", alpha: "2", middle: "2" } }),
    );
    expect(diff.fields.map((change) => change.key)).toEqual(["alpha", "middle", "zeta"]);
  });

  it("tracks boolean checkbox fields flipping", () => {
    const diff = diffGeneratorState(state({ fields: { docRush: false } }), state({ fields: { docRush: true } }));
    expect(diff.fields).toEqual([{ key: "docRush", before: false, after: true }]);
  });

  it("treats an empty string and a missing field as different but a null as unset", () => {
    expect(diffGeneratorState(state(), state({ fields: { note: "" } })).fields).toEqual([
      { key: "note", before: null, after: "" },
    ]);
    expect(
      diffGeneratorState(state(), state({ fields: { note: null as unknown as string } })).fields,
    ).toEqual([]);
  });
});

describe("diffGeneratorState — line items", () => {
  it("reports an added item with its position in the newer list", () => {
    const diff = diffGeneratorState(
      state({ services: [item({ key: "fieldDay" })] }),
      state({ services: [item({ key: "fieldDay" }), item({ key: "osha10", name: "OSHA 10 Training", qty: 5, price: 175 })] }),
    );
    expect(diff.services.added).toHaveLength(1);
    expect(diff.services.added[0]).toMatchObject({ index: 1 });
    expect(diff.services.added[0].item.key).toBe("osha10");
    expect(diff.services.removed).toEqual([]);
    expect(diff.services.changed).toEqual([]);
    expect(summarizeDiff(diff)).toMatchObject({ itemsAdded: 1, total: 1 });
  });

  it("reports a removed item with its position in the older list", () => {
    const diff = diffGeneratorState(
      state({ phases: [item({ type: "phase", key: "discovery" }), item({ type: "phase", key: "build" })] }),
      state({ phases: [item({ type: "phase", key: "discovery" })] }),
    );
    expect(diff.phases.removed).toHaveLength(1);
    expect(diff.phases.removed[0]).toMatchObject({ index: 1 });
    expect(diff.phases.removed[0].item.key).toBe("build");
    expect(summarizeDiff(diff)).toMatchObject({ itemsRemoved: 1, total: 1 });
  });

  it("reports a quantity change with before and after", () => {
    const diff = diffGeneratorState(
      state({ services: [item({ qty: 2 })] }),
      state({ services: [item({ qty: 5 })] }),
    );
    expect(diff.services.changed).toHaveLength(1);
    expect(diff.services.changed[0]).toMatchObject({ key: "fieldDay", occurrence: 0, beforeIndex: 0, afterIndex: 0 });
    expect(diff.services.changed[0].changes).toEqual({ qty: { before: 2, after: 5 } });
  });

  it("reports a price change on its own", () => {
    const diff = diffGeneratorState(state({ services: [item({ price: 1250 })] }), state({ services: [item({ price: 1400 })] }));
    expect(diff.services.changed[0].changes).toEqual({ price: { before: 1250, after: 1400 } });
  });

  it("reports every changed attribute of one item together", () => {
    const diff = diffGeneratorState(
      state({ services: [item({ name: "Field Support Day", desc: "Old scope", qty: 1, price: 1250 })] }),
      state({ services: [item({ name: "Field Support Day (extended)", desc: "New scope", qty: 3, price: 1400 })] }),
    );
    expect(diff.services.changed[0].changes).toEqual({
      name: { before: "Field Support Day", after: "Field Support Day (extended)" },
      desc: { before: "Old scope", after: "New scope" },
      qty: { before: 1, after: 3 },
      price: { before: 1250, after: 1400 },
    });
    expect(summarizeDiff(diff)).toMatchObject({ itemsChanged: 1, total: 1 });
  });

  it("treats a changed catalog key as a removal plus an addition", () => {
    const diff = diffGeneratorState(
      state({ services: [item({ key: "fieldDay" })] }),
      state({ services: [item({ key: "auditDay" })] }),
    );
    expect(diff.services.changed).toEqual([]);
    expect(diff.services.removed[0].item.key).toBe("fieldDay");
    expect(diff.services.added[0].item.key).toBe("auditDay");
    expect(summarizeDiff(diff)).toMatchObject({ itemsAdded: 1, itemsRemoved: 1, total: 2 });
  });

  it("keeps phases and services in separate buckets", () => {
    const diff = diffGeneratorState(
      state({ phases: [item({ type: "phase", key: "discovery", qty: 1 })], services: [item({ qty: 1 })] }),
      state({ phases: [item({ type: "phase", key: "discovery", qty: 2 })], services: [item({ qty: 1 })] }),
    );
    expect(diff.phases.changed).toHaveLength(1);
    expect(diff.services.changed).toEqual([]);
  });
});

describe("diffGeneratorState — duplicate keys", () => {
  it("matches repeated keys by occurrence, so only the edited one is reported", () => {
    const diff = diffGeneratorState(
      state({
        services: [
          item({ key: "custom", name: "Line A", price: 100 }),
          item({ key: "custom", name: "Line B", price: 200 }),
          item({ key: "custom", name: "Line C", price: 300 }),
        ],
      }),
      state({
        services: [
          item({ key: "custom", name: "Line A", price: 100 }),
          item({ key: "custom", name: "Line B", price: 250 }),
          item({ key: "custom", name: "Line C", price: 300 }),
        ],
      }),
    );
    expect(diff.services.added).toEqual([]);
    expect(diff.services.removed).toEqual([]);
    expect(diff.services.changed).toHaveLength(1);
    expect(diff.services.changed[0]).toMatchObject({ key: "custom", occurrence: 1, beforeIndex: 1, afterIndex: 1 });
    expect(diff.services.changed[0].changes).toEqual({ price: { before: 200, after: 250 } });
  });

  it("reports the surplus occurrence when a duplicated key gains a row", () => {
    const diff = diffGeneratorState(
      state({ services: [item({ key: "custom", price: 100 }), item({ key: "custom", price: 200 })] }),
      state({
        services: [item({ key: "custom", price: 100 }), item({ key: "custom", price: 200 }), item({ key: "custom", price: 300 })],
      }),
    );
    expect(diff.services.changed).toEqual([]);
    expect(diff.services.added).toHaveLength(1);
    expect(diff.services.added[0]).toMatchObject({ index: 2 });
    expect(diff.services.added[0].item.price).toBe(300);
  });

  it("reports the dropped occurrence when a duplicated key loses a row", () => {
    const diff = diffGeneratorState(
      state({ services: [item({ key: "custom", price: 100 }), item({ key: "custom", price: 200 })] }),
      state({ services: [item({ key: "custom", price: 100 })] }),
    );
    expect(diff.services.removed).toHaveLength(1);
    expect(diff.services.removed[0]).toMatchObject({ index: 1 });
    expect(diff.services.removed[0].item.price).toBe(200);
  });

  it("reads a swap of two rows sharing a key as two edits, not a move", () => {
    const diff = diffGeneratorState(
      state({ services: [item({ key: "custom", price: 100 }), item({ key: "custom", price: 200 })] }),
      state({ services: [item({ key: "custom", price: 200 }), item({ key: "custom", price: 100 })] }),
    );
    expect(diff.services.changed).toHaveLength(2);
    expect(diff.services.changed.map((change) => change.changes.price)).toEqual([
      { before: 100, after: 200 },
      { before: 200, after: 100 },
    ]);
  });

  it("is blind to a reorder of rows with different keys", () => {
    const diff = diffGeneratorState(
      state({ services: [item({ key: "fieldDay" }), item({ key: "auditDay" })] }),
      state({ services: [item({ key: "auditDay" }), item({ key: "fieldDay" })] }),
    );
    expect(summarizeDiff(diff).hasChanges).toBe(false);
  });
});

describe("diffGeneratorState — malformed input", () => {
  it("treats null or undefined states as empty", () => {
    const populated = state({ fields: { clientCompany: "Acme" }, services: [item()] });
    expect(diffGeneratorState(null, null)).toEqual({
      fields: [],
      phases: { added: [], removed: [], changed: [] },
      services: { added: [], removed: [], changed: [] },
    });

    const fromNothing = diffGeneratorState(null, populated);
    expect(fromNothing.fields).toEqual([{ key: "clientCompany", before: null, after: "Acme" }]);
    expect(fromNothing.services.added).toHaveLength(1);

    const toNothing = diffGeneratorState(populated, undefined);
    expect(toNothing.services.removed).toHaveLength(1);
  });

  it("survives non-array item collections and non-object rows", () => {
    const broken = { v: 1, fields: "nope", phases: "nope", services: [null, 7, item()] } as unknown as GeneratorState;
    const diff = diffGeneratorState(broken, state());
    expect(diff.fields).toEqual([]);
    expect(diff.phases).toEqual({ added: [], removed: [], changed: [] });
    expect(diff.services.removed).toHaveLength(1);
  });

  it("coerces missing item attributes instead of reporting undefined", () => {
    const bare = { type: "service", key: "custom" } as unknown as GeneratorItem;
    const diff = diffGeneratorState(state({ services: [bare] }), state({ services: [item({ key: "custom" })] }));
    expect(diff.services.changed[0].changes).toEqual({
      name: { before: "", after: "Field Support Day" },
      desc: { before: "", after: "Daily on-site field safety support (Qty = days)." },
      qty: { before: 0, after: 1 },
      price: { before: 0, after: 1250 },
    });
  });
});

describe("summarizeDiff", () => {
  it("adds up field, added, removed and changed counts across both lists", () => {
    const diff = diffGeneratorState(
      state({
        fields: { clientCompany: "Acme", discountPct: "0" },
        phases: [item({ type: "phase", key: "discovery" }), item({ type: "phase", key: "build" })],
        services: [item({ key: "fieldDay", qty: 1 })],
      }),
      state({
        fields: { clientCompany: "Acme Construction", discountPct: "10" },
        phases: [item({ type: "phase", key: "discovery" })],
        services: [item({ key: "fieldDay", qty: 4 }), item({ key: "osha10" })],
      }),
    );
    expect(summarizeDiff(diff)).toEqual({
      fields: 2,
      itemsAdded: 1,
      itemsRemoved: 1,
      itemsChanged: 1,
      total: 5,
      hasChanges: true,
    });
  });

  it("returns a zeroed summary for a missing diff", () => {
    expect(summarizeDiff(null)).toEqual({
      fields: 0,
      itemsAdded: 0,
      itemsRemoved: 0,
      itemsChanged: 0,
      total: 0,
      hasChanges: false,
    });
  });
});
