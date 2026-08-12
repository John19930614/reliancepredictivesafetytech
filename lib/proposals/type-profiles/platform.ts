// The ordinary platform subscription — the everyday "buy the platform" document.
//
// WHAT THIS TYPE IS
//   A normal-sized company subscribing to the platform on the term stated in the
//   schedule. It is deliberately NOT the Enterprise proposal: no MSA precedence,
//   no uptime commitment with service credits, no security review, no multi-site
//   governance, no procurement ceremony. A buyer at this size reads the whole
//   terms section, so the terms section has to be readable — six added clauses
//   that answer the six questions this sale actually raises, and nothing else.
//
// THE SIX QUESTIONS
//   1. How long am I signed up for, and how do I get out? -> platform.term_renewal
//   2. What happens to the price at renewal?              -> platform.renewal_pricing
//   3. What if we outgrow the included users/jobsites?    -> platform.included_seats_sites
//   4. What does getting started require of us?           -> platform.onboarding
//   5. What support am I actually buying?                 -> platform.support
//   6. What are we not allowed to do with it?             -> platform.acceptable_use
//
// COORDINATION, NOT DUPLICATION
//   Three shared clauses were written for a services engagement and read wrong
//   against a subscription, so they are RESTATED rather than added to:
//     * scope_changes reframes a "change order or Seller pauses work" remedy into
//       how a subscription is actually changed. Suspending a client's platform
//       access over a scope disagreement is not a term this company should print.
//     * termination gets the subscription's real mechanics (cure period, what a
//       terminated term costs, what a Seller breach refunds) instead of "fees
//       earned through the termination date, plus non-cancelable third-party
//       commitments", which describes a consulting invoice.
//     * client_data_ownership gains ONE sentence: export is available throughout
//       the term, not only on the way out. The on-termination export window and
//       the deletion promise stay verbatim so the two never disagree.
//   And entire_agreement drops the MSA / SOW / change-order stack for the signed
//   order this deal is actually built on. Enterprise keeps that apparatus; this
//   type shedding it is the point of having two profiles.
//
//   The renewal clauses are written to SIT UNDER the shared California
//   auto-renewal statute clause, not against it: renewal is confirmed in writing
//   before it is charged (the statute's notice duty), any fee change is stated 45
//   days out (comfortably inside the statute's 30-day material-change notice, and
//   45 > 30 leaves the non-renewal window open after the client knows the number),
//   and the California cancellation right is expressly preserved rather than
//   narrowed by the 30-day non-renewal notice.
//
// COPY RULE (the same one the catalog and templates live under)
//   No seat counts, no jobsite counts, no prices, no tier names, no term lengths
//   in any frozen string here. Every one of those is a per-deal commercial choice
//   the seller makes in the editor, and prose that hardcodes one is prose that
//   silently contradicts the schedule printed six inches above it.

import type { ProposalTypeProfile } from "./contract";

