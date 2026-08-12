// Time & Materials — the legal profile for task lines billed at unit rates.
//
// THE ONE THING THIS TYPE MUST SAY
//   The totals printed on a T&M document are an ESTIMATE for budgeting. Billing
//   follows the quantities actually delivered. A client who reads the estimate
//   as a cap is a dispute waiting to happen, so the estimate/cap distinction is
//   stated first (before Payment Terms), stated plainly, and given precedence
//   over any other total shown in the document.
//
// WHY THE SHARED SET NEEDED SURGERY HERE
//   The shared clauses were lifted out of a platform subscription document: they
//   disclaim "THE PLATFORM AND SERVICES", promise no SaaS errors, tax "SaaS and
//   digital services", indemnify around platform infringement, and explain
//   California's auto-renewal statute. A T&M engagement sells hours and field
//   days — transaction-templates.ts gives it packageKey "none" — so none of that
//   is true here. Each of those clauses is restated for a services engagement
//   rather than deleted, because the protection they carry is still needed; only
//   the auto-renewal clause has no services analogue at all.
//
// WHAT THIS FILE MAY NOT DO
//   Set commercial values. Payment terms, late fee, liability cap, governing
//   law, validity days and every rate stay in the seller's own fields and in the
//   schedule of fees. Clauses here refer to "the schedule of fees" and never
//   quote a number that a seller negotiates per deal. Fixed PROCEDURAL periods
//   (notice windows, retention, remobilization) are the profile's business and
//   are stated outright.

import type { ProposalTypeProfile } from "./contract";

