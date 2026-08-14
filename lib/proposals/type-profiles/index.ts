// The per-type profile registry: which document each proposal type produces.
//
// One entry per TransactionTemplateKey, enforced by the Record type — adding a
// proposal type without deciding its legal terms is now a compile error rather
// than a document that silently ships platform boilerplate to a training
// client. That silence is exactly what went wrong before this module existed.

import type { DocumentTerm, DocumentTermInputs } from "@/components/proposals/proposal-document-model";
import { isTransactionTemplateKey, type TransactionTemplateKey } from "../transaction-templates";
import {
  composeDocumentTerms,
  type ProposalLexicon,
  type ProposalTypeCopy,
  type ProposalTypeProfile,
} from "./contract";
import { buildSharedClauses } from "./shared-clauses";
import { enterpriseProfile } from "./enterprise";
import { fixedPriceProfile } from "./fixed-price";
import { pilotProfile } from "./pilot";
import { platformProfile } from "./platform";
import { retainerProfile } from "./retainer";
import { timeAndMaterialsProfile } from "./time-and-materials";
import { trainingProfile } from "./training";

export const proposalTypeProfiles: Readonly<Record<TransactionTemplateKey, ProposalTypeProfile>> = Object.freeze({
  pilot: pilotProfile,
  platform: platformProfile,
  time_and_materials: timeAndMaterialsProfile,
  fixed_price: fixedPriceProfile,
  enterprise: enterpriseProfile,
  retainer: retainerProfile,
  training: trainingProfile,
});

/**
 * The profile for a state's stamped type, or null when there is none.
 *
 * Null is the honest answer for a proposal built before types existed, or one
 * started blank. Those documents keep the shared clause set they were written
 * against — a legacy proposal must not silently acquire different legal terms
 * because a feature shipped after it was sent.
 */
export function resolveProposalTypeProfile(
  fields: Record<string, unknown> | null | undefined,
): ProposalTypeProfile | null {
  const raw = fields?.proposalType;
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!isTransactionTemplateKey(key)) return null;
  return proposalTypeProfiles[key] ?? null;
}

/**
 * The clause list for one proposal, composed for its type.
 *
 * Falls back to the shared set unchanged when no type is stamped, which is what
 * keeps every proposal written before this feature rendering exactly as it did.
 */
export function buildTermsForProfile(
  input: DocumentTermInputs,
  profile: ProposalTypeProfile | null,
): DocumentTerm[] {
  const shared = buildSharedClauses(input);
  if (!profile) return shared.map(({ heading, body }) => ({ heading, body }));
  return composeDocumentTerms(shared, profile).terms;
}

/**
 * The prose blocks for a type.
 *
 * `fallback` is the platform-era copy, used for a proposal with no type
 * stamped so a document written before types existed keeps the wording it was
 * sent with.
 */
export function resolveTypeCopy(
  profile: ProposalTypeProfile | null,
  fallback: ProposalTypeCopy,
): ProposalTypeCopy {
  return profile?.copy ?? fallback;
}

/**
 * The words one type puts on its document, falling back to the platform-era
 * wording for a proposal with no type stamped.
 *
 * `unitNoun` has been declared on all seven profiles since this module shipped
 * — "task" for time & materials, "session" for training, "deliverable" for
 * fixed price — and was never forwarded, so the renderer went on calling every
 * row of section 03 a "Service Line". That is subscription vocabulary on a
 * document that sells no subscription, and it is the same class of defect as
 * the platform package block: a value the profile already decided, dropped on
 * the way to the page.
 *
 * Forwarded HERE rather than read off `profile.lexicon` at the call site, for
 * the same reason the headings are: the fallback for an untyped proposal has to
 * live in exactly one place, or a renderer that forgets it silently restyles a
 * document that is already in a client's hands.
 */
export function resolveLexicon(profile: ProposalTypeProfile | null): Pick<
  ProposalLexicon,
  "scopeHeading" | "feesHeading" | "termHeading" | "unitNoun"
> {
  return {
    scopeHeading: profile?.lexicon.scopeHeading ?? "Detailed Scope of Work",
    feesHeading: profile?.lexicon.feesHeading ?? "Pricing Schedule",
    termHeading: profile?.lexicon.termHeading ?? "Schedule and Implementation Approach",
    // "service" composes to "Service Line 1:", the exact label every document
    // printed before this field was wired through. An untyped proposal must
    // keep it.
    unitNoun: profile?.lexicon.unitNoun ?? "service",
  };
}

export { composeDocumentTerms } from "./contract";
export type { ProposalLexicon, ProposalTypeCopy, ProposalTypeProfile } from "./contract";
export { buildSharedClauses } from "./shared-clauses";
