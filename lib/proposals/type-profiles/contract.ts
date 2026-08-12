// What makes one proposal type read like its own document.
//
// THE PROBLEM THIS SOLVES
//   Until now every proposal type shared ONE hardcoded legal section. A
//   training proposal printed "Taxes & SaaS Fees", "THE PLATFORM AND SERVICES
//   ARE PROVIDED AS IS", and California's SaaS auto-renewal statute — while
//   saying nothing about class minimums, no-shows, instructor substitution, or
//   what happens to a certification. Time & Materials carried no rate table, no
//   not-to-exceed and no timesheet approval. Fixed-Price had no deliverable
//   acceptance. Enterprise had no MSA precedence. The scope prose changed per
//   type; the terms the client actually signs never did.
//
// WHAT THIS IS NOT
//   Not a second renderer. ProposalDocument, the PDF, the DOCX, the share page
//   and the DocuSign envelope all keep rendering from ONE view-model — the rule
//   stated at ProposalDocument.tsx:10-17 and pdf.ts:16-21, and the only reason
//   those five surfaces cannot drift. A profile PARAMETERISES that model: it
//   chooses wording and clauses, and never gains its own layout, its own
//   totals, or its own copy of the document.
//
// HOW A PROFILE CHANGES A DOCUMENT
//   1. `lexicon` renames things the client reads — section headings and the
//      nouns used for the engagement, the fee, and the unit of work.
//   2. `omitClauses` drops shared clauses that are wrong for the deal.
//   3. `overrideClauses` restates a shared clause in this deal's language.
//   4. `extraClauses` adds the terms only this type needs, placed by anchor.
//
//   Everything else stays shared. That asymmetry is deliberate: the clauses
//   that protect the company (trade secrets, indemnity, dispute resolution,
//   privacy, OSHA responsibility) are the LAST thing that should vary by which
//   template a seller picked, so a profile can reword them but the composer
//   refuses to let one silently disappear — see requiredClauseIds below.

import type { DocumentTerm } from "@/components/proposals/proposal-document-model";
import type { TransactionTemplateKey } from "../transaction-templates";

/* -------------------------------------------------------------------------- */
/* Lexicon                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The words a document uses for itself.
 *
 * Every member is required, so adding a term to the lexicon is a compile error
 * across all seven profiles rather than six silent fallbacks to platform
 * wording — which is the failure this whole module exists to end.
 */
export interface ProposalLexicon {
  /** Under the wordmark, e.g. "Training Services Proposal". */
  documentTitle: string;
  /**
   * What the deal is called mid-sentence, lower case, no article:
   * "this pilot", "the training program", "this engagement".
   */
  engagementNoun: string;
  /** Heading over the money, e.g. "Investment" / "Fees & Rates". */
  feesHeading: string;
  /** Heading over the scope table, e.g. "Scope of Work" / "Courses & Delivery". */
  scopeHeading: string;
  /** Heading over dates, e.g. "Pilot Term" / "Period of Performance". */
  termHeading: string;
  /**
   * Subject of the warranty and outcome disclaimers — the thing being
   * disclaimed. "the platform and services" is wrong on a training invoice.
   */
  warrantySubject: string;
  /** One unit of what is sold: "deliverable", "session", "task", "month". */
  unitNoun: string;
}