export const timeAndMaterialsProfile: ProposalTypeProfile = {
  key: "time_and_materials",

  lexicon: {
    documentTitle: "Time & Materials Services Proposal",
    engagementNoun: "this engagement",
    // Names the estimate in the heading over the money, so the document argues
    // for itself before the reader reaches the terms.
    feesHeading: "Rates & Estimated Fees",
    scopeHeading: "Scope of Work",
    termHeading: "Period of Performance",
    warrantySubject: "the services and any work product",
    unitNoun: "task",
  },

  // The prose blocks in sections 01, 03, 04, 06 and 07. What they replace was
  // written for a subscription sale and printed unchanged on this type: section
  // 04 promised "Configured platform subscription and client account setup",
  // section 03 said the scope could scale to "a full enterprise platform
  // rollout", and section 06 listed "Platform setup, modules, templates,
  // workflows, and user roles" as a step - on a document that sells safety
  // staffing, site support, and audits by the hour, with packageKey "none" and
  // no subscription anywhere in the deal.
  //
  // Same rule as the clauses: no rates, no counts, no hours, no percentages, no
  // dates. Every one of those is a schedule line or a seller field, and copy
  // that restates one is copy that contradicts the schedule printed beside it -
  // consistency.ts flags prose figures no field carries. Where a number belongs
  // to the deal, this points at the schedule of fees or the terms.
  //
  // The one idea this copy has to carry is the one the clauses lead with: the
  // quantities are estimates, and billing follows what is actually delivered.
  // Sections 01, 03 and 04 each say it in their own register, so a reader who
  // stops before the terms has still been told. For the same reason none of
  // this promises a finished deliverable or a guaranteed outcome; that is the
  // fixed-price type, and it would contradict the Estimated Quantities clause.
  copy: {
    subtitle: "Safety Staffing, Site Support, and Compliance Services Delivered at Unit Rates",
    purposeCallout:
      "This document establishes the proposed scope of work, unit rates, estimated quantities, deliverables, assumptions, and commercial terms for the safety services described below, which are billed for the quantities actually delivered.",
    scopeIntro:
      "The work is organized as individual task lines, each showing what the task covers, the unit it is billed in, the unit rate that applies, and an estimated quantity prepared for budgeting. " +
      "The estimated quantities are planning figures rather than a fixed price, so invoicing follows the quantities actually delivered at the rates shown, and a task line may be drawn down in full, in part, or not at all.",
    deliverables: [
      "Delivery of each task line listed in the schedule of fees, at the unit rates shown",
      "Written work product for task lines that produce one, including reports, audit findings, inspection records, and written program documents",
      "Time and unit records supporting each invoice, identifying the person, date, jobsite, and task line billed",
      "Invoices covering the quantities actually delivered in each billing period, at the unit rates shown",
      "Notice as cumulative billed and committed amounts approach an authorized not-to-exceed amount",
    ],
    scheduleSteps: [
      "Acceptance, authorized representative confirmation, and task authorization",
      "Personnel assignment, site access, orientation, and badging",
      "Scheduling and mobilization of the authorized task lines",
      "Delivery of the authorized work, with time and units recorded as performed",
      "Time approval, invoicing for the quantities delivered, and notice as authorized amounts are approached",
    ],
    clientResponsibilities: [
      "Designate an authorized representative who may approve time and unit records, direct day-to-day priorities among the authorized task lines, and authorize work the schedule of fees does not yet cover.",
      "Provide jobsite access, site orientation, badging, and any site-specific safety requirements assigned personnel must complete before entering.",
      "Review and approve submitted time and unit records within the period stated in the terms, and raise a question about a specific entry within the billing-dispute window rather than holding the undisputed remainder of the invoice.",
      "Give written notice before an estimated quantity, a task line, or a not-to-exceed amount needs to change, so the work can be authorized, staffed, and scheduled before it is required.",
      "Maintain responsibility for jobsite safety, supervision of the client's own workforce, regulatory filings, and final operational decisions, because assigned personnel advise, observe, and document without becoming client employees or assuming the client's Competent Person role.",
    ],
  },

  omitClauses: [
    // Nothing renews: packageKey is "none", there is no subscription to lapse
    // into a second term, and the engagement ends when the authorized work ends.
    "auto_renewal_ca",
  ],

  overrideClauses: {
    // A T&M quantity that moves is not a change order — that is the whole
    // billing model. Reserve the change-order requirement for NEW task types,
    // new locations and scope, which is where it actually protects both parties.
    // Keeps the shared 10-business-day pause right.
    scope_changes: {
      body:
        "A change in the quantity delivered against a task line already listed in the schedule of fees is not a scope change; those quantities are estimates and are billed as delivered. A new task type, a new jobsite or service location, a change to the deliverables described in the scope, and the creation or increase of a not-to-exceed amount each require written approval by both parties before the affected work begins. Verbal approvals are not binding. Seller may pause work if a scope dispute stays unresolved beyond 10 business days.",
    },

    // The shared text disclaims a platform. Professional services carry a
    // standard of care instead, with a bounded re-performance remedy.
    warranty_disclaimer: {
      heading: "Standard of Care & Warranty Disclaimer",
      body:
        "Seller performs the services with the degree of skill and care ordinarily exercised by qualified safety professionals performing comparable services under comparable conditions. EXCEPT FOR THAT UNDERTAKING, THE SERVICES AND ANY WORK PRODUCT ARE PROVIDED AS IS, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. Seller does not warrant that every hazard, deficiency, or regulatory exposure present at a jobsite will be identified, or that any particular safety, inspection, or audit outcome will be achieved. Client's exclusive remedy for services that fail to meet the standard of care stated above is re-performance of the affected task line at Seller's cost, provided Client identifies the failure in writing within 30 days of the affected work.",
    },

    // Same disclaimer, aimed at reports and field support rather than software.
    no_guarantee: {
      body:
        "The services support Client's safety management, reporting, and risk visibility. They do not guarantee elimination of incidents, injuries, OSHA citations, or losses, and no report, audit, inspection, or written program delivered under this engagement certifies a jobsite as safe or compliant. Client retains full responsibility for jobsite safety and for compliance with 29 C.F.R. Parts 1903, 1904, 1910, and 1926.",
    },

    // The sharpest clause on a staffing and site-support document: assigned
    // personnel advise and document, and do not silently become the Client's
    // Competent Person by standing on the jobsite every day.
    osha_disclaimer: {
      body:
        "The services delivered under this engagement are safety management support, not legal advice, engineering services, or certified compliance review. OSHA compliance (29 U.S.C. sec.651 et seq.) and site-specific requirements remain Client's responsibility. Personnel assigned by Seller advise, observe, document, and support; they do not assume the role of Client's Competent Person, controlling employer, or site safety supervisor unless Client designates them in writing for a defined scope. Client's designated Competent Person retains all field safety decisions.",
    },

    // No platform to misuse and no platform to infringe. Restated as the
    // ordinary services indemnity: jobsite conditions one way, negligence of
    // Seller's own personnel the other.
    indemnification: {
      body:
        "Client indemnifies Seller against third-party claims arising from jobsite conditions under Client's control or the control of another party at the site, Client's violation of law, inaccurate or incomplete information provided to Seller, and use of Seller's reports or recommendations for a purpose the engagement did not contemplate. Seller indemnifies Client against third-party claims for bodily injury or property damage to the extent caused by the negligent acts or omissions of Seller's personnel in performing the services, and against claims that work product prepared by Seller infringes a valid U.S. patent, copyright, or trade secret. In each case the indemnifying party must be promptly notified and controls the defense, and neither party settles a claim in a way that admits fault on the other's behalf without that party's written consent.",
    },

    // Trade-secret protection reaimed at what a services client actually
    // receives. Internal use of the deliverables is left to the Intellectual
    // Property section, which the seller sets per deal, so the two cannot fight.
    trade_secrets: {
      body:
        "Seller's methodologies, audit and inspection protocols, scoring criteria, program and document templates, checklists, and work product formats are protected trade secrets under the Wisconsin Uniform Trade Secrets Act (Wis. Stat. sec.134.90) and the federal Defend Trade Secrets Act (18 U.S.C. sec.1836). Client shall not resell, publish, or supply Seller's templates, protocols, or work product formats to a third party engaged in comparable services, and shall not derive Seller's proprietary methods from the deliverables. Use of the deliverables within Client's own operations is governed by the Intellectual Property section of these terms. Unauthorized disclosure may result in injunctive relief and damages.",
    },

    // "Taxes & SaaS Fees" on an invoice for field days is nonsense. Also states
    // that tax does not eat a not-to-exceed amount, which is where this argument
    // actually happens.
    taxes: {
      heading: "Taxes",
      body:
        "The unit rates shown in the schedule of fees are exclusive of taxes. Client is responsible for applicable sales, use, and service taxes on the services where the jurisdiction of performance imposes them, including Wisconsin (Wis. Stat. sec.77.52) and other states in which the services are delivered. Where applicable, Seller collects and remits required taxes or provides a tax invoice for Client remittance. Client provides a valid exemption certificate before invoicing if an exemption is claimed. Taxes are stated separately on the invoice and do not count against a not-to-exceed amount unless the writing establishing that amount says otherwise.",
    },

    // Joint employment is the live risk when a firm places safety personnel on
    // someone else's jobsite for months. The shared clause only pointed the
    // no-direction rule one way; both directions matter here.
    independent_contractor: {
      heading: "Independent Contractor; No Joint Employment",
      body:
        "Seller acts as an independent contractor, and this proposal creates no employment, partnership, joint venture, or agency relationship. Seller is the sole employer of its personnel and is responsible for their wages, payroll taxes, workers' compensation coverage, and employment benefits. Client does not hire, discipline, set compensation for, or otherwise act as an employer of Seller's personnel, and neither party intends a joint-employer relationship. Seller does not direct or control Client personnel or daily jobsite operations unless separately agreed in writing.",
    },
  },

  extraClauses: [
    /* ---------------------------------------------------------------------- */
    /* The defining pair, printed ahead of Payment Terms.                      */
    /* ---------------------------------------------------------------------- */
    {
      id: "tm.estimate_not_a_cap",
      heading: "Estimated Quantities; Not a Fixed Price",
      body:
        "The quantities shown in the schedule of fees are estimates prepared for budgeting. Seller bills for the quantities actually delivered at the unit rates shown in the schedule, and the estimated total is neither a fixed price nor a guaranteed maximum. If less work is performed than estimated, Client is invoiced only for what was delivered. If more work is requested or required, the additional quantities are invoiced at the same unit rates. No limit on total fees applies unless a not-to-exceed amount is agreed under the following section. Where this section conflicts with a summary, scope narrative, or total shown elsewhere in this proposal, this section controls.",
      anchor: { position: "start" },
    },
    {
      id: "tm.not_to_exceed",
      heading: "Not-to-Exceed Authorization",
      body:
        "A not-to-exceed amount applies only if it is stated in the schedule of fees or agreed in a writing signed by both parties, and it limits total fees rather than changing any unit rate. Where a not-to-exceed amount is in effect, Seller notifies Client when cumulative billed and committed amounts reach 75 percent of it, and again at 90 percent, so Client may authorize an increase or direct that work stop. Seller is not obligated to continue work beyond a not-to-exceed amount, and work performed beyond it at Client's written authorization is invoiced at the rates shown in the schedule. Reaching a not-to-exceed amount does not relieve Client of responsibility for time already worked, units already delivered, or expenses already incurred.",
      anchor: { position: "start" },
    },

    /* ---------------------------------------------------------------------- */
    /* Rate and billing mechanics, gathered around Payment Terms.              */
    /* ---------------------------------------------------------------------- */
    {
      id: "tm.rate_schedule",
      heading: "Rates and Rate Period",
      body:
        "The unit rates shown in the schedule of fees govern all work billed under this engagement, and no other rate sheet, verbal quote, or prior proposal applies. Those rates hold for acceptance through the period stated in Proposal Validity and, once this proposal is accepted, for work performed within the period of performance shown in the schedule. A task type not listed in the schedule has no agreed rate; Seller quotes it in writing and Client approves it in writing before that work begins. Rates are re-set by written agreement at the start of any renewal or extension of the period of performance, and a rate change never applies to work already performed.",
      anchor: { before: "payment_terms" },
    },
    {
      id: "tm.timesheets_and_records",
      heading: "Timesheets and Supporting Records",
      body:
        "Seller records time by person, date, jobsite, and task line, and records units delivered for task lines billed by session, day, or document. Each invoice is accompanied by a summary of the time and units billed in that period, showing the task line, the quantity, and the unit rate applied, and Seller provides the underlying timesheets or field records on request. A question about a specific time entry or unit is raised within the billing-dispute window stated in Payment Terms; a disputed entry does not defer payment of the undisputed remainder of the invoice. Seller retains the supporting records for 24 months after the final invoice for this engagement.",
      anchor: { after: "payment_terms" },
    },
    {
      id: "tm.overtime_and_minimums",
      heading: "Overtime, Premium Time, and Minimum Billing",
      body:
        "Work performed at Client's request beyond 8 hours in a day or 40 hours in a week is billed at one and one-half times the applicable unit rate. Work Client schedules on a Saturday, a Sunday, a federal holiday, or a night shift is billed at one and one-half times the applicable unit rate, and hours beyond 12 in a single day are billed at two times the applicable unit rate. Premium multipliers are not compounded; where more than one applies to the same hour, the higher single multiplier is used. Hourly work is recorded in quarter-hour increments. Attendance requested on less than 24 hours notice, and any call-out to a jobsite outside scheduled hours, carries a four-hour minimum. A scheduled field assignment that Client cancels on less than 24 hours notice is billed at that four-hour minimum, together with any non-cancelable travel already committed.",
      anchor: { after: "payment_terms" },
    },
    {
      id: "tm.travel_and_expenses",
      heading: "Travel, Mobilization, and Reimbursable Expenses",
      body:
        "Travel time, mileage, mobilization, lodging, and per diem are billed only where the schedule of fees carries a line for them, at the amounts shown on that line; these terms set no travel rate of their own. Reimbursable expenses are billed as incurred, without markup unless the schedule states otherwise, and are supported by receipts on request. Travel outside the service area described in the scope, and any expense Client has not approved in writing, is not incurred by Seller without written approval. Airfare, equipment rental, third-party testing, and similar commitments made at Client's written direction are non-cancelable once booked and remain payable if the underlying work is later cancelled.",
      anchor: { after: "payment_terms" },
    },
    {
      id: "tm.standby_and_delay",
      heading: "Standby and Delay Time",
      body:
        "Time during which Seller's personnel are present and available but unable to perform the scheduled work is billed as standby at the applicable unit rate, whether the cause is site access, permitting, a weather hold called by Client or by the site's controlling employer, unavailability of Client personnel or equipment, or a condition Seller's personnel are not permitted to work through. Seller notifies Client's designated contact when a standby condition begins and records its start and end. Seller mitigates standby by reassigning personnel to other authorized task lines where that is practical. Standby caused by Seller's own failure to arrive, staff, or equip the work as scheduled is not billable.",
      anchor: { after: "payment_terms" },
    },

    /* ---------------------------------------------------------------------- */
    /* Who does the work, and what happens when the site goes away.            */
    /* ---------------------------------------------------------------------- */
    {
      id: "tm.personnel_and_substitution",
      heading: "Personnel, Substitution, and Direction of the Work",
      body:
        "Seller assigns qualified personnel to each task line and may substitute personnel of equivalent qualification and experience during the engagement, notifying Client before a substitute's first shift where practical. An individual named in this proposal is identified as the intended assignment, not as a guarantee of availability. Seller retains the right to direct the manner and means of its personnel's work; Client defines the tasks, jobsites, schedule, and site rules, and does not supervise or discipline Seller's personnel as its own employees. Client's site safety rules, orientation requirements, and stop-work authority apply to Seller's personnel while they are on Client's jobsites. Seller may decline or withdraw an assignment where a jobsite condition presents an unmitigated hazard to its personnel, and time reasonably spent on that withdrawal is billed as standby.",
      anchor: { after: "independent_contractor" },
    },
    {
      id: "tm.suspension_and_demobilization",
      heading: "Suspension and Demobilization",
      body:
        "Either party may suspend the engagement on written notice. Where a jobsite is unavailable, access is withdrawn, or the work is suspended for a reason other than Seller's performance, Seller demobilizes and invoices time worked, units delivered, standby incurred before demobilization, and non-cancelable commitments already made. A suspension continuing beyond 30 consecutive days is treated as a demobilization; remobilization is then scheduled subject to personnel availability, and mobilization is billed again under the schedule of fees. Rates for work resumed more than 90 days after demobilization are confirmed in writing before remobilization.",
      anchor: { after: "termination" },
    },
  ],
};
