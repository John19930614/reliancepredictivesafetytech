// Fixed Price — named deliverables for one total.
//
// THE SHAPE OF THE DEAL
//   "Write three safety programs and conduct two audits for $X." The scope is a
//   finite list; the price is a single number; the seller absorbs every hour the
//   list did not anticipate. That asymmetry is what this profile has to answer,
//   and it answers it in three places:
//
//     1. The deliverables listed in the scope ARE the scope (fixed.deliverables_
//        define_scope). No implied extras, and an ambiguity in a line is resolved
//        in writing at kickoff or becomes a change order.
//     2. A deliverable that sits unreviewed is accepted anyway
//        (fixed.acceptance). Without deemed acceptance a fixed-price job stays
//        open forever: no acceptance, no milestone, no invoice, and the seller
//        funds the client's silence.
//     3. Revisions are counted (fixed.revisions), and everything past the count
//        or outside the list runs through the change order in the reworded
//        `scope_changes` clause.
//
// WHAT THIS TYPE IS NOT
//   packageKey is "none" in transaction-templates.ts: this proposal sells no
//   platform subscription, so five shared clauses written for one are wrong on
//   its face. warranty_disclaimer, no_guarantee, osha_disclaimer and taxes are
//   restated about deliverables; auto_renewal_ca is dropped, because nothing
//   here renews. indemnification and trade_secrets carried the same platform
//   assumption and are restated for the same reason.
//
// WHAT THIS PROFILE MUST NOT DECIDE
//   Payment terms, late fee, liability cap, governing law, validity days, the
//   fixed price itself, how many deliverables there are, and any date. All of
//   those are per-deal fields the seller sets in the editor, and the shared
//   clauses interpolate them. Procedural periods are different: a review window
//   and an included revision count are terms of art, not prices, and stating
//   them here is the whole point of the acceptance mechanic.

import type { ProposalTypeProfile } from "./contract";

/**
 * The client's review period for a submitted deliverable.
 *
 * Interpolated into BOTH the acceptance clause and the revision clause so a
 * resubmitted deliverable can never be given a different window than a first
 * submission. Two hand-typed numbers is exactly how documents come to contradict
 * themselves; fixed-price.test.ts pins the composed strings as well.
 */
const reviewWindow = "10 business days";

/** Revision rounds included per deliverable. Beyond this: change order. */
const includedRevisionRounds = "two rounds";