export const platformProfile: ProposalTypeProfile = {
  key: "platform",

  lexicon: {
    documentTitle: "Platform Subscription Proposal",
    engagementNoun: "this subscription",
    feesHeading: "Subscription Fees",
    scopeHeading: "Platform Access & Onboarding",
    termHeading: "Subscription Term",
    warrantySubject: "the platform and its support services",
    unitNoun: "billing period",
  },

  // The prose blocks in sections 01, 03, 04, 06 and 07. The shared copy they
  // replace was written FOR a subscription sale, so it started closer to right
  // here than on any other type - and was still generic and stale. Section 03
  // hedged that the proposal "can be scaled for a small pilot, a single jobsite,
  // a multi-site deployment, or a full enterprise platform rollout", which
  // describes the price book rather than the deal the client is reading; section
  // 04 listed "Billing package selection and proposal pricing schedule" as
  // something the client RECEIVES; and section 06 ran from "Kickoff and access
  // setup" to "final billing activation" without naming the administrator
  // handover that is the actual end of onboarding.
  //
  // Same COPY RULE as the clauses below: no counts, no tier names, no prices, no
  // term lengths. Where a number belongs to the deal this points at the schedule.
  // And the same line against Enterprise the clauses hold: nothing here offers an
  // availability commitment, service credits, a security review, or certificates
  // of insurance. A contractor buying this tier should not be reading a document
  // written for a procurement department.
  copy: {
    subtitle: "Predictive Safety Platform Subscription, Onboarding, and Support Services",
    purposeCallout:
      "This document establishes the proposed subscription tier, fees, onboarding scope, deliverables, assumptions, and commercial terms for the platform subscription described below.",
    scopeIntro:
      "The subscription covers platform access at the tier stated in the schedule, for the included users and jobsites listed there, together with the onboarding that configures the account to the client's own operation. " +
      "Each onboarding line is listed separately with the configuration work it covers, and the tier can be adjusted before signature.",
    // What the client receives from a subscription: a configured account and the
    // people who can run it. The tier and the included counts live in the
    // schedule, so these point at it rather than restating it.
    deliverables: [
      "Configured platform subscription and client account for the tier stated in the schedule",
      "User roles and jobsite structure for the included users and jobsites shown in the schedule",
      "Onboarding of the client's existing safety documents, templates, and forms into the platform",
      "Administrator enablement sessions and handover of the configured account to the client's named administrators",
      "Reporting views for inspections, corrective actions, and document status for the client's leadership",
    ],
    scheduleSteps: [
      "Acceptance, signed order, and account provisioning",
      "Kickoff and intake of the jobsite list, user roster, and existing safety documents",
      "Configuration of jobsites, users and roles, documents, templates, and reporting views",
      "Configuration review and sign-off with the client's administrators",
      "Go-live for the client's users, support handover, and billing activation",
    ],
    clientResponsibilities: [
      "Provide accurate company, jobsite, user, and billing information for the account and its invoicing.",
      "Name the account administrator and identify the reviewers authorized to approve scope, pricing, and commercial terms.",
      "Supply the existing safety documents, templates, forms, and site-specific requirements the account is configured from.",
      "Review configuration drafts within the review windows agreed at kickoff and consolidate feedback into a single response where possible.",
      "Retain responsibility for final operational decisions, employee supervision and discipline, regulatory filings, and compliance at the client's sites.",
    ],
  },

  omitClauses: [
    // Non-Solicitation: a mutual 12-month no-hire is negotiation friction on an
    // ordinary subscription, where the only Seller personnel the client's team
    // meets are the onboarding contacts, briefly. It stays on the services and
    // Enterprise types, where Seller people work alongside client staff.
    "non_solicitation",
  ],

  overrideClauses: {
    scope_changes: {
      heading: "Changes to the Subscription",
      body: "Adding modules, jobsites, users, or services to the subscription requires a written order or written confirmation from both parties; the added items are billed as stated in that writing. Verbal approvals are not binding. Configuration changes within the capabilities already included are handled as ordinary support and require no order.",
    },

    client_data_ownership: {
      body: "Client owns all client-provided data, including safety records, personnel information, incident data, and site content. Seller processes it only to deliver contracted services. Throughout the subscription term Client may export its own records at any time using the export functions in the platform, at no additional charge. On termination, Seller provides the data in a standard exportable format within 30 days, then securely deletes it from active systems.",
    },

    termination: {
      body: "Either party may terminate the subscription for a material breach the other party has not cured within 30 days after written notice describing it. If Client terminates for Seller's uncured breach, Seller refunds the fees prepaid for the remainder of the terminated term. In all other cases the fees for the then-current subscription term remain payable. Seller may suspend an individual account being used in violation of the acceptable-use terms, with notice to Client, and restores access once the violation is corrected. Confidentiality, intellectual property, dispute-resolution, and data-privacy terms survive termination, as does the data export described under Client Data Ownership.",
    },

    entire_agreement: {
      body: "This proposal, together with the signed order or subscription schedule and any change confirmed in writing under Changes to the Subscription, is the entire agreement and supersedes all prior negotiations and representations. No change is binding unless in a writing signed by both parties.",
    },
  },

  extraClauses: [
    {
      id: "platform.included_seats_sites",
      heading: "Included Users & Jobsites",
      body: "The subscription covers the included users and jobsites shown in the schedule. Client may add users or jobsites during the term; additions are priced at the rates shown in the schedule, prorated for the remainder of the then-current term, and renew with the subscription. If active users or jobsites exceed the included counts, Seller notifies Client, and the parties either add the difference to the subscription on that same prorated basis or bring usage back within the included counts within 30 days. Seller does not bill an overage retroactively for any period preceding that notice.",
      anchor: { after: "scope_changes" },
    },

    {
      id: "platform.onboarding",
      heading: "Onboarding & Configuration",
      body: "Onboarding covers the configuration activities listed in the scope: account setup for the included users, configuration of the jobsites in scope, and the working sessions that hand the configured platform to Client's administrators. Client designates a point of contact and supplies the jobsite list, the user roster with roles, and the existing safety documents and templates to be loaded. Onboarding schedules assume that information arrives when requested; delays in providing it move the onboarding schedule and do not change the subscription term or the fees.",
      anchor: { after: "scope_changes" },
    },

    {
      id: "platform.support",
      heading: "Support & Maintenance",
      body: "Support is provided through the support channels in the platform during Seller's standard business hours. Seller acknowledges a support request by the end of the next business day, and works an issue that prevents all Client users from reaching the platform continuously during business hours until it is resolved or a workaround is in place. Seller performs planned maintenance outside standard business hours where practical and gives advance notice of maintenance expected to interrupt access. This subscription does not include a dedicated support contact, after-hours response commitments, or on-site support; those are quoted separately.",
      anchor: { after: "scope_changes" },
    },

    {
      id: "platform.acceptable_use",
      heading: "Acceptable Use & Account Security",
      body: "Platform access is licensed to Client for Client's own safety operations. Client shall not resell, sublicense, or otherwise provide access to a third party, and shall not use the platform to deliver a service to another organization. Each login belongs to one named individual and is not shared; a user who leaves the organization is deactivated and that seat may be reassigned. Client is responsible for the security of its credentials and for activity conducted under its accounts, and notifies Seller promptly on discovering unauthorized access. Violations are handled under the Termination section.",
      anchor: { after: "trade_secrets" },
    },

    {
      id: "platform.term_renewal",
      heading: "Subscription Term & Renewal",
      body: "The subscription runs for the term stated in the schedule and renews automatically for successive terms of the same length unless either party gives written notice of non-renewal at least 30 days before the end of the then-current term. Notice of non-renewal takes effect at the end of that term; it does not end the subscription early or create a refund for the term in progress. Seller confirms each renewal in writing before it is charged. Nothing in this section limits the cancellation rights described under California Auto-Renewal Law.",
      anchor: { before: "auto_renewal_ca" },
    },

    {
      id: "platform.renewal_pricing",
      heading: "Renewal Pricing",
      body: "The subscription fee stated in the schedule holds for the initial term. Seller states any change to the subscription fee for a renewal term in writing at least 45 days before the end of the then-current term, which leaves the non-renewal notice period open after the change is known. A renewal term for which no change is stated renews at the fee in effect for the expiring term. A fee change never applies retroactively to a term already in progress.",
      anchor: { before: "auto_renewal_ca" },
    },
  ],
};
