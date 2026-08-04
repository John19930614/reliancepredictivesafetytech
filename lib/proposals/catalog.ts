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

export const phaseOptions = freezeCatalog({
  discovery: { name: "Phase 1 — Discovery & Intake", price: 3500, desc: "Confirm client objectives, gather current documents, map users, identify jobsite needs, and finalize configuration priorities." },
  build: { name: "Phase 2 — Build & Configure", price: 10000, desc: "Configure modules, templates, dashboards, workflows, permission groups, and billing package selections." },
  validation: { name: "Phase 3 — Validation & Review", price: 6500, desc: "Review sample outputs, confirm required fields, verify reporting logic, test workflows, and correct gaps before launch." },
  launch: { name: "Phase 4 — Launch & Training", price: 8000, desc: "Support rollout, user training, manager review, reporting cadence, and go-live stabilization." },
  ongoing: { name: "Phase 5 — Ongoing Support", price: 4500, desc: "Monthly account support, billing review, platform adjustments, and management reporting support." },
  custom: { name: "Custom Phase", price: 0, desc: "Custom implementation phase to be defined by the seller." },
} as const satisfies Record<string, PhaseOption>);

export type PhaseKey = keyof typeof phaseOptions;

/** Fallback used by the asset when a row carries an unknown phase key. */
export const defaultPhaseKey: PhaseKey = "discovery";

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
  reviewStandard: { name: "Standard Review Package", price: 495, unit: "Package", group: "Safety Documents & Programs", desc: "Standard document review support package." },
  reviewPremium: { name: "Premium Review Package", price: 1350, unit: "Package", group: "Safety Documents & Programs", desc: "Premium document review support package." },
  annualUpdate: { name: "Annual Update Service", price: 550, unit: "Year", group: "Safety Documents & Programs", desc: "Annual document update and maintenance service." },
  safetyDocCustom: { name: "Safety Document / Program (custom)", price: 0, unit: "Document", group: "Safety Documents & Programs", desc: "Custom safety document or program — set scope and price, or use the Safety Document Pricing helper below." },
  complianceAudit: { name: "Compliance Audit", price: 1750, unit: "Audit", group: "Audits & Field Support", desc: "On-site compliance audit / inspection." },
  auditDay: { name: "In-Person Audit Day", price: 1750, unit: "Day", group: "Audits & Field Support", desc: "Billable in-person audit / site-visit day (Qty = days)." },
  fieldDay: { name: "Field Support Day", price: 1250, unit: "Day", group: "Audits & Field Support", desc: "Daily on-site field safety support (Qty = days)." },
  mileage: { name: "Travel Mileage", price: 0.7, unit: "Mile", group: "Travel & Expenses", desc: "Mileage billed per mile (Qty = miles)." },
  hotel: { name: "Hotel Night", price: 185, unit: "Night", group: "Travel & Expenses", desc: "Overnight lodging (Qty = nights)." },
  perDiem: { name: "Per Diem", price: 75, unit: "Day", group: "Travel & Expenses", desc: "Meals / incidentals (Qty = days)." },
  custom: { name: "Custom Service Line", price: 0, unit: "Unit", group: "Custom", desc: "Custom scope — set description and price." },
  osha10: { name: "OSHA 10 Training", price: 175, unit: "Person", group: "Training Catalog", desc: "Per-person training; Qty = number of people." },
  osha30: { name: "OSHA 30 Training", price: 425, unit: "Person", group: "Training Catalog", desc: "Per-person training; Qty = number of people." },
  newHire: { name: "New Hire Safety Orientation", price: 450, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  supLeader: { name: "Supervisor Safety Leadership Training", price: 850, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  toolbox: { name: "Toolbox Talk Program Development", price: 300, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  fall: { name: "Fall Protection Training", price: 650, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  ladder: { name: "Ladder Safety Training", price: 350, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  scaffold: { name: "Scaffold User Training", price: 550, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  mewp: { name: "MEWP / Aerial Lift Training", price: 850, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  forklift: { name: "Forklift / PIT Training", price: 950, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  rigging: { name: "Rigging & Signal Person Training", price: 950, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  craneAware: { name: "Crane Awareness Training", price: 750, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  confined: { name: "Confined Space Awareness Training", price: 800, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  excavation: { name: "Excavation / Trenching Safety Training", price: 800, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  loto: { name: "Lockout / Tagout Training", price: 700, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  hazcomT: { name: "Hazard Communication Training", price: 500, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  ppeT: { name: "PPE Training", price: 350, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  elecAware: { name: "Electrical Safety Awareness", price: 850, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  nfpa70e: { name: "NFPA 70E Awareness Training", price: 1100, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  hotwork: { name: "Hot Work / Fire Watch Training", price: 500, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  fireExt: { name: "Fire Extinguisher Training", price: 450, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  silica: { name: "Silica Awareness Training", price: 650, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  respiratory: { name: "Respiratory Protection Training", price: 700, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  hearing: { name: "Hearing Conservation Training", price: 450, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  heat: { name: "Heat Illness Prevention Training", price: 425, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  ergo: { name: "Ergonomics Training", price: 450, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  bbp: { name: "Bloodborne Pathogens Training", price: 400, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  firstAid: { name: "First Aid / CPR / AED Coordination", price: 1200, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  incident: { name: "Incident Investigation Training", price: 750, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  jsaT: { name: "JHA / JSA Training", price: 650, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  driving: { name: "Defensive Driving Training", price: 700, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  spotter: { name: "Spotter / Flagger Training", price: 650, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  contractorT: { name: "Contractor Management Training", price: 850, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  culture: { name: "Safety Culture Workshop", price: 1250, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
  genTraining: { name: "Training Session (general)", price: 750, unit: "Session", group: "Training Catalog", desc: "Instructor-led training session; Qty = number of sessions." },
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
 */
export const packageData = freezeCatalog({
  starter: { name: "Starter Compliance Platform", price: 35000, users: 15, sites: 1, desc: "Core compliance support for a smaller operation or early-stage platform rollout." },
  professional: { name: "Professional Safety Intelligence", price: 65000, users: 50, sites: 5, desc: "Expanded safety management platform for active jobsite operations, document control, audits, and leadership reporting." },
  enterprise: { name: "Enterprise Predictive Safety", price: 99500, users: 100, sites: 10, desc: "Full multi-site safety intelligence package with stronger predictive risk capability, AI-supported review, and executive visibility." },
  blacklabel: { name: "Black Label Strategic Program", price: 155000, users: 250, sites: 25, desc: "Strategic enterprise program for organizations requiring advanced safety intelligence, multi-site governance, and premium implementation support." },
  custom: { name: "Basic Pilot Program — Platform Access (6-Month)", price: 5000, users: 50, sites: 2, desc: "A 6-month pilot providing basic platform access for up to 50 users across 2 jobsites at a flat pilot fee, with no additional setup or licensing cost." },
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
