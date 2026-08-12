// The Safety Advisory Retainer profile.
//
// WHAT THIS TYPE SELLS
//   An ongoing monthly advisory relationship: a safety professional available to
//   Client for guidance, document review, regulatory questions, and support, at
//   the monthly commitment shown in the schedule. transaction-templates.ts sets
//   packageKey "none" and billingTerm "Monthly" for this type, so NO platform
//   subscription is being sold and no clause here may imply one. Discrete project
//   work (a program build, an audit campaign, training delivery) is quoted
//   separately, exactly as the template's customExclusions already promises.
//
// WHERE RETAINERS ACTUALLY GO WRONG
//   Not in the fee. In the three questions the parties never wrote down:
//     1. Does unused time roll over? An ambiguous answer here is the single most
//        common retainer dispute, so retainer.included_capacity takes a hard
//        position - a one-month carry capped at a quarter of a month's time,
//        consumed last, expiring on termination, never refundable.
//     2. What counts as "urgent", and is Seller on call? A small firm that
//        implies round-the-clock coverage has sold something it cannot staff, so
//        retainer.response_times commits to business-hours windows and says
//        plainly that after-hours incident response is a separate engagement.
//     3. Has Client quietly outsourced its OSHA duties by hiring an advisor?
//        It has not, and retainer.not_competent_person says so in its own
//        section rather than as a subordinate clause someone can skim past.
//
// COMMERCIAL VALUES LIVE IN THE SCHEDULE, NOT HERE
//   No clause below states a fee, an hour count, a rate, a liability cap, a
//   payment term or a date. Those are per-deal fields the seller sets in the
//   editor. Clauses point at "the monthly commitment shown in the schedule" and
//   "the hourly rates shown in the schedule" instead. Procedural periods (a
//   30-day notice, a one-month carry window) are drafting choices, not prices,
//   and are stated outright so neither party has to negotiate them per deal.

import type { ProposalTypeProfile } from "./contract";

