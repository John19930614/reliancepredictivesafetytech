// Pure helpers for the Proposal Generator's serialized form state. The shape is
// produced by the bridge injected in scripts/build-proposal-generator.mjs:
//   { v: 1, fields: { <elementId>: string | boolean }, phases: Item[], services: Item[] }

export interface GeneratorItem {
  type: string;
  key: string;
  name: string;
  qty: number;
  price: number;
  desc: string;
  unit: string;
}

export interface GeneratorState {
  v: number;
  fields: Record<string, string | boolean>;
  phases: GeneratorItem[];
  services: GeneratorItem[];
}

export function isGeneratorState(value: unknown): value is GeneratorState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.v === "number" &&
    typeof v.fields === "object" &&
    v.fields !== null &&
    Array.isArray(v.phases) &&
    Array.isArray(v.services)
  );
}

function fieldText(state: GeneratorState, id: string): string {
  const value = state.fields[id];
  return typeof value === "string" ? value.trim() : "";
}

/** Proposal title shown in the platform list: "<Client Co> — Platform Proposal". */
export function deriveTitleFromState(state: GeneratorState | null, fallback: string): string {
  if (!state) return fallback;
  const company = fieldText(state, "clientCompany");
  if (!company) return fallback;
  return `${company} — Platform Proposal`;
}

/** Short list-view summary, e.g. "RPST-2026-001 · pilot · 12 line items". */
export function deriveSummaryFromState(state: GeneratorState | null): string | null {
  if (!state) return null;
  const parts: string[] = [];
  const no = fieldText(state, "proposalNo");
  if (no) parts.push(no);
  const pkg = fieldText(state, "packageSelect");
  if (pkg) parts.push(pkg);
  const items = state.phases.length + state.services.length;
  if (items > 0) parts.push(`${items} line item${items === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Initial state for a proposal that has no saved form data yet: prefill the
 * client block from the assigned company record. Deliberately omits
 * phases/services so the generator keeps its default pilot line items — the
 * bridge only replaces item lists when they are present as arrays. Returns
 * null when there is nothing to prefill.
 */
export function buildPrefillState(client: { name?: string | null; contact_name?: string | null; email?: string | null } | null): { v: number; fields: Record<string, string> } | null {
  if (!client) return null;
  const fields: Record<string, string> = {};
  if (client.name) fields.clientCompany = client.name;
  if (client.contact_name) fields.clientContact = client.contact_name;
  if (client.email) fields.clientEmail = client.email;
  if (Object.keys(fields).length === 0) return null;
  return { v: 1, fields };
}
