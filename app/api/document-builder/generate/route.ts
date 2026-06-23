import { NextResponse } from "next/server";
import { getDocumentAccess } from "@/lib/documents/access";
import { generateSafetyDocument } from "@/lib/documents/builder";
import { documentToMarkdown } from "@/lib/documents/schema";
import { docTypes, type DocType, type DocumentBuilderInput } from "@/lib/documents/types";
import { validateAIOutput } from "@/lib/ai/gateway";
import { recordAuditEvent } from "@/lib/audit/events";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { supabase, userId, isAdmin } = await getDocumentAccess();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (!isAdmin) return NextResponse.json({ error: "Admin role required to generate documents." }, { status: 403 });

  let input: DocumentBuilderInput;
  try {
    input = (await req.json()) as DocumentBuilderInput;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const docType = input.doc_type as DocType;
  if (!docTypes.includes(docType)) {
    return NextResponse.json({ error: "doc_type must be 'sop' or 'policy'." }, { status: 400 });
  }
  if (!input.title || !input.title.trim()) {
    return NextResponse.json({ error: "A document title is required." }, { status: 400 });
  }

  const { data: generation, error: genError } = await supabase
    .from("document_builder_generations")
    .insert({
      user_id: userId,
      doc_type: docType,
      title: input.title.trim(),
      inputs: input,
      status: "running",
    })
    .select("id")
    .single();

  if (genError || !generation) {
    return NextResponse.json({ error: "Failed to start generation run." }, { status: 500 });
  }

  try {
    const result = await generateSafetyDocument(input);
    const markdown = documentToMarkdown(result);

    // AI Gateway — official-workflow content must pass validateAIOutput().
    const gateway = validateAIOutput({ rawOutput: markdown });
    if (gateway.status === "blocked") {
      await supabase
        .from("document_builder_generations")
        .update({
          status: "error",
          gateway_status: gateway.status,
          error_message: gateway.blockedReason || "AI gateway blocked output",
          completed_at: new Date().toISOString(),
        })
        .eq("id", generation.id);
      return NextResponse.json({ error: "Document output was blocked by the AI safety gateway." }, { status: 422 });
    }

    // Human Authority Rule: every generated SOP/Policy must be human-reviewed and
    // approved before it can be published. Always land in needs_review.
    const { data: draft, error: draftError } = await supabase
      .from("document_builder_drafts")
      .insert({
        generation_id: generation.id,
        doc_type: docType,
        title: result.title,
        sections: result.sections,
        body_markdown: markdown,
        review_status: "needs_review",
        human_review_required: true,
        confidence_level: result.confidence_level,
        created_by: userId,
      })
      .select("*")
      .single();

    if (draftError || !draft) {
      await supabase
        .from("document_builder_generations")
        .update({ status: "error", error_message: "Failed to save draft", completed_at: new Date().toISOString() })
        .eq("id", generation.id);
      return NextResponse.json({ error: "Generated document could not be saved." }, { status: 500 });
    }

    await supabase
      .from("document_builder_generations")
      .update({ status: "needs_review", gateway_status: gateway.status, completed_at: new Date().toISOString() })
      .eq("id", generation.id);

    await recordAuditEvent({
      event_type: "ai.document_generated",
      event_category: "ai",
      severity: gateway.status === "pass" ? "info" : "warn",
      actor_id: userId,
      resource_type: "document_builder_draft",
      resource_id: draft.id,
      summary: `Generated ${docType.toUpperCase()} draft "${result.title}" (gateway: ${gateway.status})`,
      after_state: { gatewayStatus: gateway.status, confidence: result.confidence_level, reviewNotes: result.review_notes },
    });

    return NextResponse.json({ generationId: generation.id, draftId: draft.id, draft, gatewayStatus: gateway.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await supabase
      .from("document_builder_generations")
      .update({ status: "error", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", generation.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
