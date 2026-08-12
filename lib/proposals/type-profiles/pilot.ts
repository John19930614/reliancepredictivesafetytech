// The PILOT profile — what a fixed-price, time-boxed evaluation has to say that
// an ongoing subscription does not.
//
// THE ONE THING THIS DOCUMENT MUST NOT DO
//   A pilot is an evaluation, not the sale of a subscription. The scope prose in
//   transaction-templates.ts ends on "nothing converts automatically"; these
//   clauses are the part that makes that enforceable. So the pilot expires on
//   the last day of its term with no notice from anyone, nothing renews,
//   nothing converts, no charge follows the pilot fee, and a broader rollout is
//   a separate decision at its own price. Every mention of a subscription,
//   renewal, or conversion in this file is a denial of one.
//
// WHAT THIS FILE MAY NOT CONTAIN
//   No commercial value the seller sets per deal: payment terms, late fee,
//   liability cap, governing law, validity days, the pilot fee, the included
//   user and jobsite counts, or the pilot's dates. Those are interpolated into
//   the shared clauses from the seller's own fields — which is also why the six
//   clauses that CARRY them (payment_terms, data_ai_use, intellectual_property,
//   limitation_of_liability, governing_law, proposal_validity) are deliberately
//   not overridden here. An override replaces a resolved body with a fixed
//   string, so overriding one of those would either drop the seller's value or
//   freeze someone else's deal into the template. Where a pilot needs something
//   said next to one of them, it is said in an extra clause anchored beside it
//   (see pilot.rollout_pricing, which sits in front of Proposal Validity rather
//   than rewriting it).
//
//   Fixed PROCEDURAL periods are a different thing and are used freely: the
//   shared set already runs on "10 business days", "72 hours", "3 years", and a
//   cure period or an export window is not a price.

import type { ProposalTypeProfile } from "./contract";

