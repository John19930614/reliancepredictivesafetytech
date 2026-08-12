// Training — instructor-led safety courses delivered to Client's crews.
//
// WHAT WAS WRONG
//   A training proposal printed the platform's legal section verbatim: "Taxes &
//   SaaS Fees", "THE PLATFORM AND SERVICES ARE PROVIDED AS IS", "The platform
//   supports safety management, reporting, and risk visibility", "This platform
//   is a safety management support tool", and California's SaaS auto-renewal
//   statute — for an OSHA 10 class run out of a jobsite trailer. Nothing on the
//   page said what a class costs to cancel, how small a roster can get before
//   the session stops being viable, who actually issues a Department of Labor
//   card, or what a certificate does and does not prove. The terms that decide
//   whether this business gets paid were the ones missing.
//
// WHAT THIS PROFILE DOES
//   Rewrites the five platform-flavoured clauses into training language, drops
//   the one clause that describes a renewal that does not exist here, and adds
//   the operating terms a training engagement actually runs on: class size,
//   cancellation and no-show charges, roster accuracy, certification and cards,
//   attendee prerequisites, the room Client has to provide, instructor
//   substitution, travel, course materials, and record retention.
//
// WHAT IT DELIBERATELY DOES NOT DO
//   No prices, no session counts, no attendee counts, no dates, no payment
//   terms, no liability cap, no governing law, no validity window. Every one of
//   those is a per-deal commercial choice the seller makes in the editor, and a
//   clause that hardcodes one is a clause that contradicts the schedule printed
//   two pages above it. Where a number belongs to the deal, these clauses point
//   at the schedule. The fixed numbers that DO appear are procedural — notice
//   windows, retention periods, and the cancellation percentages that every
//   training vendor states up front — and they are consistent with each other.
//
//   transaction-templates.ts:297 sells this type with packageKey "none": there
//   is no subscription in a training deal, which is why auto-renewal comes out
//   and why the tax clause stops talking about SaaS.

import type { ProposalTypeProfile } from "./contract";

