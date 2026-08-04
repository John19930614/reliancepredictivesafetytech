// Structural diff of two saved generator states, for revision comparison.
//
// Pure and presentation-agnostic: it returns data, never JSX or formatted
// strings, so the same diff can render as a table, a summary chip, or an audit
// payload. Nothing here reads outside its arguments.

import type { GeneratorItem, GeneratorState } from "./generator-state";

/** Whatever a form field may hold — tracks the GeneratorState field type. */
export type DiffFieldValue = GeneratorState["fields"][string];

export interface FieldChange {
  key: string;
  /** `null` means the field was absent on that side (added / removed field). */
  before: DiffFieldValue | null;
  after: DiffFieldValue | null;
}

export interface ItemValueChange<T> {
  before: T;
  after: T;
}

/**
 * Which of the line-item attributes changed. Only the four the seller can edit
 * are tracked; `unit` and `type` are derived from the catalog key and never
 * change on their own.
 */
export interface ItemChanges {
  name?: ItemValueChange<string>;
  qty?: ItemValueChange<number>;
  price?: ItemValueChange<number>;
  desc?: ItemValueChange<string>;
}

export interface AddedItem {
  /** Position in the newer list. */
  index: number;
  item: GeneratorItem;
}

export interface RemovedItem {
  /** Position in the older list. */
  index: number;
  item: GeneratorItem;
}

export interface ChangedItem {
  key: string;
  /** 0-based position among the items sharing this key (see matching note). */
  occurrence: number;
  beforeIndex: number;
  afterIndex: number;
  before: GeneratorItem;
  after: GeneratorItem;
  changes: ItemChanges;
}

export interface ItemListDiff {
  added: AddedItem[];
  removed: RemovedItem[];
  changed: ChangedItem[];
}

export interface GeneratorStateDiff {
  /** Changed/added/removed form fields, sorted by key for stable rendering. */
  fields: FieldChange[];
  phases: ItemListDiff;
  services: ItemListDiff;
}

export interface DiffSummary {
  fields: number;
  itemsAdded: number;
  itemsRemoved: number;
  itemsChanged: number;
  /** fields + itemsAdded + itemsRemoved + itemsChanged. */
  total: number;
  hasChanges: boolean;
}

/* -------------------------------------------------------------------------- */

function readItems(value: unknown): GeneratorItem[] {
  return Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as GeneratorItem[]) : [];
}

function readFields(state: GeneratorState | null | undefined): Record<string, unknown> {
  const fields = state?.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return {};
  return fields as Record<string, unknown>;
}

/** Absent, null, and undefined all collapse to `null` (= "not set"). */
function normalizeField(value: unknown): DiffFieldValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

/** qty/price compare numerically, so 5 and "5" are not reported as a change. */
function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function itemKey(item: GeneratorItem): string {
  return toText(item?.key).trim();
}

/**
 * Diffs the form fields of two states.
 *
 * The `v` schema version is intentionally not diffed — it is bookkeeping, not
 * proposal content.
 */
function diffFields(a: GeneratorState | null | undefined, b: GeneratorState | null | undefined): FieldChange[] {
  const before = readFields(a);
  const after = readFields(b);
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();

  const changes: FieldChange[] = [];
  for (const key of keys) {
    const beforeValue = normalizeField(before[key]);
    const afterValue = normalizeField(after[key]);
    if (Object.is(beforeValue, afterValue)) continue;
    changes.push({ key, before: beforeValue, after: afterValue });
  }
  return changes;
}

/**
 * Matching strategy for line items.
 *
 * Items carry no stable id, and the SAME key can legitimately appear several
 * times (two "Custom Service Line" rows, three "Field Support Day" rows). So we
 * match on `(key, occurrence)`: the Nth row with key K in the older list is
 * matched to the Nth row with key K in the newer list. Unmatched rows in the
 * older list are removals, unmatched rows in the newer list are additions.
 *
 * Consequences worth knowing:
 *   - Reordering rows of DIFFERENT keys is invisible (the fee table order is not
 *     itself priced); the matched pair still reports its before/after indices,
 *     so a renderer can show a move if it wants to.
 *   - Reordering two rows that share a key reads as two edits, not a move.
 *   - Changing a row's key reads as one removal plus one addition, which is
 *     right: a different catalog key is a different product.
 */
