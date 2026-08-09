// Proposal template helpers — pure functions, no DOM, no I/O, no module state.
//
// A template is a saved GeneratorState that a seller can start a NEW proposal
// from. The whole risk of the feature is cross-client leakage: the state was
// captured from one company's proposal, and every field in it is carried into
// the next company's document unless it is deliberately removed. Scrubbing is
// therefore done in BOTH directions:
//
//   sanitizeTemplateState()  — on CAPTURE, before the row is written, so a
//                              client's identity never even reaches the table.
//   buildStateFromTemplate() — on APPLY, before the new proposal is written, so
//                              a template stored by an older build (or written
//                              by a hand-crafted POST straight at the server
//                              action) still cannot leak.
//
// Validation is delegated to isGeneratorState() rather than reimplemented: it
// already rejects non-scalar field values and non-finite qty/price, which is
// what keeps a persisted state from becoming a stored-XSS vector in the
// generator's innerHTML templates.

import {
  buildPrefillState,
  isGeneratorState,
  type GeneratorFieldValue,
  type GeneratorItem,
  type GeneratorState,
  type ProposalPrefill,
} from "./generator-state";

/* -------------------------------------------------------------------------- */
/* What must never carry from one client's proposal to another                 */
/* -------------------------------------------------------------------------- */

/**
 * Generator field ids that identify the CLIENT the template was captured from.
 * Transcribed from the client block of assets/proposal-generator-v15.html.
 *
 * These are removed unconditionally, then re-supplied from the NEW proposal's
 * assigned company by buildPrefillState(). Since 20260809100000 that includes
 * the address and the full contact list, so a template applied to an assigned
 * company now arrives complete rather than blank.
 *
 * `clientContacts` MUST stay on this list. It carries names, titles and email
 * addresses of people at the company the template was captured from, and it is
 * the single field on which a leak would be most obviously damaging — another
 * client's staff printed on the front page of a proposal.
 */
export const clientIdentityFieldIds = Object.freeze([
  "clientCompany",
  "clientContact",
  "clientTitle",
  "clientEmail",
  "clientAddress",
  "clientContacts",
] as const);

/**
 * Field ids that belong to ONE proposal instance rather than to reusable scope.
 *
 *   proposalNo   — the document number; reusing it would put two different
 *                  companies' proposals on the same reference.
 *   proposalDate — the date that proposal was issued.
 *   preparedBy   — the employee who authored the captured proposal, who is not
 *                  necessarily the person starting the new one.
 */
export const proposalInstanceFieldIds = Object.freeze([
  "proposalNo",
  "proposalDate",
  "preparedBy",
] as const);

/**
 * Defence in depth against a future generator version. The asset gains fields
 * over time (`clientPhone`, `clientCity`, ...) and an explicit deny list goes
 * stale silently — the leak only shows up on a customer's document. Anything
 * whose id starts with "client" is treated as client identity even if it is not
 * on the list above.
 *
 * Seller-side ids (`sellerName`, `sellerContact`) deliberately do NOT match:
 * they are our own boilerplate and reusing them is the point of a template.
 */
const clientFieldPattern = /^client/i;

export function isClientIdentityFieldId(fieldId: string): boolean {
  return (
    (clientIdentityFieldIds as readonly string[]).includes(fieldId) || clientFieldPattern.test(fieldId)
  );
}

/** True when the field must be dropped while turning a proposal into a template. */
export function isTemplateBlockedFieldId(fieldId: string): boolean {
  if (isClientIdentityFieldId(fieldId)) return true;
  return (proposalInstanceFieldIds as readonly string[]).includes(fieldId);
}

/**
 * Which blocked field ids a state still carries. Used by the tests and by the
 * templates page to prove a stored template is clean; returns [] for a state
 * that is not a GeneratorState at all, since there is nothing to leak from it.
 */
export function templateLeakFieldIds(value: unknown): string[] {
  if (!isGeneratorState(value)) return [];
  return Object.keys(value.fields).filter(isTemplateBlockedFieldId).sort();
}

/* -------------------------------------------------------------------------- */
/* Normalisation                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Rebuilds a line item from exactly the seven keys GeneratorItem declares.
 *
 * isGeneratorItem() checks the keys it cares about but lets unknown ones
 * through, so a row captured from a proposal can still be carrying a database
 * `id`, a `proposal_id`, or whatever a future asset attaches. Reconstructing
 * instead of spreading drops all of it.
 *
 * Absent optional strings become "" rather than being omitted: both the
 * generator's addPhase/addService and pricing.buildItemLine() fall back to the
 * catalog entry on a falsy name/desc/unit, so "" and undefined behave
 * identically — and "" keeps the shape (and therefore the stored JSON)
 * deterministic.
 */
