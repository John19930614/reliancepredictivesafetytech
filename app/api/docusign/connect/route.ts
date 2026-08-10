import { NextResponse } from "next/server";
import { getDocusignConfig } from "@/lib/docusign/config";
import { parseDocusignWebhookEvent, verifyDocusignHmac } from "@/lib/docusign/client";
import { recordDocusignEnvelopeEvent } from "@/lib/proposals/docusign";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let config;
  try {
    config = getDocusignConfig();
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "DocuSign is not configured." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-docusign-signature-1");
  if (!verifyDocusignHmac(rawBody, signature, config.webhookSecret)) {
    return NextResponse.json({ ok: false, error: "Invalid DocuSign signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
  }

  const event = parseDocusignWebhookEvent(payload);
  if (!event.envelopeId) {
    return NextResponse.json({ ok: false, error: "Missing envelope id." }, { status: 400 });
  }

  const result = await recordDocusignEnvelopeEvent({
    envelopeId: event.envelopeId,
    status: event.status,
    occurredAt: event.occurredAt,
    payload,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ignored: result.ignored ?? false });
}
