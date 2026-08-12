// Enterprise — the multi-site platform subscription bought by an organization
// with procurement, legal, a security reviewer, and an MSA.
//
// WHAT THIS TYPE CARRIES THAT `platform` DOES NOT
//   An ordinary Starter/Professional subscription is sold to an operator and
//   signed by an owner. This one is sold to an operator and signed after a
//   legal review, a security questionnaire, and a vendor-onboarding packet. The
//   apparatus that review expects lives here and nowhere else: an order of
//   precedence against a Master Services Agreement, an availability commitment
//   with service credits, a support matrix with severity levels, a security and
//   subprocessor disclosure, insurance certificates, affiliate and multi-site
//   licensing, true-up at renewal, assignment on change of control, publicity
//   consent, and transition assistance at term end.
//
// WHAT IT DELIBERATELY DOES NOT CARRY
//   No price, no seat or jobsite count, no payment terms, no liability cap, no
//   governing law, no validity window, no term dates. Those are per-deal
//   commercial choices the seller makes in the editor and the shared clauses
//   interpolate. A profile that hardcoded any of them would print a number the
//   seller never agreed to. The clauses here refer to "the included users and
//   jobsites shown in the schedule" instead.
//
//   The one exception is the SLA: an availability percentage and its credit
//   percentages are the substance of the commitment, not a per-deal price, and
//   a service level with blanks in it commits to nothing. The figures chosen
//   (99.5 percent monthly, 5/10/15 percent credits) are deliberately modest for
//   a company of this size, and a seller who has agreed to more generous
//   numbers on a specific deal must paper them in the MSA rather than by
//   editing this file.
//
// HONESTY CONSTRAINT
//   The security clause does not assert SOC 2, ISO 27001, or any other
//   attestation. Reliance may not hold one, and an enterprise buyer relies on
//   that assertion. It describes the program truthfully and offers whatever
//   reports exist on request, then says in terms that no particular
//   certification is represented. enterprise.test.ts enforces this.

import type { ProposalTypeProfile } from "./contract";