export const fixedPriceProfile: ProposalTypeProfile = {
  key: "fixed_price",

  lexicon: {
    documentTitle: "Fixed-Price Services Proposal",
    engagementNoun: "this fixed-price engagement",
    feesHeading: "Fixed Price Schedule",
    // Not "Deliverables": the rendered document already has a Deliverables
    // section, and this heading sits over the scope of each priced line.
    scopeHeading: "Scope of Deliverables",
    termHeading: "Period of Performance",
    warrantySubject: "the deliverables and services",
    unitNoun: "deliverable",
  },

  // The prose blocks in sections 01, 03, 04, 06 and 07. The shared copy they
  // replace was written for a subscription sale and printed unchanged on this
  // type: section 04 promised "Configured platform subscription and client
  // account setup", section 03 said the scope could scale to "a full enterprise
  // platform rollout", and section 06 listed "Platform setup, modules,
  // templates, workflows, and user roles" as a step - on a document that sells
  // three written programs and two audits for one price, under a packageKey of
  // "none" with no subscription anywhere in the deal.
  //
  // Same rule as the clauses: no counts, no durations, no rates, no dates. Each
  // of those is a schedule line or a field the seller sets per deal, and copy
  // that restates one is copy that contradicts the schedule printed beside it.
  // The review window and the included revision count are stated once each, in
  // the acceptance and revision clauses; this copy points at them.
  //
  // The two ideas the clauses turn on carry into the prose: the named
  // deliverables ARE the scope, and acceptance is a defined mechanism with a
  // window and a default, not a courtesy.
  copy: {
    subtitle: "Fixed-Price Safety Programs, Audits, and Compliance Documentation Services",
    purposeCallout:
      "This document establishes the named deliverables, the fixed fee for them, the acceptance process, the assumptions, and the commercial terms for the safety programs, assessments, and compliance documentation described below.",
    scopeIntro:
      "Each line below is a named deliverable, stated with what it covers and the criteria it is measured against at acceptance. " +
      "The deliverables listed here are the complete scope of this engagement; work of a kind not listed, and additional quantities of a listed deliverable, proceed by written change order, and lines can be added or removed before signature.",
    // What the client receives from a finite list of work products, not from an
    // account. The revision cycle is named but not counted: the count lives in
    // the Included Revisions clause, and stating it twice is how a document
    // comes to disagree with itself.
    deliverables: [
      "Each deliverable named in the schedule, prepared to the acceptance criteria stated for it",
      "Written submission of each deliverable to the client contact named for this engagement",
      "The included revision cycle on a deliverable returned with a valid written rejection",
      "Final versions of each accepted deliverable in the file format agreed at kickoff",
      "A written record of acceptance or deemed acceptance for each deliverable, supporting milestone invoicing",
    ],
    scheduleSteps: [
      "Acceptance, kickoff, and confirmation of any detail a deliverable line leaves open",
      "Intake of client documents, records, and site access",
      "Preparation and written submission of each deliverable",
      "Client review within the period stated in the terms, and revision of the items raised",
      "Acceptance or deemed acceptance, final versions, and milestone invoicing",
    ],
    clientResponsibilities: [
      "Name a single point of contact with authority to give direction, answer questions, consolidate the organization's feedback, and accept or reject deliverables on the client's behalf.",
      "Provide the existing programs, policies, training records, incident records, and site information each deliverable depends on, together with access to the sites and personnel a deliverable examines.",
      "Return consolidated written review comments within the review period stated in the terms, identifying the criterion a deliverable does not meet rather than raising a general preference.",
      "Treat that review period as a deadline, since a deliverable left unreviewed when it ends is deemed accepted and a correction requested afterward proceeds by change order.",
      "Retain responsibility for adopting, implementing, and enforcing each deliverable, for supervising its own personnel, and for the client's own regulatory compliance.",
    ],
  },

  omitClauses: [
    // Nothing renews: the fixed price buys a finite list of deliverables and the
    // engagement ends when the last one is accepted. There is no recurring term
    // for the California auto-renewal statute to govern.
    "auto_renewal_ca",
  ],

  overrideClauses: {
    // THE SHARED CLAUSE licensed "purchased deliverables solely during the
    // active paid term" — and this type's own Ownership clause grants a
    // PERPETUAL license on payment in full. Two clauses on one page said
    // opposite things about the same documents, and the ownership clause used
    // to defer, so the term-limited version won: a client who paid in full for
    // three written safety programs held no lasting right to use them. There is
    // no term on a fixed-price engagement to hang a licence off in the first
    // place. Restated here, and the Ownership clause now prevails for the
    // deliverables rather than deferring.
    intellectual_property: {
      body:
        "Seller retains all rights in its methods, templates, checklists, assessment tools, source materials, and pre-existing intellectual property, and may reuse the general knowledge, skills, and know-how gained performing this engagement. " +
        "Client's rights in the deliverables it has paid for are stated in the Ownership of Delivered Work Products terms below, are not limited to any term, and survive completion of this engagement. " +
        "All rights not expressly granted are reserved by Seller.",
    },
    data_ai_use: {
      body:
        "Programs, records, and site information Client provides are processed only to prepare the deliverables this proposal describes. " +
        "They are not used for cross-client model training, sold, or shared with third parties without written authorization, except as required by law. " +
        "Seller complies with applicable state data laws, including CCPA/CPRA (Cal. Civ. Code sec.1798.100) and Wis. Stat. sec.134.98.",
    },
    // Reworded for deliverables instead of "sites, users, modules", and given
    // the rule this type lives or dies by: unsigned work does not start.
    scope_changes: {
      heading: "Change Orders",
      body:
        "Any change to the deliverables, their quantities, the criteria stated for them, or the period of performance requires a written change order signed by both parties, stating the work added or removed, the adjustment to the fixed price, and the effect on delivery dates. " +
        "Verbal approvals, and approvals given in passing during a site visit or a review call, are not binding. " +
        "Work outside the deliverables listed in the scope does not begin until a change order covering it is signed; until then Seller is not obligated to perform it and Client is not obligated to pay for it. " +
        "Seller may pause work on an affected deliverable if a scope dispute stays unresolved beyond 10 business days.",
    },

    // Shared text disclaimed a platform and promised nothing in its place. On a
    // fixed-price job the meaningful term is the exclusive remedy: a deliverable
    // that misses its stated criteria gets corrected, not damages.
    warranty_disclaimer: {
      body:
        "THE DELIVERABLES AND SERVICES ARE PROVIDED WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. " +
        "Seller does not warrant that a deliverable will satisfy a regulator, an insurer, or a third-party auditor, or that every safety risk at a site will be identified. " +
        "Seller's sole obligation, and Client's exclusive remedy, for a deliverable that does not meet the criteria stated for it in the scope is correction of that deliverable under the acceptance and revision terms above. " +
        "Where a state does not allow these exclusions, they apply to the fullest extent permitted.",
    },

    // The outcome gap on written work is implementation: a program on a shelf
    // prevents nothing, and the shared wording pinned that on a platform.
    no_guarantee: {
      body:
        "The deliverables support safety management, compliance documentation, and risk visibility. They do not guarantee elimination of incidents, injuries, OSHA violations, citations, or losses. " +
        "A program, procedure, or audit finding produces no protection until Client implements it, trains its personnel on it, and enforces it, and implementation is Client's responsibility unless a deliverable listed in the scope expressly covers it. " +
        "Client retains full responsibility for jobsite safety and compliance with 29 C.F.R. Parts 1903, 1904, 1910, and 1926.",
    },

    // Same disclaimer, but about a written work product rather than a tool, and
    // bounded to what was observed and furnished when the work was performed.
    osha_disclaimer: {
      body:
        "The deliverables are safety management work products, not legal advice, engineering services, or a certified compliance determination. " +
        "OSHA compliance (29 U.S.C. sec.651 et seq.) and site-specific requirements remain the Client's responsibility, and the Client's designated Competent Person retains all field safety decisions. " +
        "A program, assessment, or audit prepared under this engagement reflects the conditions observed and the information furnished when the work was performed, is limited to the areas and activities stated in the scope, and does not certify that a site or an employer is in compliance.",
    },

    // Carried "misuse of the platform" and infringement "of the platform as
    // provided". Neither exists here; the delivered work products do.
    indemnification: {
      body:
        "Client indemnifies Seller against third-party claims arising from Client's use or misuse of the deliverables, its failure to implement or enforce them, its violation of law, inaccurate or incomplete information it furnished, or jobsite conditions. " +
        "Seller indemnifies Client against claims that a deliverable as furnished infringes a valid U.S. patent, copyright, or trade secret, provided Seller is promptly notified and controls the defense.",
    },

    // Same protection, described as what it actually is on this deal: the
    // methods and templates behind a bought deliverable, not a hosted product.
    trade_secrets: {
      body:
        "Seller's methodologies, program templates, audit protocols, predictive risk logic, scoring models, and the underlying materials used to prepare the deliverables are protected trade secrets under the Wisconsin Uniform Trade Secrets Act (Wis. Stat. sec.134.90) and the federal Defend Trade Secrets Act (18 U.S.C. sec.1836). " +
        "Receipt of a deliverable conveys no right to those underlying materials. Client shall not reverse engineer, copy, or derive Seller's proprietary methods or templates from the deliverables, and shall not furnish the deliverables to a competitor of Seller. " +
        "Unauthorized disclosure may result in injunctive relief and damages.",
    },

    // "Taxes & SaaS Fees" on a document that sells no SaaS. Professional
    // services and work products are the taxable thing here.
    taxes: {
      heading: "Taxes",
      body:
        "Fees stated in the schedule are exclusive of tax. Client is responsible for applicable sales, use, and similar taxes on the services and deliverables in the jurisdiction where they are performed or delivered (e.g., Wis. Stat. sec.77.52). " +
        "Where applicable, Seller will collect and remit required taxes or provide a tax invoice for Client remittance. " +
        "Client is responsible for furnishing any exemption certificate it intends to rely on before the affected invoice is issued.",
    },
  },

  extraClauses: [
    /* ---------------------------------------------------------------------- */
    /* The boundary, the acceptance mechanic, and the money that follows it.   */
    /* All four print between Payment Terms and Change Orders, in this order.  */
    /* ---------------------------------------------------------------------- */
    {
      id: "fixed.deliverables_define_scope",
      heading: "Deliverables Define the Scope",
      anchor: { before: "scope_changes" },
      body:
        "The deliverables listed in the scope and priced in the schedule are the complete scope of this engagement, and the fixed price is the entire professional fee for those deliverables and nothing else. " +
        "Each line states what the deliverable is and the quantity included; work of a kind not listed, additional quantities of a listed deliverable, and repetition of a deliverable already completed are outside the fixed price. " +
        "Where a line is silent on a detail, the parties confirm the detail in writing at kickoff without changing the price; where that confirmation would add work beyond the line as written, it proceeds as a change order.",
    },
    {
      id: "fixed.acceptance",
      heading: "Deliverable Acceptance",
      anchor: { before: "scope_changes" },
      body:
        `Seller submits each deliverable in writing, by electronic delivery to the Client contact named for this engagement, and the submission starts a review period of ${reviewWindow}. ` +
        "Within that period Client either accepts the deliverable in writing or delivers a written rejection. " +
        "A rejection is effective only if it is delivered within the review period, identifies the specific criterion stated for that deliverable in the scope that the work does not meet, and describes what is missing or incorrect in enough detail for Seller to correct it. " +
        "A general statement of dissatisfaction, a preference raised after the fact, and a request for work not listed in the scope are not valid rejections; the last of these is handled as a change order. " +
        "If Client does not deliver a valid written rejection within the review period, the deliverable is deemed accepted on the last day of that period. " +
        "Use of a deliverable in Client operations, including furnishing it to a regulator, an insurer, or another third party, is acceptance of that deliverable. " +
        "Correction of a deliverable already accepted or deemed accepted proceeds as a change order.",
    },
    {
      id: "fixed.revisions",
      heading: "Included Revisions",
      anchor: { before: "scope_changes" },
      body:
        `Each deliverable includes ${includedRevisionRounds} of revision to address items raised in a valid written rejection. A revision round addresses the items identified in that rejection and no others. ` +
        `Each revised deliverable is resubmitted under the acceptance terms above and carries the same review period of ${reviewWindow}, and items not raised in the first rejection are not grounds for rejecting the revision. ` +
        "A third or later round of revision on the same deliverable, and any revision arising from a change in Client direction, personnel, or standards rather than from a criterion stated in the scope, proceeds as a change order.",
    },
    {
      id: "fixed.milestone_invoicing",
      heading: "Milestone Invoicing",
      anchor: { before: "scope_changes" },
      body:
        "Fees are invoiced against the milestones stated in the schedule; where the schedule names no separate milestones, each deliverable is its own milestone. " +
        "A milestone becomes invoiceable when the deliverable it covers is accepted or deemed accepted under the acceptance terms above, and the invoice is then payable on the payment terms stated above. " +
        "Acceptance of one deliverable is not conditioned on the status of another, and a dispute over one deliverable does not suspend payment for deliverables already accepted. " +
        "If the engagement ends before every deliverable is complete, deliverables accepted or deemed accepted are invoiced in full, and work performed on a deliverable still in progress is invoiced in proportion to the work completed as of the end date.",
    },

    /* ---------------------------------------------------------------------- */
    /* What the fixed price assumed about the client, printed after the change */
    /* order rule so the reader meets the obligation and its remedy together.  */
    /* ---------------------------------------------------------------------- */
    {
      id: "fixed.client_obligations",
      heading: "Client Obligations and Dependencies",
      anchor: { after: "scope_changes" },
      body:
        "The fixed price assumes Client provides, without charge and when Seller reasonably requests them: the existing programs, policies, training records, injury and incident records, and site information the deliverables depend on; " +
        "access to the sites, work areas, and activities a deliverable examines, at times when the work being examined is actually taking place; " +
        "reasonable access to the supervisors, competent persons, and subject-matter personnel whose practices a deliverable documents; " +
        "and one named point of contact with authority to give direction, answer questions, and accept or reject deliverables on Client's behalf. " +
        "Client is responsible for the accuracy and completeness of the information it furnishes, and Seller may rely on it without independent verification.",
    },
    {
      id: "fixed.regulatory_change",
      heading: "Regulatory Change During the Engagement",
      anchor: { after: "scope_changes" },
      body:
        "The deliverables reflect the standards, rules, and interpretations in effect when the work is performed. " +
        "If a federal, state, or local requirement bearing on a deliverable is adopted, amended, or reinterpreted after this proposal is accepted, and conforming the deliverable to it requires work beyond the deliverable as written, that additional work proceeds as a change order. " +
        "Reissuing a deliverable already accepted to reflect a later regulatory change is new work rather than a revision.",
    },

    /* ---------------------------------------------------------------------- */
    /* Bought work products. Subordinated to the seller's own IP field so this */
    /* clause can only add to it, never quietly rewrite it.                    */
    /* ---------------------------------------------------------------------- */
    {
      id: "fixed.work_product_license",
      heading: "Ownership of Delivered Work Products",
      anchor: { after: "intellectual_property" },
      body:
        "On payment in full of the fixed price, Client receives a perpetual, non-exclusive, non-transferable license to use, reproduce, and adapt the final deliverables for its own internal safety and compliance purposes at the sites it operates, including furnishing them to a regulator, an insurer, or a customer that requests them. " +
        "Until the fixed price is paid in full, deliverables are furnished for review only and no license to rely on them in Client operations is granted. " +
        "Drafts, working papers, field notes, and the templates, checklists, and methods used to produce the deliverables remain Seller's property, and Seller may reuse the general knowledge, skills, and know-how gained in performing this engagement. " +
        "Client shall not sell, license, or distribute the deliverables to third parties as a product or service. " +
        // PRECEDENCE REVERSED DELIBERATELY. This clause used to defer to the
        // Intellectual Property terms above, which license deliverables "solely
        // during the active paid term" — a subscription rule. On a fixed-price
        // engagement there is no term: the client buys the written program
        // outright. Deferring meant the perpetual license granted in this very
        // clause was cancelled by the clause it deferred to, so a client who
        // paid in full for three safety programs held no license to keep using
        // them. For the DELIVERABLES, this clause governs.
        "As to the deliverables identified in the schedule, this clause governs and prevails over any conflicting statement in the Intellectual Property terms above; those terms continue to govern Seller's own methods, templates, and pre-existing intellectual property.",
    },

    /* ---------------------------------------------------------------------- */
    /* Delay relief, printed beside force majeure: one covers events outside   */
    /* anyone's control, this one covers the client's own inputs.              */
    /* ---------------------------------------------------------------------- */
    {
      id: "fixed.client_delay",
      heading: "Client-Caused Delay",
      anchor: { before: "force_majeure" },
      body:
        "Delivery dates assume Client meets its obligations under this proposal and returns reviews within the review period stated above. " +
        "If Client information, site access, personnel availability, decisions, or reviews are late, or a site condition prevents scheduled work from proceeding, the affected delivery dates move by at least the length of the delay and Seller is not in breach for the resulting change to the schedule. " +
        "Where a delay requires Seller to remobilize, repeat work already completed, hold staff time reserved for the engagement, or extend the engagement beyond the period of performance, the resulting cost is addressed by change order. " +
        "Where work stops for a reason attributable to Client and cannot resume, deliverables completed to that point are invoiced under the milestone terms above.",
    },
  ],
};