function normalizeItem(item: GeneratorItem): GeneratorItem {
  return {
    type: item.type,
    key: item.key,
    name: typeof item.name === "string" ? item.name : "",
    qty: item.qty,
    price: item.price,
    desc: typeof item.desc === "string" ? item.desc : "",
    unit: typeof item.unit === "string" ? item.unit : "",
  };
}

/**
 * Validates a candidate template body and returns a scrubbed copy, or null when
 * it is not a well-formed GeneratorState.
 *
 * The returned object is freshly built — no aliasing back into `value` — so a
 * caller cannot mutate the sanitized state through the original reference.
 */
export function sanitizeTemplateState(value: unknown): GeneratorState | null {
  if (!isGeneratorState(value)) return null;

  const fields: Record<string, GeneratorFieldValue> = {};
  for (const [fieldId, fieldValue] of Object.entries(value.fields)) {
    if (isTemplateBlockedFieldId(fieldId)) continue;
    fields[fieldId] = fieldValue;
  }

  return {
    v: value.v,
    fields,
    phases: value.phases.map(normalizeItem),
    services: value.services.map(normalizeItem),
  };
}

/** True when `value` is a template body this module is willing to store. */
export function isTemplateFormData(value: unknown): value is GeneratorState {
  return isGeneratorState(value);
}

/* -------------------------------------------------------------------------- */
/* Applying a template                                                         */
/* -------------------------------------------------------------------------- */

/** The subset of company_clients used to prefill the new proposal's client block. */
/**
 * What a template application knows about the proposal it is seeding.
 *
 * An alias for the shared prefill shape rather than its own three-field type:
 * a template-applied proposal and a from-scratch proposal must open with the
 * same client address, the same contact list and the same seller block, and
 * two separate input types is how they would drift apart.
 */
export type TemplateClientPrefill = ProposalPrefill;

/**
 * Builds the initial GeneratorState for a proposal started from `templateBody`,
 * with `client`'s identity layered on top of the scrubbed template.
 *
 * Order matters: the template is scrubbed FIRST and the prefill applied
 * SECOND, so the only client fields that can survive are the ones belonging to
 * the company this proposal is actually assigned to. When the proposal has no
 * assigned company the client block is simply left empty.
 *
 * Returns null when the template body is unusable, so the caller can refuse the
 * create rather than silently fall back to some other client's state.
 */
export function buildStateFromTemplate(
  templateBody: unknown,
  client: TemplateClientPrefill | null,
): GeneratorState | null {
  const base = sanitizeTemplateState(templateBody);
  if (!base) return null;

  const prefill = buildPrefillState(client ?? null);
  if (!prefill) return base;

  return { ...base, fields: { ...base.fields, ...prefill.fields } };
}

/* -------------------------------------------------------------------------- */
/* Input validation                                                            */
/*                                                                             */
/* Server Actions are public POST endpoints, so these bounds are checked before */
/* anything reaches the name/description CHECK constraints in                   */
/* 20260804200000_client_proposal_templates.sql. The numbers match that file.   */
/* -------------------------------------------------------------------------- */

export const templateNameMaxLength = 120;
export const templateDescriptionMaxLength = 500;

export interface TemplateFieldInput {
  /** Omit the key entirely when the field is not part of this write. */
  name?: string | null;
  description?: string | null;
}

export interface TemplateFieldValidation {
  ok: boolean;
  /** Field-level messages keyed by the input field name. */
  errors: Record<string, string>;
  /** First message, ready to render in a single-line form banner. */
  error?: string;
}

export function validateTemplateFields(input: TemplateFieldInput): TemplateFieldValidation {
  const errors: Record<string, string> = {};

  if ("name" in input) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) errors.name = "Give the template a name.";
    else if (name.length > templateNameMaxLength) {
      errors.name = `Keep the name to ${templateNameMaxLength} characters or fewer.`;
    }
  }

  if ("description" in input && input.description !== null && input.description !== undefined) {
    if (typeof input.description !== "string") {
      errors.description = "Description must be text.";
    } else if (input.description.trim().length > templateDescriptionMaxLength) {
      errors.description = `Keep the description to ${templateDescriptionMaxLength} characters or fewer.`;
    }
  }

  const first = Object.values(errors)[0];
  return first ? { ok: false, errors, error: first } : { ok: true, errors };
}
