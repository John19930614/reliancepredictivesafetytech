// Proposal price book — the single source of truth for what a customer is quoted.
//
// Transcribed verbatim from the inline `phaseOptions` / `serviceOptions` /
// `packageData` literals in assets/proposal-generator-v15.html. The asset still
// carries its own copy while the standalone HTML file remains shippable; a later
// wave removes the duplication. Until then, ANY price change must be made in
// both places.
//
// Everything here is frozen at runtime: the catalog is shared module state and a
// mutation would silently reprice every proposal computed afterwards in the same
// server process.

/** Display order of the service picker's option groups (asset: SERVICE_GROUPS). */
export const serviceGroups = Object.freeze([
  "Platform & Licensing",
  "Implementation & Consulting",
  "Safety Documents & Programs",
  "Training Catalog",
  "Audits & Field Support",
  "Travel & Expenses",
  "Custom",
] as const);

export type ServiceGroup = (typeof serviceGroups)[number];

/** An implementation phase line the seller can add to the schedule of fees. */
export interface PhaseOption {
  readonly name: string;
  /** Default unit fee in USD. The seller may override it per proposal. */
  readonly price: number;
  readonly desc: string;
}

/** A service / add-on line: platform modules, documents, training, travel. */
export interface ServiceOption {
  readonly name: string;
  /** Default unit fee in USD. The seller may override it per proposal. */
  readonly price: number;
  /** Billing unit shown on the Qty field ("Session", "Day", "Mile", ...). */
  readonly unit: string;
  readonly group: ServiceGroup;
  readonly desc: string;
}

/** A base subscription package (the first line of the fee table). */
export interface PackageOption {
  readonly name: string;
  /** Package fee in USD, overridden by the annualPrice field when set. */
  readonly price: number;
  readonly users: number;
  readonly sites: number;
  readonly desc: string;
}

/**
 * Freezes the catalog map and each option inside it. Shallow Object.freeze would
 * leave `serviceOptions.osha10.price = 1` working.
 */
function freezeCatalog<T extends Record<string, object>>(catalog: T): T {
  for (const option of Object.values(catalog)) Object.freeze(option);
  return Object.freeze(catalog);
}

/**
 * Implementation phases.
 *
 * Names carry NO "Phase 1 — " prefix on purpose. The document numbers phases by
 * their position in the proposal (`1.`, `2.`, `3.` …), so a baked-in ordinal
 * printed as "1. Phase 1 — Discovery & Intake" — and worse, a seller who picked
 * only Discovery and Launch got "1. Phase 1 …" followed by "2. Phase 4 …".
 * Position is the only ordinal the document trusts; see stripPhaseOrdinal() for
 * the rows already saved with the old names.
 */
export const phaseOptions = freezeCatalog({
  discovery: { name: "Discovery & Intake", price: 3500, desc: "Confirm client objectives, gather current documents, map users, identify jobsite needs, and finalize configuration priorities." },
  build: { name: "Build & Configure", price: 10000, desc: "Configure modules, templates, dashboards, workflows, permission groups, and billing package selections." },
  validation: { name: "Validation & Review", price: 6500, desc: "Review sample outputs, confirm required fields, verify reporting logic, test workflows, and correct gaps before launch." },
  launch: { name: "Launch & Training", price: 8000, desc: "Support rollout, user training, manager review, reporting cadence, and go-live stabilization." },
  ongoing: { name: "Ongoing Support", price: 4500, desc: "Monthly account support, billing review, platform adjustments, and management reporting support." },
  custom: { name: "Custom Phase", price: 0, desc: "Custom implementation phase to be defined by the seller." },
} as const satisfies Record<string, PhaseOption>);

export type PhaseKey = keyof typeof phaseOptions;

/** Fallback used by the asset when a row carries an unknown phase key. */
export const defaultPhaseKey: PhaseKey = "discovery";