export const pilotProfile: ProposalTypeProfile = {
  key: "pilot",

  lexicon: {
    documentTitle: "Pilot & Platform Access Proposal",
    engagementNoun: "this pilot",
    feesHeading: "Pilot Fee Schedule",
    scopeHeading: "Pilot Scope of Work",
    termHeading: "Pilot Term and Implementation Approach",
    warrantySubject: "the platform and pilot services",
    unitNoun: "pilot phase",
  },

  omitClauses: [
    // California's ARL governs automatic renewal offers and continuous service
    // offers. This pilot is neither: one fee, one fixed term, expiring on its
    // own. Printing a conditional "if the term auto-renews" clause on a
    // document that expressly does not renew invites the reading that the
    // parties contemplated renewal, which is the exact misunderstanding this
    // type exists to prevent. The statute is answered head-on instead, in the
    // same slot, by pilot.no_automatic_conversion.
    "auto_renewal_ca",
  ],

  overrideClauses: {
    // Adds the half a pilot needs: findings ABOUT the platform are Seller's, and
    // the client's own safety records are pointedly not swept up with them.
    confidentiality: {
      body: "Each party protects the other's confidential business, pricing, and operational information with reasonable care; these obligations survive termination for 3 years. Client safety data, injury records, and incident reports are confidential and will not be shared with third parties without written authorization, except as required by law. Findings that describe the platform itself — configuration, performance, benchmark results, and any pre-release feature — are Seller's confidential information. Client's own data and records are not, and stay governed by Client Data Ownership.",
    },

    // The shared clause hangs the export-and-delete mechanic on termination. A
    // pilot's ordinary ending is expiry, not termination, so the trigger is
    // restated to include it. The mechanic itself stays here and is only
    // cross-referenced elsewhere, so there is one description of it.
    client_data_ownership: {
      body: "Client owns all client-provided data, including safety records, personnel information, incident data, and site content. Seller processes it only to deliver the pilot. When the pilot term ends — whether or not Client proceeds to a broader rollout — and on any earlier termination, Seller provides the data in a standard exportable format within 30 days, then securely deletes it from active systems. Retrieving the export within that window is Client's responsibility.",
    },

    // Subject follows the deal, and the disclaimer picks up the thing a pilot
    // specifically must not be read to promise: that the pilot will succeed.
    warranty_disclaimer: {
      body: "THE PLATFORM AND PILOT SERVICES ARE PROVIDED AS IS AND AS AVAILABLE, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. Seller does not warrant that the platform will be error-free, that the pilot will meet the success criteria, or that all safety risks will be identified or prevented.",
    },

    // A pilot's results are a sample: limited sites, limited time, limited data.
    // Saying so is what keeps a good pilot from being quoted back as a promise.
    no_guarantee: {
      body: "The platform supports safety management, reporting, and risk visibility. It does not guarantee elimination of incidents, injuries, OSHA violations, or losses. Pilot results describe the included users and jobsites, the configuration in place, and the data supplied during the pilot term; they are not a projection of results at other sites, at larger scale, or over a longer period. Client retains full responsibility for jobsite safety and compliance with 29 C.F.R. Parts 1903, 1904, 1910, and 1926.",
    },

    // On a time-boxed evaluation, a delay is worse than a loss: the shared
    // remedy (terminate after 60 days) can outlast the pilot itself, so the
    // parties get schedule relief first and the shared remedy after.
    force_majeure: {
      body: "Neither party is liable for delays caused by events beyond its reasonable control (natural disasters, government actions, cyberattacks, outages, or pandemic conditions). The affected party will notify the other promptly and use reasonable efforts to resume performance. Because the pilot is time-boxed, the parties may instead extend the pilot term in writing by the length of the delay so the evaluation still runs its full course. If the event continues beyond 60 days, either party may terminate the affected services without penalty.",
    },

    // The shared clause assumes an engagement someone has to end. A pilot ends
    // itself, and that difference is the whole point of the type.
    termination: {
      body: "The pilot expires on the last day of the pilot term without notice from either party; expiry is not a termination for breach, and neither party owes the other anything to let it happen. Before then, either party may terminate for a material breach that remains uncured 10 business days after written notice. Client remains responsible for fees earned through the termination date, plus approved expenses and non-cancelable third-party commitments. Confidentiality, IP, dispute-resolution, and data-privacy terms survive, and data is returned and deleted as stated under Client Data Ownership.",
    },

    // The integration clause is where a client's "but we assumed we were signing
    // up" argument goes to die, so the limit is stated in the clause that says
    // what the document is.
    entire_agreement: {
      body: "This proposal, together with any executed Master Services Agreement, Statement of Work, and signed change orders, is the entire agreement and supersedes all prior negotiations and representations. It covers the pilot only: no subscription, license term, or production commitment arises from it, and a broader rollout takes a separately signed agreement. No change is binding unless in a writing signed by both parties.",
    },
  },

  extraClauses: [
    {
      // Written at kickoff, not argued about at the end.
      id: "pilot.success_criteria",
      heading: "Pilot Success Criteria",
      body: "The parties agree the pilot's success criteria in writing at kickoff, and the pilot is evaluated against those criteria. Criteria proposed after kickoff apply only if both parties confirm them in writing. Within 10 business days after the pilot term ends, the parties review the results together against the agreed criteria; that review is the shared record of what the pilot showed, and each party draws its own conclusion from it.",
      anchor: { before: "scope_changes" },
    },
    {
      // Sits directly under Scope Changes because it is the pilot-shaped case of
      // it: the boundary is the schedule's own included counts.
      id: "pilot.scope_boundary",
      heading: "Pilot Scope Boundary",
      body: "The pilot fee covers the setup, configuration, testing, training, and platform access described in the scope, for the included users and jobsites shown in the schedule. Additional users, jobsites, modules, integrations, or connected systems are quoted separately and confirmed in writing before that work begins. Pilot timelines assume Client makes the relevant personnel, documents, and jobsite information available when the schedule calls for them; where that access is delayed, the pilot schedule shifts rather than the pilot scope growing.",
      anchor: { after: "scope_changes" },
    },
    {
      // Publicity is the standard way pilot findings escape, and a good pilot is
      // the one a seller most wants to talk about. Consent, in writing, per use.
      id: "pilot.evaluation_reference",
      heading: "Evaluation Findings & Publicity",
      body: "Neither party publishes the pilot results, names the other party, uses the other's marks, or presents the pilot as a case study, reference, testimonial, or marketing material without the other party's prior written consent. Consent is specific to the use requested and is not consent to a later or different use. Client may share the results within its own organization and with its advisors, auditors, and insurers, and either party may disclose them where the law requires.",
      anchor: { after: "confidentiality" },
    },
    {
      // A pilot is where pre-release configuration legitimately shows up. Said
      // plainly, and with no forward commitment attached to it.
      id: "pilot.preview_configuration",
      heading: "Pre-Release Configuration",
      body: "A pilot may run on pre-release or beta configuration that is not yet generally available. Seller identifies any such feature at kickoff or on request. Pre-release features may change, be reconfigured, or be withdrawn during the pilot term, may behave differently from the generally available platform, and carry no commitment that they will reach general release or appear in any later rollout. Where a pilot finding depends on a pre-release feature, the review record says so.",
      anchor: { after: "warranty_disclaimer" },
    },
    {
      // Anchored to electronic_signatures, NOT to auto_renewal_ca: an extra
      // anchored to an omitted clause falls to the end of the document, and this
      // is a term that belongs in front of the signature clauses, where the
      // omitted California clause used to sit.
      id: "pilot.no_automatic_conversion",
      heading: "No Automatic Conversion or Renewal",
      body: "The pilot ends when the pilot term ends. It does not renew, does not extend, and does not convert into a subscription, license, or any other ongoing service, and Seller charges nothing beyond the pilot fee unless Client signs a separate agreement for what comes next. This proposal is therefore not an automatic renewal offer or a continuous service offer within the meaning of Cal. Bus. & Prof. Code sec.17600-17606. If Client does not proceed, data is exported and deleted as stated under Client Data Ownership.",
      anchor: { before: "electronic_signatures" },
    },
    {
      // In front of Proposal Validity rather than inside it: that clause carries
      // the seller's validity period and must keep its interpolated value.
      id: "pilot.rollout_pricing",
      heading: "Pilot Pricing Is Not a Production Quote",
      body: "The pilot fee prices the pilot and nothing else. It sets no rate, discount, or unit price for a production rollout, for continued platform access, or for additional users, jobsites, or modules, and it is not a capped or most-favored price for later work. A rollout is quoted on its own scope, at the rates in effect when it is quoted, and takes a separately signed agreement.",
      anchor: { before: "proposal_validity" },
    },
  ],
};