export const retainerProfile: ProposalTypeProfile = {
  key: "retainer",

  lexicon: {
    // Matches definitions.retainer.documentLabel so the cover and the terms
    // call the same thing by the same name.
    documentTitle: "Safety Advisory Retainer",
    engagementNoun: "the retainer",
    feesHeading: "Retainer & Rates",
    scopeHeading: "Recurring Advisory Scope",
    termHeading: "Retainer Term",
    // Never "the platform and services": this type sells no platform.
    warrantySubject: "the advisory services",
    // A retainer is bought by the month, not by the seat or the session.
    unitNoun: "month",
  },

  omitClauses: [
    // Hosted-data custody term: it promises export "in a standard exportable
    // format" and deletion "from active systems", which presumes Seller holds
    // Client's records in Seller's platform. This type sells no platform.
    // retainer.records_and_access replaces it with the custody, retention and
    // term-end access rules that actually fit an advisory file, and
    // Confidentiality (required, untouched) still protects the data itself.
    "client_data_ownership",
  ],

  overrideClauses: {
    // Shared text governs "scope, sites, users, modules, or support" - three of
    // those five nouns are subscription counters that do not exist here.
    scope_changes: {
      body: "Any change to the recurring advisory scope, the monthly commitment, the assigned advisor's allocation, or the reporting cadence requires a written change order signed by both parties. Verbal approvals are not binding. Requests that fall outside the recurring scope are handled as project work under the project work section rather than absorbed into the retainer. Seller may pause advisory work if a scope dispute stays unresolved beyond 10 business days.",
    },

    // Same statutes, correct subject matter: what a retainer client is actually
    // exposed to is Seller's method, not Seller's source code.
    trade_secrets: {
      body: "Seller's advisory methodologies, risk assessment frameworks, scoring logic, review checklists, and document templates are protected trade secrets under the Wisconsin Uniform Trade Secrets Act (Wis. Stat. sec.134.90) and the federal Defend Trade Secrets Act (18 U.S.C. sec.1836). Materials Seller provides during the retainer are for Client's internal safety use and shall not be resold, distributed outside Client's organization, or used to develop a competing advisory service. Unauthorized disclosure may result in injunctive relief and damages.",
    },

    // REQUIRED clause, reworded not dropped. "AS AVAILABLE" and "error-free"
    // are uptime concepts; a consulting engagement disclaims against the
    // professional standard of care instead, which is the enforceable posture.
    warranty_disclaimer: {
      body: "THE ADVISORY SERVICES ARE PROVIDED AS IS, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. Seller warrants only that the advisory services will be performed in a professional and workmanlike manner consistent with the standard of care of safety consultants performing comparable work in comparable conditions. Seller does not warrant that every hazard, deficiency, or regulatory exposure will be identified.",
    },

    no_guarantee: {
      body: "Advisory support informs Client's safety decisions. It does not guarantee elimination of incidents, injuries, OSHA citations, or losses, and nothing in this proposal is a representation about the outcome of an inspection, audit, or enforcement action. Client retains full responsibility for jobsite safety and compliance with 29 C.F.R. Parts 1903, 1904, 1910, and 1926.",
    },

    // REQUIRED clause. This is where "advisory does not replace Client's own
    // program" and "Client's duties are non-delegable" live, so that
    // retainer.not_competent_person can stay narrowly about designation and the
    // document states each idea once.
    osha_disclaimer: {
      body: "Advisory support under this retainer is a safety management support service, not legal advice, engineering services, or certified compliance review. It supplements Client's safety program and does not replace it: Client remains responsible for maintaining its own written programs, training, recordkeeping, inspections, and corrective action. Duties imposed on Client as an employer under the Occupational Safety and Health Act (29 U.S.C. sec.651 et seq.) and applicable state law are non-delegable, and no advice, review, or recommendation Seller provides transfers those duties to Seller. Client decides whether and how to act on Seller's recommendations, and field safety decisions remain with Client's designated personnel.",
    },

    // REQUIRED clause. Client's indemnity has to reach Client's operations and
    // its implementation decisions, not "misuse of the platform"; Seller's IP
    // indemnity narrows from a shipped product to the written work it delivers.
    indemnification: {
      body: "Client indemnifies Seller against third-party claims arising from Client's operations, jobsite conditions, employment decisions, violation of law, inaccurate or incomplete information provided to Seller, or Client's decision whether to implement a recommendation. Seller indemnifies Client against claims that written materials Seller prepares and delivers under this retainer infringe a valid U.S. patent, copyright, or trade secret, provided Seller is promptly notified and controls the defense.",
    },

    // KEPT, not omitted, and this is the one type where that is the right call.
    // A retainer that continues month to month until someone gives notice IS an
    // automatic renewal in substance, so the notice-before-charging and
    // cancel-at-any-time commitments are load-bearing here rather than
    // vestigial SaaS boilerplate. Reworded off "the term" of a subscription and
    // onto the monthly commitment, with the California statute kept as the
    // floor it actually is.
    auto_renewal_ca: {
      heading: "Automatic Renewal Notice",
      body: "This retainer continues from month to month after its initial term until ended under the notice provisions of this proposal, which is an automatic renewal. Seller gives written notice before any change to the monthly commitment or to the rates shown in the schedule takes effect, and gives at least 30 days' advance notice of a material change to the recurring terms. Client may cancel automatic renewal by written notice at any time, effective at the end of the applicable notice period. For California clients, Seller follows the disclosure and cancellation requirements of Cal. Bus. & Prof. Code sec.17600-17606 where they apply.",
    },

    // "Taxes & SaaS Fees" prints a product line this type does not sell.
    // Professional services are taxed differently and often not at all; the
    // clause now allocates the risk without asserting a category.
    taxes: {
      heading: "Taxes",
      body: "Fees stated in the schedule are exclusive of taxes. Client is responsible for any sales, use, or service taxes applicable to professional advisory services in the jurisdictions where they are delivered (e.g., Wis. Stat. sec.77.52). Where applicable, Seller will collect and remit required taxes or provide a tax invoice for Client remittance. Client is responsible for the accuracy of any exemption certificate it claims.",
    },
  },

  extraClauses: [
    /* ---------------------------------------------------------------------- */
    /* What the money buys, and what happens at the edges of it.              */
    /* ---------------------------------------------------------------------- */
    {
      id: "retainer.included_capacity",
      heading: "Included Advisory Capacity",
      anchor: { after: "payment_terms" },
      body: "The monthly commitment shown in the schedule covers the recurring advisory services listed there and the included advisory time stated with them: availability for safety questions as they arise, review of documents and safety reporting Client submits, and the recurring summary at the cadence shown. Advisory time is measured in quarter-hour increments against the month in which the work is performed, and Seller reports consumption with each invoice. Unused advisory time carries forward into the immediately following month only, up to 25 percent of one month's included time; time carried forward and not used in that month expires. Time already carried forward does not carry a second time. Each month's own included time is consumed before any carried-forward balance. Unused time is not refundable, is not creditable against project fees or any other invoice, and any unused or carried balance expires on the effective date of termination or non-renewal.",
    },
    {
      id: "retainer.capacity_overage",
      heading: "Capacity Overage",
      anchor: { after: "payment_terms" },
      body: "When Client's requests in a month exceed the included advisory time, Seller notifies Client before continuing and either bills the excess at the hourly rates shown in the schedule or, where the pattern is expected to continue, proposes a written uplift to the monthly commitment. Seller does not bill overage it did not flag in advance. Overage in one month does not by itself change the monthly commitment for later months, and an uplift takes effect only on the date both parties sign it. Where Client declines both the overage and the uplift, Seller defers the excess work to the following month's capacity.",
    },
    {
      id: "retainer.response_times",
      heading: "Availability and Response Times",
      anchor: { after: "payment_terms" },
      body: "Advisory requests are received by email or by the contact method identified at kickoff, during Seller's normal business hours, Monday through Friday, excluding recognized holidays. Seller acknowledges routine requests within one business day and provides a substantive response within three business days, or states a longer timeline where the request requires research, document review, or coordination with a third party. A request is urgent when it concerns an active injury, a regulatory inspection or citation in progress, a work stoppage, or an imminent hazard: Seller responds to urgent requests within four business hours of receipt during business hours, and otherwise on the next business morning. This retainer does not provide around-the-clock coverage and does not place Seller on call outside business hours. After-hours and emergency incident response is a separate engagement.",
    },

    /* ---------------------------------------------------------------------- */
    /* The boundary that keeps a retainer from silently becoming a project.   */
    /* ---------------------------------------------------------------------- */
    {
      id: "retainer.project_work_boundary",
      heading: "Project Work Quoted Separately",
      anchor: { after: "scope_changes" },
      body: "The retainer covers recurring advisory support. Project work is quoted separately and does not draw on the monthly commitment. A request is project work when it produces a defined deliverable or campaign rather than advice on an existing one, including building or rewriting a written safety program, a site audit or audit campaign, incident investigation or regulatory response support, training delivery, on-site presence beyond an agreed advisory visit, expert or litigation support, and any request requiring a sustained block of dedicated time rather than a discrete answer. Seller identifies project work when the request is made and provides a written quote; project work begins only after Client accepts that quote in writing. Advisory time spent scoping a potential project counts against the included advisory time and is not separately billed.",
    },

    /* ---------------------------------------------------------------------- */
    /* Custody of the file, replacing the omitted hosted-data clause.         */
    /* ---------------------------------------------------------------------- */
    {
      id: "retainer.records_and_access",
      heading: "Engagement Records and Access",
      // Sits where client_data_ownership sat, between the trade-secret and
      // liability clauses, so the reading order of the document is unchanged.
      anchor: { after: "trade_secrets" },
      body: "Client owns the documents, safety records, and operational information it provides to Seller, and Seller uses them only to deliver the retainer. Written advisory output Seller issues during the term, including memoranda, document reviews, and recurring summaries, is delivered for Client's internal safety use, subject to the Intellectual Property section. Seller maintains its own working papers and correspondence as professional records and may retain them after the term for insurance, professional liability, and legal hold purposes, subject to the Confidentiality section. Within 30 days of a written request made at or before the end of the term, Seller provides copies of the advisory output issued during the term in a standard file format, and returns or securely destroys Client-provided documents Client asks it not to retain, except where retention is required by law.",
    },

    /* ---------------------------------------------------------------------- */
    /* The designation the client must not assume it has bought.              */
    /* ---------------------------------------------------------------------- */
    {
      id: "retainer.not_competent_person",
      heading: "Seller Is Not Competent Person or Safety Manager of Record",
      anchor: { after: "osha_disclaimer" },
      body: "Seller is not Client's Competent Person, Qualified Person, or Authorized Person for any standard under 29 C.F.R. Parts 1910 and 1926, is not Client's safety manager or safety director of record, and is not Client's authorized representative for an OSHA inspection, informal conference, or contest, unless a separate written agreement identifies Seller in that role, names the standard or proceeding it applies to, and states the period it covers. Engaging Seller for advisory support does not by itself create any of those designations, and Seller's advice does not make Seller a controlling, creating, exposing, or correcting employer at any Client jobsite. Client remains responsible for designating its own qualified personnel and for confirming they meet the requirements of the applicable standard.",
    },

    /* ---------------------------------------------------------------------- */
    /* Who shows up, and what happens when that person cannot.                */
    /* ---------------------------------------------------------------------- */
    {
      id: "retainer.personnel_continuity",
      heading: "Assigned Advisor and Substitution",
      anchor: { after: "independent_contractor" },
      body: "Seller assigns a primary advisor at kickoff and identifies a secondary advisor for coverage during absence. Seller may substitute an advisor of equivalent qualification and relevant experience on written notice to Client, and will do so where continuity of the retainer requires it. Client may request a change of assigned advisor for reasonable cause, and Seller will accommodate the request where staffing allows. No specific individual is guaranteed to be available for a particular request. Solicitation or hiring of assigned personnel is governed by the Non-Solicitation section.",
    },

    /* ---------------------------------------------------------------------- */
    /* How it ends. The shared Termination clause defers to "the final        */
    /* executed agreement"; on a month-to-month retainer this proposal often  */
    /* IS that agreement, so the periods are stated here.                     */
    /* ---------------------------------------------------------------------- */
    {
      id: "retainer.minimum_term_and_notice",
      heading: "Minimum Term, Notice, and Partial Months",
      anchor: { after: "termination" },
      body: "The retainer runs for the initial term shown in the schedule and continues from month to month afterward. Either party may end the retainer at the end of the initial term, or at the end of any month thereafter, on 30 days' written notice; notice given fewer than 30 days before the end of a month takes effect at the end of the following month. Either party may terminate for material breach on 15 days' written notice where the breach is not cured within that period. The monthly commitment for a month already begun is earned when that month begins and is not refundable or prorated, including where a notice period ends mid-month. Fees for project work in progress at termination remain payable under the terms of the applicable quote.",
    },
  ],
};