/**
 * Removes a leading "Phase 3 — " / "Phase 3 -" / "Phase 3:" ordinal from a phase
 * name.
 *
 * Every proposal saved before this change stored the OLD catalog name inside
 * `form_data.phases[].name`, and those rows are never re-read from the catalog —
 * the stored name wins so a seller's manual rename survives. Without this, old
 * proposals would keep printing the doubled ordinal forever. Applied at render
 * time only; the stored data is left exactly as the seller saved it.
 *
 * A name that is ONLY an ordinal ("Phase 2") is returned untouched — stripping
 * it would leave the row with no label at all.
 */
export function stripPhaseOrdinal(name: string): string {
  const stripped = name.replace(/^\s*phase\s*\d+\s*(?:[—–-]|:)\s*/i, "");
  return stripped.trim() === "" ? name : stripped;
}

export const serviceOptions = freezeCatalog({
  platformLicense: { name: "Annual Platform License", price: 7500, unit: "Year", group: "Platform & Licensing", desc: "Annual platform license / subscription for the SafetyDocs360 safety platform." },
  perUser: { name: "Per-User Annual License", price: 299, unit: "User", group: "Platform & Licensing", desc: "Per-user annual seat license added to the active subscription (Qty = users)." },
  adminSetup: { name: "Admin Setup / Onboarding", price: 2500, unit: "Project", group: "Platform & Licensing", desc: "One-time platform setup, onboarding, and account configuration." },
  implementation: { name: "Implementation & Platform Configuration", price: 12500, unit: "Project", group: "Implementation & Consulting", desc: "Account setup, roles, permissions, branding, workflow configuration, and launch support." },
  document: { name: "Document Control / Program Builder", price: 15000, unit: "Project", group: "Implementation & Consulting", desc: "Safety program document library, review workflow, revision history, template controls, and proposal-ready documentation outputs." },
  audits: { name: "Audit / Inspection Module", price: 12500, unit: "Project", group: "Implementation & Consulting", desc: "Configurable inspections, corrective actions, observation tracking, audit readiness reporting, and management review dashboards." },
  predictive: { name: "Predictive Risk Intelligence", price: 22500, unit: "Project", group: "Implementation & Consulting", desc: "Leading indicator tracking, precursor cells, trend logic, risk scoring, dashboard review, and executive summary outputs." },
  trainingMatrix: { name: "Training Matrix & Certification Tracking", price: 9500, unit: "Project", group: "Implementation & Consulting", desc: "Role-based training matrix, expiration tracking, missing training summaries, and compliance reporting." },
  weather: { name: "Weather / Lightning Alerts", price: 5500, unit: "Project", group: "Implementation & Consulting", desc: "Jobsite weather zones, lightning thresholds, high wind triggers, heat/cold rules, and alert-ready workflow language." },
  mobile: { name: "Mobile Field App Enablement", price: 18500, unit: "Project", group: "Implementation & Consulting", desc: "Field issue capture, JSA support, inspection entry, photo observations, and mobile user rollout support." },
  aiGateway: { name: "AI Gateway Validation Layer", price: 27500, unit: "Project", group: "Implementation & Consulting", desc: "AI-supported validation gates for intake quality, missing data checks, risk classification, and document consistency review." },
  customWorkflow: { name: "Custom Workflow Build", price: 225, unit: "Hour", group: "Implementation & Consulting", desc: "Developer / configuration time for custom workflows and integrations (Qty = hours)." },
  reviewHour: { name: "Document Review / Consulting", price: 150, unit: "Hour", group: "Implementation & Consulting", desc: "Document review or consulting time, billed hourly (Qty = hours)." },
  extraUsers: { name: "Additional User Block (25)", price: 4500, unit: "Block", group: "Implementation & Consulting", desc: "Adds 25 additional user seats to the active subscription term." },
  extraSites: { name: "Additional Jobsite Block", price: 6500, unit: "Site", group: "Implementation & Consulting", desc: "Adds one additional jobsite / worksite profile to the active subscription term." },
  docShort: { name: "Safety Document — Short (≤35 pg)", price: 595, unit: "Document", group: "Safety Documents & Programs", desc: "Safety document or program, short length (up to 35 pages)." },
  docMedium: { name: "Safety Document — Medium (≤60 pg)", price: 1150, unit: "Document", group: "Safety Documents & Programs", desc: "Safety document or program, medium length (up to 60 pages)." },
  docLong: { name: "Safety Document — Long (≤90 pg)", price: 2100, unit: "Document", group: "Safety Documents & Programs", desc: "Safety document or program, long length (up to 90 pages)." },
  reviewStandard: { name: "Standard Review Package", price: 495, unit: "Package", group: "Safety Documents & Programs", desc: "Review of one existing safety document for regulatory accuracy and completeness, returned with tracked comments and a summary of required edits." },
  reviewPremium: { name: "Premium Review Package", price: 1350, unit: "Package", group: "Safety Documents & Programs", desc: "Deep review of one existing safety document: regulatory citation check, gap analysis against your actual operations, and rewritten drafts of the deficient sections." },
  annualUpdate: { name: "Annual Update Service", price: 550, unit: "Year", group: "Safety Documents & Programs", desc: "Yearly refresh of a delivered document covering regulation changes, updated citations, revised organizational and contact details, and a new revision record." },
  safetyDocCustom: { name: "Safety Document / Program (custom)", price: 0, unit: "Document", group: "Safety Documents & Programs", desc: "Custom safety document or program — set scope and price, or use the Safety Document Pricing helper below." },
  complianceAudit: { name: "Compliance Audit", price: 1750, unit: "Audit", group: "Audits & Field Support", desc: "Structured audit against OSHA and company program requirements, delivered as a scored findings report with prioritized corrective actions and due dates." },
  auditDay: { name: "In-Person Audit Day", price: 1750, unit: "Day", group: "Audits & Field Support", desc: "A billable day of on-site audit or inspection time. Use this when audit scope is measured in days rather than sold as a fixed audit package." },
  fieldDay: { name: "Field Support Day", price: 1250, unit: "Day", group: "Audits & Field Support", desc: "A day of on-site safety support: pre-task briefings, field observations, corrective coaching, and a written end-of-day summary for management." },
  mileage: { name: "Travel Mileage", price: 0.7, unit: "Mile", group: "Travel & Expenses", desc: "Mileage billed per mile (Qty = miles)." },
  hotel: { name: "Hotel Night", price: 185, unit: "Night", group: "Travel & Expenses", desc: "Overnight lodging (Qty = nights)." },
  perDiem: { name: "Per Diem", price: 75, unit: "Day", group: "Travel & Expenses", desc: "Meals / incidentals (Qty = days)." },
  custom: { name: "Custom Service Line", price: 0, unit: "Unit", group: "Custom", desc: "Custom scope — set description and price." },
  // Training Catalog.
  //
  // Every entry here used to share ONE description ("Instructor-led training
  // session; Qty = number of sessions."). The document prints a scope paragraph
  // per service line, so any proposal quoting two trainings rendered two
  // identical paragraphs under two different headings — the "service line 3 and
  // service line 6 are the same" report. Each entry now describes its own
  // content. The billing unit already conveys what Qty means, so it is no longer
  // repeated in the prose.
  osha10: { name: "OSHA 10 Training", price: 175, unit: "Person", group: "Training Catalog", desc: "OSHA 10-hour outreach course covering hazard recognition, worker rights, and the Focus Four hazards. Department of Labor cards are issued to each attendee." },
  osha30: { name: "OSHA 30 Training", price: 425, unit: "Person", group: "Training Catalog", desc: "OSHA 30-hour outreach course for supervisors and safety leads, covering hazard control, program administration, and OSHA recordkeeping. Department of Labor cards are issued to each attendee." },
  newHire: { name: "New Hire Safety Orientation", price: 450, unit: "Session", group: "Training Catalog", desc: "Site-specific orientation covering company safety rules, required PPE, hazard and injury reporting, emergency procedures, and signed acknowledgment for each new hire." },
  supLeader: { name: "Supervisor Safety Leadership Training", price: 850, unit: "Session", group: "Training Catalog", desc: "Supervisor-level session on setting field expectations, coaching in the moment, documenting corrections, and running an effective pre-task safety briefing." },
  toolbox: { name: "Toolbox Talk Program Development", price: 300, unit: "Session", group: "Training Catalog", desc: "Builds a rotating toolbox talk library matched to your scopes of work, with a delivery schedule, attendance forms, and a supervisor facilitation guide." },
  fall: { name: "Fall Protection Training", price: 650, unit: "Session", group: "Training Catalog", desc: "Fall hazard recognition, harness inspection and fit, anchorage and connector selection, and rescue planning under 29 C.F.R. Part 1926 Subpart M." },
  ladder: { name: "Ladder Safety Training", price: 350, unit: "Session", group: "Training Catalog", desc: "Ladder selection and duty ratings, pre-use inspection, setup angle and securing, three-point contact, and the misuse patterns behind most ladder injuries." },
  scaffold: { name: "Scaffold User Training", price: 550, unit: "Session", group: "Training Catalog", desc: "Scaffold user awareness covering safe access, guardrail and planking requirements, platform loading, tag systems, and what to report to the competent person." },
  mewp: { name: "MEWP / Aerial Lift Training", price: 850, unit: "Session", group: "Training Catalog", desc: "Operator training for boom and scissor lifts to ANSI A92 standards: pre-use inspection, fall restraint, ground conditions, and safe positioning near hazards." },
  forklift: { name: "Forklift / PIT Training", price: 950, unit: "Session", group: "Training Catalog", desc: "Powered industrial truck operator certification under 29 C.F.R. sec.1910.178, with classroom instruction, hands-on evaluation, and written operator authorization." },
  rigging: { name: "Rigging & Signal Person Training", price: 950, unit: "Session", group: "Training Catalog", desc: "Sling selection and inspection, load weight and center of gravity, hitch configuration, and standard hand and voice signals for crane operations." },
  craneAware: { name: "Crane Awareness Training", price: 750, unit: "Session", group: "Training Catalog", desc: "Awareness-level session on crane setup, load charts, swing radius, ground bearing pressure, and the exclusion zones that keep crews clear of suspended loads." },
  confined: { name: "Confined Space Awareness Training", price: 800, unit: "Session", group: "Training Catalog", desc: "Permit and non-permit space identification, atmospheric hazards and monitoring, entry roles, attendant duties, and rescue expectations under 29 C.F.R. sec.1910.146." },
  excavation: { name: "Excavation / Trenching Safety Training", price: 800, unit: "Session", group: "Training Catalog", desc: "Soil classification, protective system selection, spoil placement, access and egress, and daily competent person inspection under 29 C.F.R. Part 1926 Subpart P." },
  loto: { name: "Lockout / Tagout Training", price: 700, unit: "Session", group: "Training Catalog", desc: "Energy isolation procedures, authorized versus affected employee roles, group lockout, shift transfer, and verification of a zero energy state before work begins." },
  hazcomT: { name: "Hazard Communication Training", price: 500, unit: "Session", group: "Training Catalog", desc: "GHS labeling and pictograms, safety data sheet use, chemical inventory upkeep, and locating and following the written hazard communication program." },
  ppeT: { name: "PPE Training", price: 350, unit: "Session", group: "Training Catalog", desc: "PPE hazard assessment, selection by exposure, fit and inspection, care and replacement, and the limits of each class of protective equipment." },
  elecAware: { name: "Electrical Safety Awareness", price: 850, unit: "Session", group: "Training Catalog", desc: "Shock and arc flash hazard awareness, approach boundaries, GFCI and extension cord safety, and recognizing when work must be handed to a qualified person." },
  nfpa70e: { name: "NFPA 70E Awareness Training", price: 1100, unit: "Session", group: "Training Catalog", desc: "Arc flash risk assessment, incident energy and PPE category tables, equipment labeling requirements, and energized work permit expectations." },
  hotwork: { name: "Hot Work / Fire Watch Training", price: 500, unit: "Session", group: "Training Catalog", desc: "Hot work permitting, combustible clearance and shielding, fire watch duties and equipment, and the required post-work monitoring period." },
  fireExt: { name: "Fire Extinguisher Training", price: 450, unit: "Session", group: "Training Catalog", desc: "Extinguisher classes and matching, the PASS technique, deciding whether to fight or evacuate, and monthly inspection duties. Live discharge available on request." },
  silica: { name: "Silica Awareness Training", price: 650, unit: "Session", group: "Training Catalog", desc: "Respirable crystalline silica exposure sources, Table 1 control methods, housekeeping restrictions, and medical surveillance triggers under 29 C.F.R. sec.1926.1153." },
  respiratory: { name: "Respiratory Protection Training", price: 700, unit: "Session", group: "Training Catalog", desc: "Respirator selection, medical evaluation and fit test requirements, user seal checks, cartridge change schedules, and program administration under 29 C.F.R. sec.1910.134." },
  hearing: { name: "Hearing Conservation Training", price: 450, unit: "Session", group: "Training Catalog", desc: "Noise exposure and dose basics, audiometric testing, hearing protector selection and fit, and the elements of a written hearing conservation program." },
  heat: { name: "Heat Illness Prevention Training", price: 425, unit: "Session", group: "Training Catalog", desc: "Heat illness warning signs and emergency response, acclimatization schedules, water, rest, and shade practices, and supervisor monitoring on high heat index days." },
  ergo: { name: "Ergonomics Training", price: 450, unit: "Session", group: "Training Catalog", desc: "Manual material handling, awkward posture and repetition risk factors, early symptom reporting, and practical task redesign for both field and office work." },
  bbp: { name: "Bloodborne Pathogens Training", price: 400, unit: "Session", group: "Training Catalog", desc: "Exposure control plan, universal precautions, sharps handling and spill cleanup, and post-exposure evaluation under 29 C.F.R. sec.1910.1030." },
  firstAid: { name: "First Aid / CPR / AED Coordination", price: 1200, unit: "Session", group: "Training Catalog", desc: "Certification coordinated through an approved provider, covering adult CPR, AED use, bleeding control, and workplace first aid response." },
  incident: { name: "Incident Investigation Training", price: 750, unit: "Session", group: "Training Catalog", desc: "Scene control, evidence and statement gathering, root cause analysis methods, corrective action development, and writing a defensible investigation report." },
  jsaT: { name: "JHA / JSA Training", price: 650, unit: "Session", group: "Training Catalog", desc: "Breaking a task into steps, identifying the hazard in each step, selecting controls by the hierarchy, and running the completed JSA as a crew briefing." },
  driving: { name: "Defensive Driving Training", price: 700, unit: "Session", group: "Training Catalog", desc: "Space and speed management, distraction and fatigue, adverse conditions, backing and spotter use, and company vehicle incident reporting." },
  spotter: { name: "Spotter / Flagger Training", price: 650, unit: "Session", group: "Training Catalog", desc: "Flagger station setup, signaling devices and procedures, work zone traffic control layouts, and communication protocols for spotting equipment." },
  contractorT: { name: "Contractor Management Training", price: 850, unit: "Session", group: "Training Catalog", desc: "Prequalification, orientation and badging, insurance and scope verification, field oversight expectations, and contractor performance review." },
  culture: { name: "Safety Culture Workshop", price: 1250, unit: "Session", group: "Training Catalog", desc: "Facilitated leadership workshop on psychological safety, near-miss reporting, recognition, accountability, and converting safety metrics into field behavior." },
  genTraining: { name: "Training Session (general)", price: 750, unit: "Session", group: "Training Catalog", desc: "Instructor-led session on a topic you specify. Scope, duration, and participant materials are confirmed before scheduling." },
} as const satisfies Record<string, ServiceOption>);