export const enterpriseProfile: ProposalTypeProfile = {
  key: "enterprise",

  lexicon: {
    documentTitle: "Enterprise Platform Subscription Proposal",
    engagementNoun: "this subscription",
    feesHeading: "Subscription Fees",
    scopeHeading: "Platform Scope & Implementation",
    termHeading: "Subscription Term",
    warrantySubject: "the platform and subscription services",
    unitNoun: "subscription year",
  },

  // The prose blocks in sections 01, 03, 04, 06 and 07. The shared copy they
  // replace was written for a pilot sold to a single operator and printed
  // unchanged here: section 01 announced "platform billing and related safety
  // technology support" on a document a legal team reads as an order form,
  // section 03 offered to scale "for a small pilot, a single jobsite, a
  // multi-site deployment, or a full enterprise platform rollout" on the type
  // that IS the enterprise rollout, and sections 04, 06 and 07 described an
  // account setup with no affiliates, no security review, and no sponsor.
  //
  // Same rule as the clauses: no counts, no durations, no rates, no dates, no
  // percentages. Included users and jobsites, the tier, the fee and the term are
  // fields the seller sets, and copy that restates one contradicts the schedule
  // printed beside it, so this points at the schedule instead. The availability
  // and credit percentages stay where they belong, in the Service Level
  // Commitment.
  //
  // The honesty constraint above governs this copy too. Section 04 promises
  // administrator enablement and reporting, not an attestation: nothing here
  // names a certification, because the security clause is careful not to claim
  // one and a deliverables bullet that did would undo it.
  copy: {
    subtitle: "Enterprise Safety Intelligence, Multi-Site Deployment, and Predictive Risk Platform Services",
    purposeCallout:
      "This document establishes the proposed subscription tier, fees, platform scope, implementation approach, deliverables, assumptions, and commercial terms for the enterprise platform subscription described below, and is intended to be executed as an Order Form under any Master Services Agreement in effect between the parties.",
    scopeIntro:
      "The scope is organized into the platform capabilities of the proposed tier and the implementation phases that put them in service across the legal entities, jobsites, and workforces the subscription covers. " +
      "Implementation sequencing, integration requirements, and the order in which affiliates and sites are brought onto the platform are confirmed with the client's project team after acceptance, and the tier and phases can be adjusted before signature.",
    // What an enterprise buyer receives from the subscription, pointed at the
    // schedule for every quantity: the affiliates and jobsites in scope, the
    // tier, and the included users are fields, not prose.
    deliverables: [
      "Configured platform subscription covering the affiliates and jobsites listed in the schedule",
      "User, jobsite, and permission structure built for the subscription tier shown in the schedule",
      "Implementation and integration plan covering data intake, configuration, and the systems in scope",
      "Administrator enablement for the client's designated platform administrators and support contacts",
      "Executive reporting configuration and the business review cadence stated in the terms",
    ],
    scheduleSteps: [
      "Acceptance, Order Form execution, and designation of the executive sponsor, administrators, and support contacts",
      "Discovery across the covered entities and jobsites, including data intake and integration requirements",
      "Platform configuration of modules, templates, workflows, user roles, and site hierarchy",
      "Administrator enablement and validation review with client leadership",
      "Phased go-live by site, launch support, and entry into the recurring business review cadence",
    ],
    clientResponsibilities: [
      "Designate an executive sponsor, authorized support contacts, and the platform administrators responsible for account administration at each covered entity.",
      "Complete the client's security, privacy, and legal review, including any vendor onboarding packet or security questionnaire, on a timeline that supports the implementation schedule in this proposal.",
      "Provide accurate entity, jobsite, user, and billing information for every affiliate and site covered by the subscription, together with the existing safety documents, templates, forms, and training records needed for configuration.",
      "Coordinate integration access with the client's IT organization, including credentials, network access, and identity and single sign-on configuration for the systems in scope.",
      "Retain responsibility for operational decisions, employee discipline, regulatory filings, and site execution at every jobsite, affiliate, and legal entity covered by this subscription.",
    ],
  },

  // Nothing is dropped. Every shared clause survives an enterprise legal review
  // on its own merits, and the ones that read as written for a smaller buyer
  // are reworded below rather than removed. A clause an enterprise reviewer
  // expects to find and does not is a redline; a clause that is merely
  // duplicative of the MSA costs nothing to leave standing.
  omitClauses: [],

  overrideClauses: {
    // The MSA question, answered where a reviewer looks for it. Adds the
    // precedence ladder and rejects purchase-order boilerplate; keeps the
    // shared clause's own sentence that an executed MSA is part of the
    // agreement rather than contradicting it.
    entire_agreement: {
      heading: "Entire Agreement & Order of Precedence",
      body:
        "This proposal, together with any executed Master Services Agreement, Statement of Work, and signed change orders, is the entire agreement and supersedes all prior negotiations and representations. " +
        "Where two of those documents conflict, the order of precedence is: first, a signed amendment or change order that identifies the provision it changes; second, the executed Master Services Agreement; third, this proposal and the schedule attached to it; fourth, any Seller documentation, policy, or product terms referenced here. " +
        "Client purchase orders, vendor portal terms, supplier codes, and preprinted purchasing conditions have no effect on the agreement even if the purchase order is acknowledged, referenced on an invoice, or paid. " +
        "No change is binding unless in a writing signed by both parties.",
    },

    // Enterprise change control: signed by authorized representatives, and
    // mid-term additions co-terminate with the current term instead of starting
    // their own clock. Keeps the shared 10-business-day pause right.
    scope_changes: {
      heading: "Change Control",
      body:
        "Any change to scope, sites, users, modules, or support requires a written change order signed by an authorized representative of each party. Verbal approvals, support tickets, and purchase orders are not change orders. " +
        "Users, jobsites, or modules added during a term are documented on a change order and, unless that change order states otherwise, co-terminate with the then-current subscription term and are invoiced prorated for the remainder of it. " +
        "Seller may pause the affected work if a scope dispute stays unresolved beyond 10 business days. " +
        "Where an executed Master Services Agreement prescribes its own change-control procedure, that procedure controls.",
    },

    // Adds the compelled-disclosure notice and the trade-secret tail an
    // enterprise reviewer expects, and preserves a separately signed NDA rather
    // than silently superseding it.
    confidentiality: {
      body:
        "Each party protects the other's confidential business, pricing, and operational information with reasonable care, and with no less care than it applies to its own confidential information of like importance; these obligations survive termination for 3 years, and for information that qualifies as a trade secret, for as long as it remains one under applicable law. " +
        "Client safety data, injury records, and incident reports are confidential and will not be shared with third parties without written authorization, except as required by law. " +
        "If disclosure is compelled by law or legal process, the receiving party gives prompt written notice where notice is not prohibited, so the disclosing party can seek protective treatment, and discloses only the portion legally required. " +
        "A non-disclosure agreement separately executed between the parties remains in effect for its own term and controls where its protections are broader.",
    },

    // Enterprise incident handling: the 72-hour notice stays, plus a written
    // incident summary, cooperation with Client's own notification duties, and
    // no public statement naming Client without consent.
    breach_notification: {
      body:
        "If a security breach affecting client personal information is confirmed, Seller will notify Client within 72 hours and cooperate to satisfy applicable state breach-notification laws. " +
        "Within 10 business days of confirming the breach, Seller provides a written summary of what occurred, the categories of data involved, the affected users and jobsites, and the remediation and preventive steps taken, and supplements it as the investigation develops. " +
        "Seller cooperates with Client's own notification obligations to regulators, employees, and insurers, and does not issue a public statement identifying Client without Client's prior written consent unless required by law.",
    },

    // Carves the service level commitment out of the AS IS disclaimer so the
    // two clauses do not cancel each other, and adds a workmanlike-performance
    // warranty whose remedy is re-performance.
    warranty_disclaimer: {
      body:
        "EXCEPT FOR THE SERVICE LEVEL COMMITMENT AND THE PERFORMANCE WARRANTY STATED IN THESE TERMS, THE PLATFORM AND SUBSCRIPTION SERVICES ARE PROVIDED AS IS AND AS AVAILABLE, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. " +
        "Seller warrants that the implementation and support services will be performed in a professional and workmanlike manner by personnel qualified to perform them; Client's remedy for a breach of that warranty, if raised in writing within 30 days of the affected work, is re-performance of that work. " +
        "Seller does not warrant that the platform will be error-free or uninterrupted, that it will operate with third-party systems Seller did not supply, or that all safety risks will be identified or prevented.",
    },

    // Multi-site version: the Competent Person duty attaches at every covered
    // jobsite and affiliate, and predictive output is named as an input to
    // Client's program rather than a substitute for it.
    osha_disclaimer: {
      body:
        "This platform is a safety management support tool, not legal advice, engineering services, or certified compliance review. OSHA compliance (29 U.S.C. sec.651 et seq.) and site-specific requirements remain the Client's responsibility at every jobsite, affiliate, and legal entity covered by this subscription, and the Client's designated Competent Person at each site retains all field safety decisions. " +
        "Predictive risk scores, alerts, and AI-supported recommendations are inputs to Client's safety program. They do not replace inspection, training, hazard analysis, or the judgment of qualified personnel, and Client does not rely on them as the sole basis for a safety decision.",
    },

    // The IP indemnity an enterprise reviewer redlines for if it is missing:
    // Seller's remedies on an infringement finding, the standard exclusions,
    // and an exclusive-remedy statement.
    indemnification: {
      body:
        "Client indemnifies Seller against third-party claims arising from Client's misuse of the platform, violation of law, inaccurate data, or jobsite conditions. " +
        "Seller indemnifies Client against claims that the platform as provided infringes a valid U.S. patent, copyright, or trade secret, provided Seller is promptly notified, controls the defense and settlement, and Client cooperates at Seller's expense. " +
        "If the platform is held to infringe, or Seller reasonably believes it may, Seller may at its option procure the right for Client to continue using it, modify or replace it with a functionally equivalent version, or terminate the affected subscription and refund prepaid fees for the unused portion of the term. " +
        "Seller's indemnity does not cover claims arising from Client data, Client-directed configuration, modifications not made by Seller, or use of the platform in combination with items Seller did not supply where the claim would have been avoided without that combination. " +
        "This provision states each party's entire obligation and exclusive remedy for third-party intellectual property claims.",
    },

    // Adds the executive escalation step before either party files, and yields
    // to the MSA's procedure where one exists. Venue language is unchanged.
    dispute_resolution: {
      heading: "Dispute Resolution & Escalation",
      body:
        "Before either party initiates a proceeding, the dispute is escalated in writing to a senior executive of each organization, and those executives confer within 15 business days of the escalation notice. " +
        "Disputes not resolved by good-faith negotiation within 30 days go to binding arbitration under the AAA Commercial Arbitration Rules, held in Wisconsin unless otherwise agreed. Both parties waive jury trial and class actions. " +
        "Emergency relief to protect trade secrets or confidential information may be sought in any court of competent jurisdiction. " +
        "Where an executed Master Services Agreement states its own dispute-resolution procedure, that procedure controls.",
    },

    // Procurement handles exemption certificates and expects fees to be stated
    // exclusive of tax; Seller's income taxes are carved out.
    taxes: {
      body:
        "Fees stated in the schedule are exclusive of taxes. Client is responsible for applicable taxes on the services, including sales and use tax on SaaS and digital services (e.g., Wis. Stat. sec.77.52; certain California SaaS transactions), other than taxes measured by Seller's income. " +
        "Where Client claims an exemption, Client provides a valid exemption certificate before the affected invoice is issued and remains responsible for any tax later assessed if the exemption is not honored. " +
        "Where applicable, Seller will collect and remit required taxes or provide a tax invoice for Client remittance.",
    },

    // Cure period, the refund direction on Seller's own breach, and a suspension
    // right bounded by notice. Payment timing stays in Payment Terms.
    termination: {
      body:
        "Either party may terminate for material breach on 30 days' written notice if the breach is not cured within that period. Termination for convenience, where available, is governed by the executed Master Services Agreement or the final executed agreement. " +
        "Client remains responsible for fees earned through the termination date, plus approved expenses and non-cancelable third-party commitments. Where Client terminates for Seller's uncured material breach, Seller refunds prepaid fees for the unused portion of the then-current term. " +
        "Seller may suspend access to address a security threat, a threat to platform availability, or non-payment that remains uncured after written notice, and restores access once the cause is resolved. " +
        "Confidentiality, intellectual property, dispute-resolution, and data-privacy terms survive termination, together with the data export and transition provisions.",
    },
  },

  extraClauses: [
    {
      id: "enterprise.order_form",
      heading: "Master Services Agreement & Order Form",
      anchor: { position: "start" },
      body:
        "This proposal is intended to be executed as an Order Form. If a Master Services Agreement between the parties is in effect on the date this proposal is signed, this proposal is an Order Form issued under that agreement, is incorporated into it, and is subject to its terms. " +
        "If no Master Services Agreement is in effect, the terms in this proposal govern the subscription until one is executed. On execution of a Master Services Agreement that references this subscription, that agreement governs the remainder of the term from its effective date forward, the commercial terms in the schedule below remain as stated, and neither party re-prices the subscription because of the change. " +
        "Each party signs through a representative authorized to bind it. A Client purchase order may be referenced on invoices for Client's internal processing.",
    },

    {
      id: "enterprise.affiliate_use",
      heading: "Affiliates, Sites & Named Users",
      anchor: { after: "scope_changes" },
      body:
        "The subscription is licensed to Client and to the legal entities under Client's control that are identified in the schedule, for use at the jobsites covered by the subscription and within the included users and jobsites shown in the schedule. " +
        "User accounts are assigned to named individuals rather than shared or used concurrently by more than one person, and an account may be reassigned when the named individual leaves the role. " +
        "An affiliate is added by written change order naming the entity and its sites, and that affiliate's usage counts against the included users and jobsites shown in the schedule. Client is responsible for each affiliate's compliance with these terms, and a claim arising from an affiliate's use is brought by Client on the affiliate's behalf. " +
        "Contractors and subcontractors working at a covered jobsite may be granted access where the access serves Client's own safety program, and Client remains responsible for that use.",
    },

    {
      id: "enterprise.service_levels",
      heading: "Service Level Commitment",
      anchor: { after: "scope_changes" },
      body:
        "Seller commits to make the platform available at least 99.5 percent of the time in each calendar month, measured as the total minutes in the month less excluded minutes and less minutes of unavailability, divided by the total minutes in the month less excluded minutes. " +
        "Unavailability means the platform is not accessible to Client's users for reasons within Seller's control, as recorded by Seller's monitoring. " +
        "Excluded from the measurement are: scheduled maintenance announced at least 5 business days in advance and performed outside 6:00 a.m. to 6:00 p.m. Central Time on business days where practicable; emergency maintenance or security patching, which Seller announces as soon as it reasonably can; force majeure events; Client's own network, equipment, or credentials; third-party systems and integrations Seller did not supply; suspension permitted under these terms; and features identified in writing as beta or preview. " +
        "If measured availability in a month falls below 99.5 percent but is at least 99.0 percent, Client is entitled to a credit of 5 percent of the monthly portion of the subscription fee for that month. Below 99.0 percent but at least 98.0 percent, the credit is 10 percent. Below 98.0 percent, the credit is 15 percent. Credits are not cumulative across tiers and do not exceed 15 percent of the monthly portion of the subscription fee for the affected month. " +
        "To claim a credit, Client submits a written request to its Seller support contact within 30 days after the end of the affected month, identifying the dates and approximate times of unavailability. Approved credits are applied against the next invoice issued, or against the renewal invoice where no further invoice is scheduled, and are not paid in cash. " +
        "Service credits are Client's sole and exclusive remedy for a failure to meet this availability commitment, except that if measured availability falls below 99.0 percent in any three months within a rolling twelve-month period, Client may terminate the subscription for cause by written notice given within 30 days after the third such month and receive a refund of prepaid fees for the unused portion of the term.",
    },

    {
      id: "enterprise.support",
      heading: "Support, Escalation & Business Reviews",
      anchor: { after: "scope_changes" },
      body:
        "Client designates its authorized support contacts and an executive sponsor in writing, and Seller designates a named account contact and a support escalation contact. Either party may change its designations on written notice. " +
        "Support requests are classified by severity. Severity 1 means the platform is unavailable or a core workflow is blocked for the users at a covered jobsite with no available workaround; the target response time is 2 business hours, and Seller works the issue continuously during support hours until a workaround or resolution is in place. " +
        "Severity 2 means a significant function is impaired or degraded while a workaround exists; the target response time is 1 business day. Severity 3 covers routine questions, minor defects, and configuration requests; the target response time is 3 business days. " +
        "Response times are targets for acknowledgment by a person able to work the issue, not commitments to resolve within that period, and are measured during Seller's published support hours on business days. " +
        "Unresolved issues escalate from the Seller account contact to the Seller support escalation contact, and then to Seller's executive sponsor, at each step on Client's written request. " +
        "Seller and Client hold a business review each quarter covering adoption, open issues, incident and availability history, and planned platform changes, and a review before each renewal covering usage against the included users and jobsites shown in the schedule.",
    },

    {
      id: "enterprise.security_program",
      heading: "Information Security Program",
      anchor: { after: "breach_notification" },
      body:
        "Seller maintains a written information security program with administrative, technical, and physical safeguards appropriate to the size of Seller's organization and the sensitivity of the data it processes. The program includes role-based access control, separation of each client's data from every other client's, encryption of data in transit and at rest, logging of administrative access, personnel background screening and security awareness training, vulnerability management, and a documented incident response procedure. " +
        "On reasonable written notice, and no more than once in any 12-month period unless a confirmed security incident has occurred, Seller will complete Client's standard security questionnaire and provide the then-current summaries of its security practices, penetration-test or vulnerability-assessment summaries, and any third-party audit reports or certifications Seller then holds. Materials provided under this provision are Seller's confidential information. " +
        "Seller does not represent that it holds any particular certification, attestation, or audit report except where Seller confirms it in writing. Where Client requires a specific certification, that requirement is agreed in writing between the parties before Client relies on it. " +
        "Client is responsible for its own account administration, including issuing and removing user accounts promptly when personnel change roles or leave.",
    },

    {
      id: "enterprise.subprocessors",
      heading: "Subprocessors & Data Location",
      anchor: { after: "breach_notification" },
      body:
        "Seller uses subprocessors, including cloud hosting, communications, and AI model providers, to deliver the platform. A current list of the subprocessors that process Client data is provided on written request. " +
        "Seller gives at least 30 days' written notice before adding a subprocessor that will process Client data. Client may object on reasonable security or privacy grounds within 15 days of the notice; if the objection cannot be resolved, Client may terminate the affected services without penalty and receive a refund of prepaid fees for the unused portion of the term. Seller remains responsible for its subprocessors' performance under these terms. " +
        "Client data is hosted in data centers located in the United States. Seller gives at least 30 days' written notice before relocating Client data to a hosting region outside the United States, and Client may terminate the affected services if it does not accept the relocation. " +
        "A Data Processing Addendum is available on request and, once executed, governs the processing of personal information.",
    },

    {
      id: "enterprise.transition_assistance",
      heading: "Data Export & Transition Assistance",
      anchor: { after: "client_data_ownership" },
      body:
        "Client Data Ownership above states Client's ownership of its data and Seller's export and deletion obligations at termination. This provision adds what an exit at this scale requires. " +
        "Throughout the term, Client may export its own records from the platform in a standard exportable format without asking Seller to run the export. " +
        "On written request made before the term ends, Seller extends the post-termination export window to 60 days. After the export window closes, Seller deletes Client data from active systems and confirms the deletion in writing on request; backup copies age out on Seller's standard backup cycle and remain subject to the confidentiality terms until they do. " +
        "Transition assistance beyond export, including data mapping, migration support to a successor system, and extended read-only access, is available as professional services under a written statement of work at Seller's then-current rates. " +
        "Seller does not withhold Client data as leverage in a fee dispute; amounts not in dispute remain payable on their normal schedule.",
    },

    {
      id: "enterprise.insurance",
      heading: "Insurance",
      anchor: { after: "indemnification" },
      body:
        "Seller maintains commercial insurance appropriate to the services, including commercial general liability, professional liability (errors and omissions) covering technology services, cyber liability, and workers' compensation where required by law, placed with carriers holding a current rating from a recognized insurance rating agency. " +
        "Certificates of insurance are provided on written request. Where Client's vendor requirements call for additional insured status, a waiver of subrogation, or specific coverage limits, those requirements are agreed in the executed Master Services Agreement or by written endorsement request, and Seller confirms in writing before Client relies on them. " +
        "This proposal states no coverage limit. Seller notifies Client if a policy relied on for the services is cancelled and not replaced.",
    },

    {
      id: "enterprise.renewal_true_up",
      heading: "Renewal, True-Up & Fee Changes",
      anchor: { after: "auto_renewal_ca" },
      body:
        "The subscription renews for successive terms of the same length unless either party gives written notice of non-renewal at least 30 days before the end of the then-current term. " +
        "Seller quotes renewal fees in writing at least 60 days before the renewal date. If Client does not accept the quoted fees, Client may decline renewal by written notice before the renewal date, and the subscription ends at the end of the then-current term. " +
        "Before each renewal, Seller reviews actual usage against the included users and jobsites shown in the schedule. Where actual usage exceeds them, the renewal quantities and fees are adjusted to match actual usage; where it is lower, Client may request a corresponding reduction in the renewal quantities. Usage added during a term is handled by change order rather than deferred to renewal. " +
        "For California clients, the notice and cancellation rights stated in the California Auto-Renewal Law provision above control over this provision to the extent of any conflict.",
    },

    {
      id: "enterprise.assignment",
      heading: "Assignment & Change of Control",
      anchor: { after: "non_solicitation" },
      body:
        "Neither party may assign the agreement, in whole or in part, without the other party's written consent, which will not be unreasonably withheld or delayed. " +
        "Either party may assign to a successor in a merger, acquisition, reorganization, or sale of substantially all of its assets on written notice, provided the successor assumes all obligations in writing. " +
        "If Client acquires or is acquired by an organization whose personnel or jobsites would push usage past the included users and jobsites shown in the schedule, the parties document the added scope by change order before the added entity's users are onboarded. " +
        "Seller may not transfer Client data, or the right to process it, separately from the agreement. Any attempted assignment contrary to this provision is void.",
    },

    {
      id: "enterprise.publicity",
      heading: "Publicity & Reference Use",
      anchor: { before: "severability" },
      body:
        "Neither party uses the other's name, logo, or marks in a press release, case study, customer list, website, social media, or marketing material without the other party's prior written consent. Consent may be given by email from an authorized representative, applies only to the use described, and may be withdrawn on 30 days' written notice as to future use. " +
        "Reference calls, site visits by prospective clients, and any published use of Client's incident, injury, or performance data each require separate written consent, and such data is aggregated and de-identified unless Client agrees otherwise in writing. " +
        "This provision does not prevent either party from identifying the other in a confidential disclosure to a regulator, auditor, insurer, lender, or prospective acquirer.",
    },
  ],
};