export const trainingProfile: ProposalTypeProfile = {
  key: "training",

  lexicon: {
    documentTitle: "Training Services Proposal",
    // Covers both ends of what this type sells: one course, or a year of
    // scheduled sessions across a workforce.
    engagementNoun: "the training program",
    feesHeading: "Training Fees",
    scopeHeading: "Courses & Delivery",
    // The schedule's dates bracket when sessions get delivered; they are not a
    // subscription term.
    termHeading: "Delivery Window",
    warrantySubject: "the training services",
    unitNoun: "session",
  },

  omitClauses: [
    // Nothing in a training engagement renews. Sessions are scheduled, delivered
    // and invoiced; there is no continuous service for Cal. Bus. & Prof. Code
    // sec.17600-17606 to govern, and printing an auto-renewal notice promises a
    // cancellation right against a charge that never recurs.
    "auto_renewal_ca",
  ],

  overrideClauses: {
    // Platform scope changes are users, sites and modules. Training scope
    // changes are courses, session counts and rosters — and the template's own
    // summary promises dates get coordinated after acceptance, so this clause
    // has to leave room for that and hand confirmed-session changes to the
    // cancellation terms rather than to a change order.
    scope_changes: {
      body:
        "Session dates, times, and locations are coordinated with Client's scheduling contact after acceptance and confirmed in writing. Once a session is confirmed, a change to that session is handled under the Cancellation and Rescheduling terms. " +
        "Any change to the courses, the number of sessions, or the attendee counts shown in the schedule requires a written change order signed by both parties. Verbal approvals are not binding. " +
        "Courses added after acceptance are billed at the rates shown in the schedule, or at Seller's then-current rate for a course the schedule does not list. Seller may postpone scheduled sessions if a scope dispute stays unresolved beyond 10 business days.",
    },

    // Rosters carry attendee names, employers and evaluation results. The shared
    // clause protects Client's safety data but says nothing about the personal
    // information a training vendor necessarily collects.
    confidentiality: {
      body:
        "Each party protects the other's confidential business, pricing, and operational information with reasonable care; these obligations survive termination for 3 years. " +
        "Attendee names, employment details, and any quiz, test, or skills evaluation results collected during a session are confidential Client information, used only to deliver the training services, issue certification, and produce completion records. " +
        "Client safety data, injury records, and incident reports are confidential and will not be shared with third parties without written authorization, except as required by law.",
    },

    // The shared clause deletes everything within 30 days of termination, which
    // would destroy the completion records Seller promises to hold and reissue.
    // Carved out here so the two clauses stop contradicting each other.
    client_data_ownership: {
      body:
        "Client owns the attendance rosters, attendee information, and safety records it provides. Seller processes them only to deliver the training services, issue certification, and maintain completion records. " +
        "On termination, Seller provides Client's data in a standard exportable format within 30 days, then securely deletes it from active systems, except for the attendance and completion records Seller retains under the Training Records and Retention terms below.",
    },

    // Predictive risk logic and scoring models are not what a client receives in
    // a classroom. The curriculum is, and it is the asset worth protecting on
    // this document.
    trade_secrets: {
      body:
        "Seller's curricula, lesson plans, course materials, exercises, skills evaluations, and instructional methods are protected trade secrets under the Wisconsin Uniform Trade Secrets Act (Wis. Stat. sec.134.90) and the federal Defend Trade Secrets Act (18 U.S.C. sec.1836). " +
        "Client shall not reproduce, adapt, or use them to deliver training to others, and shall not disclose them outside the attendees enrolled in a session. Unauthorized disclosure may result in injunctive relief and damages.",
    },

    // REQUIRED clause, reworded. Disclaims the training, warrants the one thing
    // Seller does commit to (a qualified instructor covering the stated
    // content), and stops promising anything about software.
    warranty_disclaimer: {
      body:
        "THE TRAINING SERVICES AND COURSE MATERIALS ARE PROVIDED AS IS, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. " +
        "Seller warrants only that each session will be delivered by an instructor qualified for that course, covering the content described for it in the schedule. " +
        "Seller does not warrant that a course will identify or prevent every hazard present in Client's operations, or that an attendee will retain or apply what the course covered.",
    },

    // The outcome disclaimer that matters here is the one about competency: a
    // card in a wallet is not an authorization to do the work.
    no_guarantee: {
      body:
        "The training services build hazard awareness and skill in the topics each course covers. They do not guarantee elimination of incidents, injuries, OSHA violations, or losses, and completion of a course does not by itself make an attendee competent, qualified, or authorized to perform a specific task. " +
        "Client retains full responsibility for jobsite safety, for supervising and evaluating its own personnel, and for compliance with 29 C.F.R. Parts 1903, 1904, 1910, and 1926.",
    },

    // REQUIRED clause, reworded. Instruction is not a compliance audit, and the
    // employer's training duty does not transfer to the vendor who taught the
    // class.
    osha_disclaimer: {
      body:
        "The training services are instruction, not legal advice, engineering services, or certified compliance review. Courses are delivered to the standards cited in the course descriptions, but OSHA compliance (29 U.S.C. sec.651 et seq.) and site-specific training requirements remain Client's responsibility, including any equipment-specific, chemical-specific, or site-specific training a course does not cover. " +
        "Client remains the employer responsible for authorizing its personnel to perform work, and Client's designated Competent Person retains all field safety decisions.",
    },

    // REQUIRED clause, reworded. The realistic claims against a training vendor
    // come from bad roster data, attendee conduct, and the room the client
    // supplied — not from misuse of software.
    indemnification: {
      body:
        "Client indemnifies Seller against third-party claims arising from Client's operations, inaccurate or incomplete roster information, attendee conduct, conditions at Client-provided training facilities, or Client's reliance on a course in place of its own compliance and supervision obligations. " +
        "Seller indemnifies Client against claims that Seller's course materials as provided infringe a valid U.S. patent, copyright, or trade secret, provided Seller is promptly notified and controls the defense.",
    },

    // "Taxes & SaaS Fees" on a class invoice. The taxable thing in a training
    // deal is the service and any printed material, and exemption certificates
    // are the practical issue for public-sector and non-profit clients.
    taxes: {
      heading: "Taxes",
      body:
        "Client is responsible for applicable state and local taxes on the training services and on any tangible course materials Seller provides, where those items are taxable in the jurisdiction of delivery (e.g., Wis. Stat. sec.77.52). " +
        "Client provides any valid exemption certificate before invoicing. Where a tax applies, Seller will collect and remit it or provide a tax invoice for Client remittance.",
    },

    // Termination has to reach the money this type actually leaves on the table:
    // accrued cancellation charges and travel already booked.
    termination: {
      body:
        "Either party may terminate per the final executed agreement. Client remains responsible for sessions already delivered, for cancellation charges accrued under the Cancellation and Rescheduling terms, and for approved expenses and non-cancelable third-party commitments, including travel booked for scheduled sessions. " +
        "Confidentiality, IP, dispute-resolution, and data-privacy terms survive termination.",
    },
  },

  // The first nine sit together after Scope Changes, in array order, as one
  // block describing how a session is scheduled, staffed, filled, cancelled and
  // certified. The last two attach to the shared clauses they qualify.
  extraClauses: [
    {
      id: "training.class_size",
      heading: "Class Size",
      anchor: { after: "scope_changes" },
      body:
        "Each course has a minimum and a maximum number of attendees per session, stated with the course line in the schedule or confirmed in writing before scheduling. " +
        "If the confirmed roster falls below the minimum, Seller and Client will consolidate it into another session, reschedule, or deliver the session as scheduled; a session delivered below the minimum is still billed at the session rate shown in the schedule. " +
        "If the roster exceeds the maximum, Seller schedules an additional session at the rate shown rather than seating attendees beyond the maximum, which hands-on evaluation and equipment availability do not allow.",
    },
    {
      id: "training.cancellation",
      heading: "Cancellation and Rescheduling",
      anchor: { after: "scope_changes" },
      body:
        "Client may cancel or reschedule a confirmed session at no charge with at least 10 business days' written notice before the session start. " +
        "A cancellation or reschedule made 5 to 9 business days before the session start is billed at 50% of the session fee shown in the schedule. " +
        "A cancellation or reschedule made fewer than 5 business days before the session start is billed at 100% of that fee, as is a session the instructor cannot deliver on arrival because the room, the site access, or the roster is not ready. " +
        "Travel and lodging already booked and non-refundable are billed in addition, at cost. " +
        "Seller may reschedule a session for instructor illness or travel disruption; a session postponed for that reason, for a site emergency at Client's location, or for an event described in the Force Majeure terms is rescheduled to a mutually agreed date at no cancellation charge.",
    },
    {
      id: "training.no_show",
      heading: "Attendee No-Shows and Late Arrival",
      anchor: { after: "scope_changes" },
      body:
        "Seats reserved on the confirmed roster for a course billed per attendee are billed whether or not the attendee appears. Client may substitute a different attendee at any time before the session begins at no charge. " +
        "An attendee who arrives after instruction has begun, or who leaves before the course is complete, cannot be issued certification for that session. OSHA Outreach courses require attendance for the full published contact hours, and partial attendance cannot be credited toward a card. " +
        "An attendee who misses a session may be added to a later scheduled session at the rate shown in the schedule, subject to seat availability.",
    },
    {
      id: "training.roster",
      heading: "Attendance Roster",
      anchor: { after: "scope_changes" },
      body:
        "Client provides the attendance roster for each session at least 3 business days before it, listing each attendee's full legal name as it should appear on certification, employer, job title, and contact details. " +
        "Certification, completion records, and cards are issued from that roster exactly as Client supplies it, and Client is responsible for its accuracy. Corrections identified after certification has issued are handled as replacement cards under the Certification and Cards terms. " +
        "Attendees not on the confirmed roster may be added at the session, at the rate shown in the schedule, if seating and materials allow.",
    },
    {
      id: "training.certification",
      heading: "Certification and Cards",
      anchor: { after: "scope_changes" },
      body:
        "Each attendee who completes a course and meets its requirements receives a certificate of completion from Seller. Where a course leads to a third-party credential, that credential is issued by the issuing body rather than by Seller. " +
        "Department of Labor cards for OSHA 10-hour and 30-hour Outreach courses are issued by the OSHA Training Institute Education Center that authorizes the trainer, and card production and delivery follow that Education Center's process and timing, which Seller does not control. " +
        "First aid, CPR, and AED cards are issued under the certifying organization's program and are typically valid for two years from the date of completion. Department of Labor Outreach cards carry no federal expiration date, although states, owners, and contractors frequently require a card issued within a stated recency period; confirming those requirements is Client's responsibility. " +
        "Replacement or duplicate cards are requested through Seller and billed at the rate shown in the schedule, or at Seller's then-current rate if the schedule does not list one. " +
        "A certificate or card records attendance and completion of the course content. It is not a determination that the holder is competent, qualified, or authorized to perform a task.",
    },
    {
      id: "training.attendee_prerequisites",
      heading: "Attendee Prerequisites",
      anchor: { after: "scope_changes" },
      body:
        "Instruction, materials, and evaluations are delivered in English unless another language of instruction is confirmed in writing before scheduling; interpretation and translated materials are quoted separately. Attendees must be able to understand the language of instruction, because certification records that the attendee received and understood the content. " +
        "For courses with hands-on portions, including CPR and AED skills performed at floor level, harness donning and inspection, equipment operation, and rescue practice, attendees must be physically able to perform the required skills and must bring and wear the personal protective equipment the course and the site require. " +
        "Where a standard or state law sets a minimum age or a prerequisite qualification for a course, such as powered industrial truck operator training under 29 C.F.R. sec.1910.178, Client confirms before the session that each attendee meets it.",
    },
    {
      id: "training.facilities",
      heading: "Client-Provided Training Facilities",
      anchor: { after: "scope_changes" },
      body:
        "For sessions delivered at Client's site, Client provides a training room sized for the confirmed roster with seating and writing surfaces, lighting, climate control, working power outlets, and a projection surface or display, plus a clear practical area suitable for the hands-on portions of the course and free of active work. " +
        "Client also provides site access, parking, and any orientation or badging the instructor must complete before entering. Time lost to site access delays, room availability, or attendees being released late from work counts toward the scheduled session hours. " +
        "If the space provided cannot support the course safely, the instructor may stop the session, and the Cancellation and Rescheduling terms apply.",
    },
    {
      id: "training.instructor",
      heading: "Instructor Assignment",
      anchor: { after: "scope_changes" },
      body:
        "Seller assigns instructors and may substitute an equally qualified instructor, holding the authorizations the course requires, at any time before or during a session. " +
        "Instructor names appearing in this proposal identify the team expected to deliver the training and are not a commitment to a named individual. " +
        "Instructors are Seller's personnel and are not Client employees; Client does not direct the manner of instruction.",
    },
    {
      id: "training.travel",
      heading: "Travel for On-Site Delivery",
      anchor: { after: "scope_changes" },
      body:
        "Travel time, mileage, lodging, and per diem for sessions delivered at Client's site or another location Client specifies are billed under the travel and expense lines shown in the schedule. " +
        "Where a session is scheduled at a location those lines do not cover, Seller quotes the travel charge in writing before booking and Client approves it before the session is confirmed. " +
        "Travel booked for a session that is later cancelled is handled under the Cancellation and Rescheduling terms.",
    },
    {
      id: "training.course_materials",
      heading: "Course Materials",
      anchor: { after: "intellectual_property" },
      body:
        "Attendees receive the workbooks, handouts, and reference materials a course includes, for their own use in their work for Client. " +
        "Course materials may not be reproduced, adapted, posted, or used to train other personnel or third parties without Seller's written consent, and sessions may not be recorded, photographed, or streamed without it. " +
        "Client may retain, copy, and file the completion records and attendance rosters produced for its own training file without restriction.",
    },
    {
      id: "training.records",
      heading: "Training Records and Retention",
      anchor: { after: "client_data_ownership" },
      body:
        "After each session Seller provides the signed attendance record and a completion record for each attendee. Seller retains a copy of the attendance and completion records for 5 years from the session date and can reissue them to Client during that period. " +
        "Client remains the employer of record for its personnel and is responsible for maintaining its own training records for the periods its applicable standards require, including operator certification records under 29 C.F.R. sec.1910.178(l)(6) and training records a health standard requires it to keep.",
    },
  ],
};
