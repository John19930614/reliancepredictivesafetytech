export const leadConfidenceLevels = ["low", "medium", "high"] as const;
export type LeadConfidence = (typeof leadConfidenceLevels)[number];

export const leadTriageStatuses = ["suggested", "accepted", "dismissed"] as const;
export type LeadTriageStatus = (typeof leadTriageStatuses)[number];

/** The subset of a demo_request the model is allowed to see. */
export interface TriageLeadInput {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  company_type: string | null;
  interested_products: string[] | null;
  message: string | null;
  status: string | null;
  created_at: string | null;
}

export interface TriageFinding {
  lead_id: string;
  priority_score: number;
  segment: string;
  next_step: string;
  rationale: string;
  confidence: LeadConfidence;
}

export interface TriageResult {
  findings: TriageFinding[];
  summary: string;
}

/** Strict JSON schema for the Responses API. */
export const leadTriageResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "findings"],
  properties: {
    summary: {
      type: "string",
      description: "Two or three sentences describing the shape of today's lead pool.",
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["lead_id", "priority_score", "segment", "next_step", "rationale", "confidence"],
        properties: {
          lead_id: { type: "string", description: "Must exactly match an id from the supplied leads." },
          priority_score: {
            type: "number",
            description: "0-100. Higher means work it sooner.",
          },
          segment: {
            type: "string",
            description: "Short bucket, e.g. 'Enterprise construction' or 'Small contractor'.",
          },
          next_step: {
            type: "string",
            description: "One concrete next action a salesperson can take today.",
          },
          rationale: { type: "string", description: "Why this priority and this next step." },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
  },
} as const;

const SYSTEM_RULES = [
  "You are triaging inbound sales leads for an industrial safety software company.",
  "Rank by how likely the lead is to convert and how urgent the follow-up is.",
  "Weigh: company size signals, role seniority, stated products of interest, urgency in the message, and how long the lead has been waiting.",
  "next_step must be a single concrete action (e.g. 'Call the safety director to book a 20-minute SafePredict demo'), never a vague 'follow up'.",
  "Only reference the leads supplied. Never invent a lead, a company, or contact details.",
  "Return one finding per supplied lead, and echo lead_id exactly.",
].join(" ");

/** Builds the model input. Leads are passed as JSON so ids round-trip exactly. */
export function buildLeadTriagePrompt(leads: readonly TriageLeadInput[], today: string): string {
  const compact = leads.map((lead) => ({
    id: lead.id,
    name: lead.name,
    company: lead.company,
    role: lead.role,
    company_type: lead.company_type,
    interested_products: lead.interested_products,
    message: lead.message,
    status: lead.status,
    received_at: lead.created_at,
  }));

  return [
    SYSTEM_RULES,
    `Today is ${today}.`,
    `Here are ${leads.length} lead(s) to triage:`,
    JSON.stringify(compact, null, 2),
  ].join("\n\n");
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

function asConfidence(value: unknown): LeadConfidence {
  return leadConfidenceLevels.includes(value as LeadConfidence) ? (value as LeadConfidence) : "low";
}

/**
 * Parses and hardens model output.
 *
 * Drops any finding whose lead_id was not in the request (a hallucinated lead
 * must never reach the database), de-duplicates repeats keeping the
 * highest-scoring one, and returns findings sorted by descending score.
 */
export function parseLeadTriageOutput(raw: string, allowedLeadIds: readonly string[]): TriageResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as { summary?: unknown; findings?: unknown };
  if (!Array.isArray(obj.findings)) return null;

  const allowed = new Set(allowedLeadIds);
  const byLead = new Map<string, TriageFinding>();

  for (const item of obj.findings) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const leadId = typeof f.lead_id === "string" ? f.lead_id : "";
    if (!allowed.has(leadId)) continue;

    const nextStep = typeof f.next_step === "string" ? f.next_step.trim() : "";
    if (!nextStep) continue;

    const finding: TriageFinding = {
      lead_id: leadId,
      priority_score: clampScore(f.priority_score),
      segment: typeof f.segment === "string" ? f.segment.trim() : "Unsegmented",
      next_step: nextStep,
      rationale: typeof f.rationale === "string" ? f.rationale.trim() : "",
      confidence: asConfidence(f.confidence),
    };

    const existing = byLead.get(leadId);
    if (!existing || finding.priority_score > existing.priority_score) {
      byLead.set(leadId, finding);
    }
  }

  const findings = [...byLead.values()].sort((a, b) => b.priority_score - a.priority_score);

  return {
    findings,
    summary: typeof obj.summary === "string" ? obj.summary.trim() : "",
  };
}

/** Assigns 1-based ranks after sorting; ties break on lead_id for stability. */
export function rankFindings(findings: readonly TriageFinding[]): Array<TriageFinding & { priority_rank: number }> {
  return [...findings]
    .sort((a, b) => b.priority_score - a.priority_score || a.lead_id.localeCompare(b.lead_id))
    .map((finding, index) => ({ ...finding, priority_rank: index + 1 }));
}

/** Low-confidence or high-value suggestions always get a human before action. */
export function requiresHumanReview(finding: Pick<TriageFinding, "confidence" | "priority_score">): boolean {
  return finding.confidence !== "high" || finding.priority_score >= 80;
}
