// The clause set every proposal type starts from.
//
// Lifted VERBATIM out of buildDocumentTerms() in proposal-document-model.ts and
// given stable ids. Verbatim matters: these are the terms already sitting on
// every proposal this company has sent, and this refactor's job is to let types
// DIVERGE where they should — not to quietly reword the base set for everyone.
// shared-clauses.test.ts pins the text against the original implementation.
//
// Interpolated values (payment terms, late fee, liability cap, governing law,
// validity days, AI/data and IP wording) still come from the seller's own
// fields, exactly as before. A profile never sets those — they are commercial
// choices made per deal in the editor, not per template.

import type { DocumentTermInputs } from "@/components/proposals/proposal-document-model";
import type { SharedClauseId } from "./contract";

export interface SharedClause {
  id: SharedClauseId;
  heading: string;
  body: string;
}

export function buildSharedClauses(input: DocumentTermInputs): SharedClause[] {
  return [
    {
      id: "payment_terms",
      heading: "Payment Terms",
      body:
        `${input.paymentTerms}. ${input.lateFee}. Returned checks or failed ACH payments incur a $50 fee. ` +
        "Billing disputes must be raised within 10 business days of the invoice.",
    },
    {
      id: "scope_changes",
      heading: "Scope Changes",
      body: "Any change to scope, sites, users, modules, or support requires a written change order signed by both parties. Verbal approvals are not binding. Seller may pause work if a scope dispute stays unresolved beyond 10 business days.",
    },
    {
      id: "confidentiality",
      heading: "Confidentiality",
      body: "Each party protects the other's confidential business, pricing, and operational information with reasonable care; these obligations survive termination for 3 years. Client safety data, injury records, and incident reports are confidential and will not be shared with third parties without written authorization, except as required by law.",
    },
    {
      id: "privacy_ccpa",
      heading: "Data Privacy — CCPA/CPRA (California)",
      body: "For California clients, Seller acts as a Service Provider under the CCPA/CPRA (Cal. Civ. Code sec.1798.100 et seq.). Client data is not sold, shared for cross-context advertising, or used outside the scope of services without written authorization. A Data Processing Addendum (DPA) is available on request.",
    },
    {
      id: "privacy_multistate",
      heading: "Data Privacy — Multi-State",
      body: "Seller follows applicable U.S. state privacy laws where services are delivered, including Wisconsin (Wis. Stat. sec.134.98), California, Virginia, Colorado, Connecticut, and Texas. Sensitive personal information is not retained beyond what the contracted services require.",
    },
    {
      id: "breach_notification",
      heading: "Data Breach Notification",
      body: "If a security breach affecting client personal information is confirmed, Seller will notify Client within 72 hours and cooperate to satisfy applicable state breach-notification laws.",
    },
    { id: "data_ai_use", heading: "Data and AI Use", body: input.aiData },
    { id: "intellectual_property", heading: "Intellectual Property", body: input.ipRights },
    {
      id: "trade_secrets",
      heading: "Trade Secrets — Wisconsin & Federal",
      body: "Seller's platform, predictive risk logic, AI workflows, scoring models, and templates are protected trade secrets under the Wisconsin Uniform Trade Secrets Act (Wis. Stat. sec.134.90) and the federal Defend Trade Secrets Act (18 U.S.C. sec.1836). Client shall not reverse engineer, copy, or derive Seller's source code or proprietary workflows. Unauthorized disclosure may result in injunctive relief and damages.",
    },
    {
      id: "client_data_ownership",
      heading: "Client Data Ownership",
      body: "Client owns all client-provided data, including safety records, personnel information, incident data, and site content. Seller processes it only to deliver contracted services. On termination, Seller provides the data in a standard exportable format within 30 days, then securely deletes it from active systems.",
    },
    {
      id: "limitation_of_liability",
      heading: "Limitation of Liability",
      body:
        `TO THE MAXIMUM EXTENT PERMITTED BY LAW, SELLER'S TOTAL LIABILITY IS LIMITED TO ${input.liabilityCap}, ` +
        "AND SELLER IS NOT LIABLE FOR INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR PUNITIVE DAMAGES, INCLUDING " +
        "LOST PROFITS OR BUSINESS INTERRUPTION. Where a state does not allow these exclusions, they apply to the " +
        "fullest extent permitted.",
    },
    {
      id: "warranty_disclaimer",
      heading: "Warranty Disclaimer",
      body: "THE PLATFORM AND SERVICES ARE PROVIDED AS IS AND AS AVAILABLE, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. Seller does not warrant the platform will be error-free or that all safety risks will be identified or prevented.",
    },
    {
      id: "no_guarantee",
      heading: "No Guarantee of Outcome",
      body: "The platform supports safety management, reporting, and risk visibility. It does not guarantee elimination of incidents, injuries, OSHA violations, or losses. Client retains full responsibility for jobsite safety and compliance with 29 C.F.R. Parts 1903, 1904, 1910, and 1926.",
    },
    {
      id: "osha_disclaimer",
      heading: "OSHA Compliance Disclaimer",
      body: "This platform is a safety management support tool, not legal advice, engineering services, or certified compliance review. OSHA compliance (29 U.S.C. sec.651 et seq.) and site-specific requirements remain the Client's responsibility, and the Client's designated Competent Person retains all field safety decisions.",
    },
    {
      id: "indemnification",
      heading: "Indemnification",
      body: "Client indemnifies Seller against third-party claims arising from Client's misuse of the platform, violation of law, inaccurate data, or jobsite conditions. Seller indemnifies Client against claims that the platform as provided infringes a valid U.S. patent, copyright, or trade secret, provided Seller is promptly notified and controls the defense.",
    },
    {
      id: "dispute_resolution",
      heading: "Dispute Resolution & Arbitration",
      body: "Disputes not resolved by good-faith negotiation within 30 days go to binding arbitration under the AAA Commercial Arbitration Rules, held in Wisconsin unless otherwise agreed. Both parties waive jury trial and class actions. Emergency relief to protect trade secrets or confidential information may be sought in any court of competent jurisdiction.",
    },
    {
      id: "auto_renewal_ca",
      heading: "California Auto-Renewal Law",
      body: "For California clients: if the term auto-renews, Seller gives clear notice before charging, notifies of any material change at least 30 days in advance, and allows cancellation of auto-renewal by written notice at any time (Cal. Bus. & Prof. Code sec.17600-17606).",
    },
    {
      id: "electronic_signatures",
      heading: "Electronic Signatures (E-SIGN / UETA)",
      body: "Electronic signatures on this proposal and related agreements are legally binding under the federal E-SIGN Act (15 U.S.C. sec.7001 et seq.) and UETA. Client consents to receive disclosures and notices electronically.",
    },
    {
      id: "taxes",
      heading: "Taxes & SaaS Fees",
      body: "Client is responsible for applicable taxes on the services, including sales and use tax on SaaS and digital services (e.g., Wis. Stat. sec.77.52; certain California SaaS transactions). Where applicable, Seller will collect and remit required taxes or provide a tax invoice for Client remittance.",
    },
    {
      id: "independent_contractor",
      heading: "Independent Contractor",
      body: "Seller acts as an independent contractor. This proposal creates no employment, partnership, joint venture, or agency relationship, and Seller does not direct or control Client personnel or daily jobsite operations unless separately agreed in writing.",
    },
    {
      id: "force_majeure",
      heading: "Force Majeure",
      body: "Neither party is liable for delays caused by events beyond its reasonable control (natural disasters, government actions, cyberattacks, outages, or pandemic conditions). The affected party will notify the other promptly and use reasonable efforts to resume performance. If the event continues beyond 60 days, either party may terminate the affected services without penalty.",
    },
    {
      id: "governing_law",
      heading: "Governing Law & Venue",
      body:
        `This proposal is governed by the laws of ${input.governingLaw}, without regard to conflict-of-law ` +
        "principles, unless replaced by a signed master services agreement. California clients: Cal. Bus. & Prof. " +
        "Code sec.17200 applies. Wisconsin clients: Wis. Stat. Ch. 134 and Ch. 895 govern commercial and " +
        "trade-secret matters.",
    },
    {
      id: "non_solicitation",
      heading: "Non-Solicitation",
      body: "During the term and for 12 months after, neither party will solicit or hire the other's employees or key contractors directly involved in these services without written consent. General public job postings are excluded.",
    },
    {
      id: "severability",
      heading: "Severability",
      body: "If any provision is found invalid or unenforceable, it will be narrowed to the minimum extent needed to be enforceable, and the remaining provisions stay in full force and effect.",
    },
    {
      id: "entire_agreement",
      heading: "Entire Agreement",
      body: "This proposal, together with any executed Master Services Agreement, Statement of Work, and signed change orders, is the entire agreement and supersedes all prior negotiations and representations. No change is binding unless in a writing signed by both parties.",
    },
    {
      id: "termination",
      heading: "Termination",
      body: "Either party may terminate per the final executed agreement. Client remains responsible for fees earned through the termination date, plus approved expenses and non-cancelable third-party commitments. Confidentiality, IP, dispute-resolution, and data-privacy terms survive termination.",
    },
    {
      id: "proposal_validity",
      heading: "Proposal Validity",
      body: `Pricing and terms remain open for ${input.validDays} calendar days from the proposal date unless withdrawn or extended in writing. After that, Seller may revise pricing.`,
    },
  ];
}