export type ServiceKey = keyof typeof serviceOptions;

/** Fallback used by the asset when a row carries an unknown service key. */
export const defaultServiceKey: ServiceKey = "document";

/**
 * Base subscription packages.
 *
 * TRANSCRIPTION NOTE — `custom`: in the asset, `packageData.custom` reads its
 * price/users/sites straight off the DOM at script-evaluation time
 * (`Number($('annualPrice')?.value || 0)`), so its "catalog" values are really
 * whatever the Pilot / License Price, Included Users and Included Jobsites
 * inputs are defaulted to in the markup: 5000 / 50 / 2. Those defaults are
 * transcribed here. They only ever apply as a fallback — the generator state's
 * own annualPrice / includedUsers / includedSites win whenever they are set.
 *
 * COPY RULE — no counts and no durations in `name` or `desc`. The pilot package
 * used to be named "… (6-Month)" and described as "a 6-month pilot … for up to
 * 50 users across 2 jobsites". Those are frozen strings, so changing Included
 * Users, Included Jobsites, or the term dates left the document still telling
 * the client the old numbers with no way to correct it. Every count and date in
 * the rendered package paragraph is now composed at render time from the
 * proposal's own fields — see buildPackageDescription() in
 * components/proposals/proposal-document-model.ts.
 */
