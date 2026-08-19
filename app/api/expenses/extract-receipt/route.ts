import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getExpenseAccess } from "@/lib/expenses/access";
import { MAX_RECEIPT_BYTES_FOR_EXTRACTION, SUPPORTED_RECEIPT_MIME_TYPES, runReceiptExtraction } from "@/lib/expenses/receipt-extraction";
import { isEmptyExtraction } from "@/lib/expenses/receipt-extraction-schema";
import { validateAIOutput } from "@/lib/ai/gateway";
import { recordAuditEvent } from "@/lib/audit/events";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

function isSupportedMimeType(value: string): value is (typeof SUPPORTED_RECEIPT_MIME_TYPES)[number] {
  return (SUPPORTED_RECEIPT_MIME_TYPES as readonly string[]).includes(value);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const access = await getExpenseAccess(supabase, user.id);
  if (!access.active || !access.canUseExpenses) {
    return NextResponse.json({ error: "Expense access is required for this account." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = formData.get("receipt");
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: "Attach a receipt file." }, { status: 400 });
  }

  if (!isSupportedMimeType(file.type)) {
    return NextResponse.json({
      suggestion: null,
      skipped: true,
      message: "AI autofill supports JPG, PNG, or WebP receipt photos for now — this file can still be uploaded and filed manually.",
    });
  }

  if (file.size > MAX_RECEIPT_BYTES_FOR_EXTRACTION) {
    return NextResponse.json({ error: "Receipt image is too large for AI autofill (15MB max)." }, { status: 400 });
  }

  const requestId = randomUUID();

  try {
    const bytes = await file.arrayBuffer();
    const fileBase64 = Buffer.from(bytes).toString("base64");

    const outcome = await runReceiptExtraction({ fileBase64, mimeType: file.type, userId: user.id });

    if (!outcome.ok) {
      if (outcome.reason === "budget_denied") {
        return NextResponse.json({ suggestion: null, denied: true, message: outcome.message });
      }
      await recordAuditEvent({
        event_type: "ai.expense_receipt_extraction_failed",
        event_category: "ai",
        severity: "warn",
        actor_id: user.id,
        resource_type: "employee_expense_receipt_extraction",
        resource_id: requestId,
        summary: `Receipt extraction returned unparseable output (request ${requestId})`,
      });
      return NextResponse.json({
        suggestion: null,
        message: "AI could not read that receipt clearly — enter the expense details manually.",
      });
    }

    const gateway = validateAIOutput({
      promptKey: "expense_receipt_extraction",
      rawOutput: outcome.rawText,
      expectedSchema: { vendor: "", amount: "", expense_date: "", category: "" },
    });

    await recordAuditEvent({
      event_type: "ai.expense_receipt_extracted",
      event_category: "ai",
      severity: gateway.status === "blocked" ? "error" : gateway.status === "fail" ? "warn" : "info",
      actor_id: user.id,
      resource_type: "employee_expense_receipt_extraction",
      resource_id: requestId,
      summary: `Extracted an expense receipt suggestion for ${user.id} (gateway: ${gateway.status})`,
      after_state: {
        gatewayStatus: gateway.status,
        confidence: gateway.overallConfidence,
        model: outcome.model,
        vendor: outcome.result.vendor,
        category: outcome.result.category,
      },
    });

    if (gateway.status === "blocked") {
      return NextResponse.json({
        suggestion: null,
        blocked: true,
        message: "AI output was blocked by the safety gateway — enter the expense details manually.",
      });
    }

    if (isEmptyExtraction(outcome.result)) {
      return NextResponse.json({
        suggestion: null,
        message: "AI could not read details from that receipt — enter the expense details manually.",
      });
    }

    // Human Authority Rule: this is always a suggestion for the employee to
    // review and edit. Nothing is written to employee_expense_reports here —
    // the employee must still submit the create-expense form themselves.
    return NextResponse.json({
      suggestion: outcome.result,
      requiresHumanReview: true,
      gatewayStatus: gateway.status,
      confidence: gateway.overallConfidence,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await recordAuditEvent({
      event_type: "ai.expense_receipt_extraction_error",
      event_category: "ai",
      severity: "error",
      actor_id: user.id,
      resource_type: "employee_expense_receipt_extraction",
      resource_id: requestId,
      summary: `Receipt extraction errored (request ${requestId}): ${message}`,
    });
    return NextResponse.json({ suggestion: null, message: "AI autofill is unavailable right now — enter the expense details manually." });
  }
}
