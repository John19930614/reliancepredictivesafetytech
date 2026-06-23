import "server-only";
import OpenAI from "openai";
import type { LegalRegisterCategory, LegalRegisterJurisdiction, LegalResearchResult, ResearchedLegalItem } from "./types";

const RESEARCH_SYSTEM_PROMPT = `You are a senior regulatory compliance research expert. You compile comprehensive "legal registers" — complete inventories of every applicable law, regulation, statute, rule, standard, guideline, and policy — for ANY industry, jurisdiction, or compliance domain the user asks about.

You are domain-agnostic. Depending on the request you may cover, for example: transportation & motor carriers (DOT, FMCSA, PHMSA, FHWA), occupational safety (OSHA), environmental (EPA), data privacy & security (GDPR, CCPA, HIPAA, NIST), financial services (SEC, FINRA), healthcare (FDA, CMS), food & agriculture (FDA, USDA), construction, manufacturing, energy & utilities, aviation (FAA), maritime (USCG), labor & employment (DOL, EEOC), telecommunications (FCC), or any other regulatory area.

Cover federal, state, local, and international sources as relevant to the specific query. When the user names particular states or interstate/intrastate scope, include BOTH the relevant federal requirements AND each named state's specific requirements.

Use web search to find current, accurate, authoritative information, and cite official sources (prefer .gov sites and official standards bodies). Be exhaustive — list EVERY item genuinely applicable to the request. For a typical compliance domain this is usually 10-30+ distinct regulations; do not stop at a handful.`;

function buildResearchPrompt(query: string): string {
  return `${RESEARCH_SYSTEM_PROMPT}

USER REQUEST:
"""
${query}
"""

Research the web and identify ALL applicable laws, regulations, statutes, rules, standards, guidelines, and policies for this request. Tailor results to exactly what was asked — do not limit yourself to any single agency or domain. If the request names specific states or interstate/intrastate operations, include the relevant federal requirements AND each named state's requirements. Provide a concise summary plus a thorough, de-duplicated list of items.`;
}

const itemProperties = {
  title: { type: "string", description: "Official full name of the law/regulation/standard" },
  citation: { type: "string", description: "Legal reference, e.g. '49 CFR Part 395'. Empty string if none." },
  issuing_body: { type: "string", description: "Agency or body, e.g. 'FMCSA', 'OSHA', 'Wisconsin DOT'" },
  category: {
    type: "string",
    enum: ["federal_law", "state_law", "local_law", "federal_regulation", "state_regulation", "standard", "guideline", "policy", "other"],
  },
  jurisdiction: { type: "string", enum: ["federal", "state", "local", "international", "multi"] },
  jurisdiction_state: { type: ["string", "null"], description: "Two-letter state code if state/local, else null" },
  industry_sectors: { type: "array", items: { type: "string" } },
  description: { type: "string", description: "2-3 sentences: what it covers and why it applies" },
  compliance_requirements: { type: "string", description: "Specific actions required to comply" },
  penalties: { type: "string", description: "Penalties for non-compliance, or 'Varies'" },
  effective_date: { type: ["string", "null"], description: "YYYY-MM-DD if known, else null" },
  source_urls: { type: "array", items: { type: "string" } },
} as const;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "2-4 sentence overview of the regulatory landscape for this request" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: itemProperties,
        required: Object.keys(itemProperties),
      },
    },
  },
  required: ["summary", "items"],
} as const;

/**
 * Defensive fallback: extract the first complete, balanced JSON object from
 * arbitrary text (handles markdown fences and surrounding prose). Only used if
 * structured output is somehow not clean JSON.
 */
function extractJsonObject(text: string): string | null {
  if (!text) return null;
  let t = text.trim();

  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  const start = t.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  return null;
}

function normalizeResult(parsed: { items?: unknown; summary?: unknown }): LegalResearchResult | null {
  if (!parsed.items || !Array.isArray(parsed.items)) return null;

  const validCategories = new Set([
    "federal_law", "state_law", "local_law", "federal_regulation",
    "state_regulation", "standard", "guideline", "policy", "other",
  ]);
  const validJurisdictions = new Set(["federal", "state", "local", "international", "multi"]);

  const items: ResearchedLegalItem[] = (parsed.items as Record<string, unknown>[])
    .filter((item) => item && item.title && item.description)
    .map((item) => ({
      title: String(item.title ?? ""),
      citation: String(item.citation ?? ""),
      issuing_body: String(item.issuing_body ?? ""),
      category: (validCategories.has(String(item.category)) ? item.category : "other") as LegalRegisterCategory,
      jurisdiction: (validJurisdictions.has(String(item.jurisdiction)) ? item.jurisdiction : "federal") as LegalRegisterJurisdiction,
      jurisdiction_state: item.jurisdiction_state ? String(item.jurisdiction_state) : undefined,
      industry_sectors: Array.isArray(item.industry_sectors) ? item.industry_sectors.map(String) : [],
      description: String(item.description ?? ""),
      compliance_requirements: String(item.compliance_requirements ?? ""),
      penalties: String(item.penalties ?? ""),
      effective_date: item.effective_date ? String(item.effective_date) : undefined,
      source_urls: Array.isArray(item.source_urls) ? item.source_urls.map(String) : [],
    }));

  return { items, summary: String(parsed.summary ?? ""), query: "" };
}

function parseResearchOutput(text: string): LegalResearchResult | null {
  // Structured output should be clean JSON; try direct parse first.
  try {
    return normalizeResult(JSON.parse(text.trim()));
  } catch {
    // fall through to defensive extraction
  }

  const jsonText = extractJsonObject(text);
  if (!jsonText) return null;
  try {
    return normalizeResult(JSON.parse(jsonText));
  } catch {
    return null;
  }
}

export async function runLegalResearch(query: string): Promise<LegalResearchResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured. Add it to your environment variables.");
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_RESEARCH_MODEL || "gpt-4o-mini";

  const response = await client.responses.create({
    model,
    tools: [{ type: "web_search_preview" }],
    max_output_tokens: 32000,
    text: {
      format: {
        type: "json_schema",
        name: "legal_register",
        strict: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: responseSchema as any,
      },
    },
    input: buildResearchPrompt(query),
  });

  if (response.status === "incomplete") {
    throw new Error(
      "Research was cut off before completing (the result was too long). Try narrowing the query, e.g. one state or one regulatory domain at a time.",
    );
  }

  const text = response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => (item as { type: "message"; content: Array<{ type: string; text?: string }> }).content)
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");

  const result = parseResearchOutput(text);

  if (!result) {
    const snippet = text.slice(0, 300).replace(/\s+/g, " ").trim();
    throw new Error(
      `Research completed but the output could not be parsed. Model returned: "${snippet}…". Please try again.`,
    );
  }

  if (result.items.length === 0) {
    throw new Error("Research completed but no applicable regulations were found. Try a more specific query.");
  }

  return { ...result, query };
}
