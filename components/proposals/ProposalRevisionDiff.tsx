// Presentation for a revision comparison. All of the comparison LOGIC lives in
// lib/proposals/diff.ts (pure and unit-tested); this file only decides how the
// resulting GeneratorStateDiff is drawn. It carries no "use client" directive so
// it can be rendered from either a client parent (the revision history table) or
// a server route (a standalone revision page).

import {
  summarizeDiff,
  type ChangedItem,
  type DiffFieldValue,
  type GeneratorStateDiff,
  type ItemChanges,
  type ItemListDiff,
} from "@/lib/proposals/diff";
import type { GeneratorItem } from "@/lib/proposals/generator-state";
import { formatMoney } from "@/lib/proposals/pricing";

/** `clientCompany` -> "Client company"; `deposit_pct` -> "Deposit pct". */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function renderFieldValue(value: DiffFieldValue | null): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value);
  return text.trim() === "" ? "—" : text;
}

const itemChangeOrder: (keyof ItemChanges)[] = ["name", "qty", "price", "desc"];
const itemChangeLabels: Record<keyof ItemChanges, string> = {
  name: "Name",
  qty: "Quantity",
  price: "Price",
  desc: "Description",
};

function formatItemValue(field: keyof ItemChanges, value: string | number): string {
  if (field === "price") return formatMoney(value);
  if (field === "qty") return String(value);
  const text = String(value);
  return text.trim() === "" ? "—" : text;
}

function itemLabel(item: GeneratorItem): string {
  const name = typeof item?.name === "string" ? item.name.trim() : "";
  if (name) return name;
  const key = typeof item?.key === "string" ? item.key.trim() : "";
  return key || "Untitled line item";
}

function itemAmount(item: GeneratorItem): string {
  const qty = Number.isFinite(item?.qty) ? item.qty : 0;
  const price = Number.isFinite(item?.price) ? item.price : 0;
  return `${qty} × ${formatMoney(price)}`;
}

function DiffChip({ tone, children }: { tone: "added" | "removed" | "changed"; children: React.ReactNode }) {
  const toneClass = tone === "added" ? "badge-green" : tone === "removed" ? "badge-red" : "badge-yellow";
  return <span className={`badge ${toneClass}`}>{children}</span>;
}

function ItemListSection({
  title,
  list,
  beforeLabel,
  afterLabel,
}: {
  title: string;
  list: ItemListDiff;
  beforeLabel: string;
  afterLabel: string;
}) {
  const total = list.added.length + list.removed.length + list.changed.length;
  if (total === 0) return null;

  return (
    <div style={{ marginTop: 18 }}>
      <h4 style={{ margin: "0 0 8px" }}>{title}</h4>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {list.removed.map((entry) => (
          <li key={`removed-${entry.index}`}>
            <DiffChip tone="removed">Removed</DiffChip>{" "}
            <strong>{itemLabel(entry.item)}</strong>{" "}
            <span style={{ color: "var(--portal-muted)" }}>({itemAmount(entry.item)})</span>
          </li>
        ))}
        {list.added.map((entry) => (
          <li key={`added-${entry.index}`}>
            <DiffChip tone="added">Added</DiffChip>{" "}
            <strong>{itemLabel(entry.item)}</strong>{" "}
            <span style={{ color: "var(--portal-muted)" }}>({itemAmount(entry.item)})</span>
          </li>
        ))}
        {list.changed.map((entry: ChangedItem) => (
          <li key={`changed-${entry.key}-${entry.occurrence}`}>
            <DiffChip tone="changed">Changed</DiffChip> <strong>{itemLabel(entry.after)}</strong>
            <table className="data-table" style={{ marginTop: 6 }}>
              <thead>
                <tr>
                  <th>Attribute</th>
                  <th>{beforeLabel}</th>
                  <th>{afterLabel}</th>
                </tr>
              </thead>
              <tbody>
                {itemChangeOrder.map((field) => {
                  const change = entry.changes[field];
                  if (!change) return null;
                  return (
                    <tr key={field}>
                      <td>{itemChangeLabels[field]}</td>
                      <td>{formatItemValue(field, change.before)}</td>
                      <td>{formatItemValue(field, change.after)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface ProposalRevisionDiffProps {
  diff: GeneratorStateDiff;
  /** Label for the older side, e.g. "v3". */
  beforeLabel: string;
  /** Label for the newer side, e.g. "v7 (current)". */
  afterLabel: string;
  className?: string;
}

export function ProposalRevisionDiff({ diff, beforeLabel, afterLabel, className }: ProposalRevisionDiffProps) {
  const summary = summarizeDiff(diff);

  if (!summary.hasChanges) {
    return (
      <div className={className}>
        <div className="empty-state">
          {beforeLabel} and {afterLabel} are identical — no fields or line items differ.
        </div>
      </div>
    );
  }

  const summaryParts: string[] = [];
  if (summary.fields > 0) summaryParts.push(`${summary.fields} field${summary.fields === 1 ? "" : "s"}`);
  if (summary.itemsAdded > 0) summaryParts.push(`${summary.itemsAdded} line item${summary.itemsAdded === 1 ? "" : "s"} added`);
  if (summary.itemsRemoved > 0) {
    summaryParts.push(`${summary.itemsRemoved} line item${summary.itemsRemoved === 1 ? "" : "s"} removed`);
  }
  if (summary.itemsChanged > 0) {
    summaryParts.push(`${summary.itemsChanged} line item${summary.itemsChanged === 1 ? "" : "s"} changed`);
  }

  return (
    <div className={className}>
      <p style={{ color: "var(--portal-muted)", marginTop: 0 }}>
        Comparing <strong>{beforeLabel}</strong> with <strong>{afterLabel}</strong> — {summaryParts.join(" · ")}.
      </p>

      {diff.fields.length > 0 ? (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>{beforeLabel}</th>
                <th>{afterLabel}</th>
              </tr>
            </thead>
            <tbody>
              {diff.fields.map((field) => (
                <tr key={field.key}>
                  <td>{humanizeKey(field.key)}</td>
                  <td>{renderFieldValue(field.before)}</td>
                  <td>{renderFieldValue(field.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <ItemListSection title="Phases" list={diff.phases} beforeLabel={beforeLabel} afterLabel={afterLabel} />
      <ItemListSection title="Services" list={diff.services} beforeLabel={beforeLabel} afterLabel={afterLabel} />
    </div>
  );
}
