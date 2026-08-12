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

/** Section headings for a type, falling back to the platform-era wording. */
export function resolveLexicon(profile: ProposalTypeProfile | null): Pick<
  ProposalLexicon,
  "scopeHeading" | "feesHeading" | "termHeading"
> {
  return {
    scopeHeading: profile?.lexicon.scopeHeading ?? "Detailed Scope of Work",
    feesHeading: profile?.lexicon.feesHeading ?? "Pricing Schedule",
    termHeading: profile?.lexicon.termHeading ?? "Schedule and Implementation Approach",
  };
}

export { composeDocumentTerms } from "./contract";
export type { ProposalLexicon, ProposalTypeCopy, ProposalTypeProfile } from "./contract";
export { buildSharedClauses } from "./shared-clauses";
