import "server-only";
import OpenAI from "openai";
import type { LegalRegisterCategory, LegalRegisterJurisdiction, LegalResearchResult, ResearchedLegalItem } from "./types";

const RESEARCH_SYSTEM_PROMPT = `You are a senior legal compliance expert specializing in occupational safety, environmental law, data privacy, workplace regulations, and industry standards for technology companies in the United States.

Your task is to compile a comprehensive legal register — a complete inventory of all applicable laws, regulations, standards, and guidelines — for a predictive workplace safety technology platform (SaaS software that helps companies predict and prevent workplace injuries, incidents, and safety violations).

Use web search to find current, accurate information. Be exhaustive and cite official sources.

For each regulation or law found, return a JSON object with these exact fields:
{
  "title": "Official full name of the law/regulation/standard",
  "citation": "Legal reference (e.g. '29 CFR 1910.1200', '15 U.S.C. § 7001', 'ISO 45001:2018')",
  "issuing_body": "Agency or body that issued it (e.g. 'OSHA', 'EPA', 'ISO', 'ANSI', 'FTC', 'NIST')",
  "category": "one of: federal_law | state_law | local_law | federal_regulation | state_regulation | standard | guideline | policy | other",
  "jurisdiction": "one of: federal | state | local | international | multi",
  "jurisdiction_state": "Two-letter state code if state/local, otherwise null",
  "industry_sectors": ["array", "of", "applicable", "sectors"],
  "description": "2-3 sentence description of what this covers and why it applies",
  "compliance_requirements": "Specific actions the company must take to comply",
  "penalties": "Civil/criminal penalties for non-compliance (or 'Varies' if complex)",
  "effective_date": "YYYY-MM-DD format if known, otherwise null",
  "source_urls": ["https://official.gov/source/url"]
}

Return your complete response as valid JSON in this structure:
{
  "summary": "Brief overview of the regulatory landscape found",
  "items": [ ...array of regulation objects... ]
}`;

function buildResearchPrompt(query: string): string {
  return `${RESEARCH_SYSTEM_PROMPT}

Research query: "${query}"

Search the web for all applicable regulations, laws, standards, and guidelines. Cover:
1. Federal OSHA standards (29 CFR 1910, 1926, 1904, 1960)
2. EPA regulations (RMP, EPCRA, Clean Air Act, Clean Water Act)
3. DOT/HAZMAT regulations (49 CFR)
4. Data privacy laws (GDPR, CCPA, HIPAA if applicable, COPPA, state privacy laws)
5. Cybersecurity frameworks (NIST CSF, SOC 2, FTC Act Section 5)
6. Occupational safety standards (ISO 45001, ANSI Z10, OSHA VPP)
7. Industry-specific standards (NFPA, API, AIHA, ACGIH TLVs)
8. State-level OSHA plans and regulations
9. Workers compensation laws
10. ADA and EEO requirements
11. Any other applicable regulatory frameworks

Return comprehensive JSON as specified above. Include every regulation that could apply to a safety technology SaaS platform that stores employee health/safety data and helps clients maintain OSHA compliance.`;
}

function parseResearchOutput(text: string): LegalResearchResult | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.items || !Array.isArray(parsed.items)) return null;

    const validCategories = new Set([
      "federal_law", "state_law", "local_law", "federal_regulation",
      "state_regulation", "standard", "guideline", "policy", "other",
    ]);
    const validJurisdictions = new Set(["federal", "state", "local", "international", "multi"]);

    const items: ResearchedLegalItem[] = parsed.items
      .filter((item: Record<string, unknown>) => item.title && item.description)
      .map((item: Record<string, unknown>) => ({
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

    return {
      items,
      summary: String(parsed.summary ?? ""),
      query: "",
    };
  } catch {
    return null;
  }
}

export async function runLegalResearch(query: string): Promise<LegalResearchResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured. Add it to your .env.local file.");
  }

  const client = new OpenAI({ apiKey });

  const response = await client.responses.create({
    model: "gpt-4o",
    tools: [{ type: "web_search_preview" }],
    input: buildResearchPrompt(query),
  });

  const text = response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => (item as { type: "message"; content: Array<{ type: string; text?: string }> }).content)
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");

  const result = parseResearchOutput(text);

  if (!result) {
    throw new Error("Research completed but output could not be parsed as structured data. Try again.");
  }

  return { ...result, query };
}