export const packageData = freezeCatalog({
  starter: { name: "Starter Compliance Platform", price: 35000, users: 15, sites: 1, desc: "Core compliance support for a smaller operation or early-stage platform rollout." },
  professional: { name: "Professional Safety Intelligence", price: 65000, users: 50, sites: 5, desc: "Expanded safety management platform for active jobsite operations, document control, audits, and leadership reporting." },
  enterprise: { name: "Enterprise Predictive Safety", price: 99500, users: 100, sites: 10, desc: "Full multi-site safety intelligence package with stronger predictive risk capability, AI-supported review, and executive visibility." },
  blacklabel: { name: "Black Label Strategic Program", price: 155000, users: 250, sites: 25, desc: "Strategic enterprise program for organizations requiring advanced safety intelligence, multi-site governance, and premium implementation support." },
  custom: { name: "Pilot Program — Platform Access", price: 5000, users: 50, sites: 2, desc: "A fixed-price pilot providing platform access for the included users and jobsites shown below, with no additional setup or licensing cost during the pilot term." },
} as const satisfies Record<string, PackageOption>);

export type PackageKey = keyof typeof packageData;

/** The package the asset preselects (`<option value="custom" selected>`). */
export const defaultPackageKey: PackageKey = "custom";

/** Narrowing helpers — a persisted state may carry a key that no longer exists. */
export function isPhaseKey(key: string): key is PhaseKey {
  return Object.prototype.hasOwnProperty.call(phaseOptions, key);
}

export function isServiceKey(key: string): key is ServiceKey {
  return Object.prototype.hasOwnProperty.call(serviceOptions, key);
}

export function isPackageKey(key: string): key is PackageKey {
  return Object.prototype.hasOwnProperty.call(packageData, key);
}

/** Catalog entry for a line item, or null when the key is unknown. */
export function lookupPhase(key: string): PhaseOption | null {
  return isPhaseKey(key) ? phaseOptions[key] : null;
}

export function lookupService(key: string): ServiceOption | null {
  return isServiceKey(key) ? serviceOptions[key] : null;
}

export function lookupPackage(key: string): PackageOption | null {
  return isPackageKey(key) ? packageData[key] : null;
}
