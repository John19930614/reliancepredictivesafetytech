import { NextResponse } from "next/server";
import { runLegalResearch } from "@/lib/legal/research";
import { validateAIOutput } from "@/lib/ai/gateway";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole } from "@/lib/user-management";
import type { ResearchedLegalItem } from "@/lib/legal/types";

export const maxDuration = 120;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFrom = any;

/**
 * Coerces a model-supplied date into a strict YYYY-MM-DD string suitable for a
 * Postgres `date` column, or null. The model sometimes returns free text like
 * "January 1, 2024", "Varies", or "Ongoing" — passing those to a date column
 * crashes the entire insert, so anything non-parseable becomes null.
 */
function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_status", "active")
    .maybeSingle();

  if (!isPortalAdminRole(roleRow?.role)) {
    return NextResponse.json({ error: "Admin role required to run legal research." }, { status: 403 });
  }

  let query: string;
  try {
    const body = await req.json();
    query = typeof body.query === "string" ? body.query.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!query) {
    return NextResponse.json({ error: "Research query is required." }, { status: 400 });
  }

  const db = supabase as AnyFrom;

  const { data: session, error: sessionError } = await db
    .from("legal_research_sessions")
    .insert({
      query,
      model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4o-mini",
      status: "running",
      researched_by: user.id,
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Failed to create research session." }, { status: 500 });
  }

  try {
    const result = await runLegalResearch(query);

    const gatewayCheck = validateAIOutput({
      rawOutput: result.summary + " " + result.items.map((i) => i.description).join(" "),
    });

    if (gatewayCheck.status === "blocked") {
      await db
        .from("legal_research_sessions")
        .update({ status: "failed", error_message: "AI gateway blocked output", completed_at: new Date().toISOString() })
        .eq("id", session.id);

      return NextResponse.json({ error: "Research output was blocked by the AI safety gateway." }, { status: 422 });
    }

    await db
      .from("legal_research_sessions")
      .update({
        status: "completed",
        items_found: result.items.length,
        completed_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    return NextResponse.json({
      sessionId: session.id,
      query: result.query,
      summary: result.summary,
      items: result.items,
      gatewayStatus: gatewayCheck.status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    await db
      .from("legal_research_sessions")
      .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", session.id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_status", "active")
    .maybeSingle();

  if (!isPortalAdminRole(roleRow?.role)) {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  let body: { items: ResearchedLegalItem[]; query: string; sessionId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "No items to save." }, { status: 400 });
  }

  // De-duplicate by title (case-insensitive, trimmed). A single Postgres
  // ON CONFLICT upsert fails if the same conflict key appears twice in one
  // batch, so we keep only the last occurrence of each title.
  const byTitle = new Map<string, ResearchedLegalItem>();
  for (const item of body.items) {
    const key = (item.title || "").trim().toLowerCase();
    if (!key) continue;
    byTitle.set(key, item);
  }

  const rows = [...byTitle.values()].map((item) => ({
    title: item.title.trim(),
    citation: item.citation || null,
    issuing_body: item.issuing_body || null,
    category: item.category,
    jurisdiction: item.jurisdiction,
    jurisdiction_state: item.jurisdiction_state || null,
    industry_sectors: item.industry_sectors,
    description: item.description,
    compliance_requirements: item.compliance_requirements,
    penalties: item.penalties,
    effective_date: normalizeDate(item.effective_date),
    source_urls: item.source_urls,
    ai_researched: true,
    ai_research_query: body.query,
    created_by: user.id,
  }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid items to save (missing titles)." }, { status: 400 });
  }

  const db = supabase as AnyFrom;

  const { data: saved, error } = await db
    .from("legal_register_items")
    .upsert(rows, { onConflict: "title" })
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const savedCount = Array.isArray(saved) ? saved.length : rows.length;

  if (body.sessionId) {
    await db
      .from("legal_research_sessions")
      .update({ items_saved: savedCount })
      .eq("id", body.sessionId);
  }

  return NextResponse.json({ saved: savedCount });
}