function diffItemList(beforeList: GeneratorItem[], afterList: GeneratorItem[]): ItemListDiff {
  const groupByKey = (list: GeneratorItem[]) => {
    const groups = new Map<string, { index: number; item: GeneratorItem }[]>();
    list.forEach((item, index) => {
      const key = itemKey(item);
      const group = groups.get(key);
      if (group) group.push({ index, item });
      else groups.set(key, [{ index, item }]);
    });
    return groups;
  };

  const beforeGroups = groupByKey(beforeList);
  const afterGroups = groupByKey(afterList);

  const added: AddedItem[] = [];
  const removed: RemovedItem[] = [];
  const changed: ChangedItem[] = [];

  for (const key of new Set([...beforeGroups.keys(), ...afterGroups.keys()])) {
    const beforeGroup = beforeGroups.get(key) ?? [];
    const afterGroup = afterGroups.get(key) ?? [];
    const paired = Math.min(beforeGroup.length, afterGroup.length);

    for (let occurrence = 0; occurrence < paired; occurrence += 1) {
      const before = beforeGroup[occurrence];
      const after = afterGroup[occurrence];
      const changes = diffItemFields(before.item, after.item);
      if (Object.keys(changes).length === 0) continue;
      changed.push({
        key,
        occurrence,
        beforeIndex: before.index,
        afterIndex: after.index,
        before: before.item,
        after: after.item,
        changes,
      });
    }

    for (let i = paired; i < beforeGroup.length; i += 1) {
      removed.push({ index: beforeGroup[i].index, item: beforeGroup[i].item });
    }
    for (let i = paired; i < afterGroup.length; i += 1) {
      added.push({ index: afterGroup[i].index, item: afterGroup[i].item });
    }
  }

  added.sort((x, y) => x.index - y.index);
  removed.sort((x, y) => x.index - y.index);
  changed.sort((x, y) => x.afterIndex - y.afterIndex);

  return { added, removed, changed };
}

function diffItemFields(before: GeneratorItem, after: GeneratorItem): ItemChanges {
  const changes: ItemChanges = {};

  const beforeName = toText(before?.name);
  const afterName = toText(after?.name);
  if (beforeName !== afterName) changes.name = { before: beforeName, after: afterName };

  const beforeQty = toNumber(before?.qty);
  const afterQty = toNumber(after?.qty);
  if (beforeQty !== afterQty) changes.qty = { before: beforeQty, after: afterQty };

  const beforePrice = toNumber(before?.price);
  const afterPrice = toNumber(after?.price);
  if (beforePrice !== afterPrice) changes.price = { before: beforePrice, after: afterPrice };

  const beforeDesc = toText(before?.desc);
  const afterDesc = toText(after?.desc);
  if (beforeDesc !== afterDesc) changes.desc = { before: beforeDesc, after: afterDesc };

  return changes;
}

/**
 * Compares two saved generator states, `a` (older) against `b` (newer).
 *
 * Identical states produce an empty diff: `fields: []` and empty added/removed/
 * changed lists. Null or malformed input is treated as an empty state, so
 * diffing against a revision that never stored form data reports every field of
 * the other side as an addition rather than throwing.
 */
export function diffGeneratorState(
  a: GeneratorState | null | undefined,
  b: GeneratorState | null | undefined,
): GeneratorStateDiff {
  return {
    fields: diffFields(a, b),
    phases: diffItemList(readItems(a?.phases), readItems(b?.phases)),
    services: diffItemList(readItems(a?.services), readItems(b?.services)),
  };
}

/** Counts for a compact label, e.g. "3 fields, 2 line items changed". */
export function summarizeDiff(diff: GeneratorStateDiff | null | undefined): DiffSummary {
  const lists = [diff?.phases, diff?.services];
  const fields = diff?.fields?.length ?? 0;
  const itemsAdded = lists.reduce((sum, list) => sum + (list?.added?.length ?? 0), 0);
  const itemsRemoved = lists.reduce((sum, list) => sum + (list?.removed?.length ?? 0), 0);
  const itemsChanged = lists.reduce((sum, list) => sum + (list?.changed?.length ?? 0), 0);
  const total = fields + itemsAdded + itemsRemoved + itemsChanged;
  return { fields, itemsAdded, itemsRemoved, itemsChanged, total, hasChanges: total > 0 };
}