/** The prose blocks a document prints outside the clause list. */
export interface ProposalTypeCopy {
  /** Masthead line under the company name. */
  subtitle: string;
  /** Section 01's callout: what this document establishes. */
  purposeCallout: string;
  /** Section 03's opening paragraph, above the scope lines. */
  scopeIntro: string;
  /** Section 04's bullets — what the client actually receives. */
  deliverables: readonly string[];
  /** Section 06's ordered steps. */
  scheduleSteps: readonly string[];
  /** Section 07's bullets — what the client has to do. */
  clientResponsibilities: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Clauses                                                                     */
/* -------------------------------------------------------------------------- */

/** Where an extra clause lands relative to the shared set. */
export type ClauseAnchor =
  /** Immediately after the named shared clause. */
  | { after: SharedClauseId }
  /** Immediately before the named shared clause. */
  | { before: SharedClauseId }
  /** At the very top, before Payment Terms. */
  | { position: "start" }
  /** At the very end, after Proposal Validity. */
  | { position: "end" };

export interface ExtraClause {
  /** Stable id, unique within the profile. Prefixed by convention, e.g. "training.no_show". */
  id: string;
  heading: string;
  body: string;
  anchor: ClauseAnchor;
}

/**
 * Ids of the clauses shared by every proposal type. Declared here (rather than
 * derived from the library) so a profile referring to a clause that does not
 * exist fails to compile instead of silently omitting nothing.
 */
export const sharedClauseIds = Object.freeze([
  "payment_terms",
  "scope_changes",
  "confidentiality",
  "privacy_ccpa",
  "privacy_multistate",
  "breach_notification",
  "data_ai_use",
  "intellectual_property",
  "trade_secrets",
  "client_data_ownership",
  "limitation_of_liability",
  "warranty_disclaimer",
  "no_guarantee",
  "osha_disclaimer",
  "indemnification",
  "dispute_resolution",
  "auto_renewal_ca",
  "electronic_signatures",
  "taxes",
  "independent_contractor",
  "force_majeure",
  "governing_law",
  "non_solicitation",
  "severability",
  "entire_agreement",
  "termination",
  "proposal_validity",
] as const);

export type SharedClauseId = (typeof sharedClauseIds)[number];

/**
 * Clauses no profile may drop.
 *
 * These are the terms that protect the company and set the client's own
 * responsibilities, and none of them stops being true because a seller picked a
 * different template. A profile may REWORD any of them through
 * `overrideClauses` — a training document should say "the training services",
 * not "the platform" — but omitting one is a bug, and composeDocumentTerms
 * treats it as one.
 */
export const requiredClauseIds: readonly SharedClauseId[] = Object.freeze([
  "confidentiality",
  "limitation_of_liability",
  "warranty_disclaimer",
  "osha_disclaimer",
  "indemnification",
  "dispute_resolution",
  "governing_law",
  "entire_agreement",
  "proposal_validity",
]);

/* -------------------------------------------------------------------------- */
/* Profile                                                                     */
/* -------------------------------------------------------------------------- */

export interface ProposalTypeProfile {
  key: TransactionTemplateKey;
  lexicon: ProposalLexicon;
  /**
   * The prose sections, per type.
   *
   * Every one of these was a single hardcoded string printed on all seven
   * types, and all of them were written for a platform sale. A training
   * proposal promised "Configured platform subscription and client account
   * setup" (section 04), said its scope could scale to "a full enterprise
   * platform rollout" (section 03), and listed "Platform setup, modules,
   * templates, workflows, and user roles" as a schedule step (section 06) —
   * for a CPR class in a trailer.
   *
   * Required rather than optional, for the same reason the lexicon is: an
   * optional field leaves six types silently inheriting the platform wording,
   * which is the bug.
   */
  copy: ProposalTypeCopy;
  /**
   * Shared clauses that do not apply to this deal. Each needs a one-line
   * justification in a comment at the call site — a dropped legal clause with
   * no stated reason is indistinguishable from an accident.
   */
  omitClauses?: readonly SharedClauseId[];
  /** Shared clauses restated in this type's language. Heading may change too. */
  overrideClauses?: Readonly<Partial<Record<SharedClauseId, { heading?: string; body: string }>>>;
  /** Terms only this type needs. */
  extraClauses?: readonly ExtraClause[];
}

/* -------------------------------------------------------------------------- */
/* Composition                                                                 */
/* -------------------------------------------------------------------------- */

export interface ComposeResult {
  terms: DocumentTerm[];
  /** Required clauses a profile tried to drop. Non-empty = a profile bug. */
  droppedRequired: SharedClauseId[];
}

/**
 * Builds the final ordered clause list for one proposal type.
 *
 * `base` arrives already resolved (payment terms, liability cap, governing law
 * and validity days interpolated from the seller's own fields), so this
 * function never re-derives a commercial value — it only chooses, replaces,
 * renames and inserts.
 *
 * A profile that omits a required clause does NOT get its way: the clause stays
 * and the id is reported. Failing loud in a test beats shipping a client
 * document with no limitation of liability because someone typo'd an id.
 */
export function composeDocumentTerms(
  base: readonly { id: SharedClauseId; heading: string; body: string }[],
  profile: ProposalTypeProfile,
): ComposeResult {
  const omit = new Set(profile.omitClauses ?? []);
  const droppedRequired: SharedClauseId[] = [];
  for (const id of requiredClauseIds) {
    if (omit.has(id)) {
      droppedRequired.push(id);
      omit.delete(id);
    }
  }

  const overrides = profile.overrideClauses ?? {};
  const kept = base
    .filter((clause) => !omit.has(clause.id))
    .map((clause) => {
      const override = overrides[clause.id];
      if (!override) return { id: clause.id as string, heading: clause.heading, body: clause.body };
      return { id: clause.id as string, heading: override.heading ?? clause.heading, body: override.body };
    });

  // Extras are placed against the ORIGINAL anchors. An extra anchored to a
  // clause this profile omitted has nowhere to go, so it falls to the end
  // rather than vanishing — a term the profile author wrote is never dropped.
  const extras = profile.extraClauses ?? [];
  const result: { id: string; heading: string; body: string }[] = [];
  const trailing: typeof result = [];

  for (const extra of extras) {
    if ("position" in extra.anchor && extra.anchor.position === "start") {
      result.push({ id: extra.id, heading: extra.heading, body: extra.body });
    }
  }

  for (const clause of kept) {
    for (const extra of extras) {
      if ("before" in extra.anchor && extra.anchor.before === clause.id) {
        result.push({ id: extra.id, heading: extra.heading, body: extra.body });
      }
    }
    result.push(clause);
    for (const extra of extras) {
      if ("after" in extra.anchor && extra.anchor.after === clause.id) {
        result.push({ id: extra.id, heading: extra.heading, body: extra.body });
      }
    }
  }

  const placed = new Set(result.map((clause) => clause.id));
  for (const extra of extras) {
    const isEnd = "position" in extra.anchor && extra.anchor.position === "end";
    if (isEnd || !placed.has(extra.id)) {
      trailing.push({ id: extra.id, heading: extra.heading, body: extra.body });
    }
  }

  return {
    terms: [...result, ...trailing].map(({ heading, body }) => ({ heading, body })),
    droppedRequired,
  };
}
