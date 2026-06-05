import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { retrieveReceivedEmail, verifyResendWebhook } from "@/lib/mail/resend";
import { buildThreadKey, cleanMailText, jsonRecord, normalizeMailAddress, parseAddressList, parseMailAddress } from "@/lib/mail/utils";

type EmployeeMailbox = Database["public"]["Tables"]["employee_mailboxes"]["Row"];

function getWebhookHeaders(request: NextRequest) {
  return {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  };
}

function getProviderEmailId(data: Record<string, unknown> | undefined) {
  return cleanMailText(String(data?.email_id ?? data?.id ?? ""));
}

async function recordDeliveryEvent(input: {
  eventType: string;
  providerEventId: string | null;
  providerMessageId: string | null;
  payload: unknown;
}) {
  const admin = createAdminClient();

  if (!admin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { data: message } = input.providerMessageId
    ? await admin
        .from("employee_mail_messages")
        .select("id, mailbox_id")
        .eq("provider_message_id", input.providerMessageId)
        .maybeSingle()
    : { data: null };

  const { error } = await admin.from("employee_mail_delivery_events").insert({
    message_id: message?.id ?? null,
    mailbox_id: message?.mailbox_id ?? null,
    event_type: input.eventType,
    provider_event_id: input.providerEventId,
    provider_message_id: input.providerMessageId,
    payload: jsonRecord(input.payload),
  });

  if (error?.code === "23505") {
    return { duplicate: true };
  }

  if (error) {
    throw new Error(error.message);
  }

  if (message?.id && input.eventType !== "email.received") {
    const status =
      input.eventType === "email.delivered"
        ? "delivered"
        : input.eventType === "email.bounced" || input.eventType === "email.complained"
          ? "failed"
          : input.eventType === "email.sent"
            ? "sent"
            : null;

    if (status) {
      await admin
        .from("employee_mail_messages")
        .update({
          status,
          last_provider_event_at: new Date().toISOString(),
          error_message: status === "failed" ? input.eventType : null,
        })
        .eq("id", message.id);
    }
  }

  return { duplicate: false };
}

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const headers = getWebhookHeaders(request);

  let event;

  try {
    event = verifyResendWebhook(payload, headers);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid webhook." }, { status: 400 });
  }

  const eventData = event.data ?? {};
  const providerMessageId = getProviderEmailId(eventData);
  const recorded = await recordDeliveryEvent({
    eventType: event.type,
    providerEventId: headers.id,
    providerMessageId,
    payload: event,
  });

  if (recorded.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Supabase admin client is not configured." }, { status: 500 });
  }

  const receivedEmail = await retrieveReceivedEmail(providerMessageId);
  const allRecipientAddresses = [
    ...parseAddressList(receivedEmail.to ?? []),
    ...parseAddressList(receivedEmail.cc ?? []),
    ...parseAddressList(receivedEmail.bcc ?? []),
  ];
  const uniqueRecipientAddresses = [...new Set(allRecipientAddresses.map((recipient) => recipient.address))];

  if (uniqueRecipientAddresses.length === 0) {
    return NextResponse.json({ ok: true, delivered: 0 });
  }

  const { data: mailboxes, error: mailboxError } = await admin
    .from("employee_mailboxes")
    .select("*")
    .in("address", uniqueRecipientAddresses)
    .eq("status", "active");

  if (mailboxError) {
    return NextResponse.json({ error: mailboxError.message }, { status: 500 });
  }

  const from = parseMailAddress(receivedEmail.headers?.from ?? receivedEmail.from) ?? {
    address: normalizeMailAddress(receivedEmail.from),
    name: null,
  };
  const subject = cleanMailText(receivedEmail.subject) || "(no subject)";
  const deliveredMailboxes = (mailboxes ?? []) as EmployeeMailbox[];

  for (const mailbox of deliveredMailboxes) {
    const { data: existing } = await admin
      .from("employee_mail_messages")
      .select("id")
      .eq("mailbox_id", mailbox.id)
      .eq("provider_message_id", receivedEmail.id)
      .maybeSingle();

    if (existing) {
      continue;
    }

    const { data: message, error: messageError } = await admin
      .from("employee_mail_messages")
      .insert({
        mailbox_id: mailbox.id,
        provider_message_id: receivedEmail.id,
        internet_message_id: receivedEmail.message_id ?? null,
        thread_key: buildThreadKey({
          subject,
          fromAddress: from.address,
          firstRecipientAddress: mailbox.address,
          internetMessageId: receivedEmail.message_id,
        }),
        subject,
        plain_body: cleanMailText(receivedEmail.text) || cleanMailText(receivedEmail.html),
        html_body: receivedEmail.html ?? null,
        from_address: from.address,
        from_name: from.name,
        direction: "inbound",
        status: "received",
        folder: "inbox",
        received_at: receivedEmail.created_at ?? event.created_at ?? new Date().toISOString(),
        attachment_metadata: jsonRecord(receivedEmail.attachments ?? []),
        metadata: jsonRecord({
          headers: receivedEmail.headers ?? {},
          raw: receivedEmail.raw ?? null,
        }),
      })
      .select("*")
      .single();

    if (messageError || !message) {
      return NextResponse.json({ error: messageError?.message ?? "Could not store inbound mail." }, { status: 500 });
    }

    await admin.from("employee_mail_recipients").insert(
      [
        ...parseAddressList(receivedEmail.to ?? []).map((recipient) => ({ ...recipient, recipient_type: "to" })),
        ...parseAddressList(receivedEmail.cc ?? []).map((recipient) => ({ ...recipient, recipient_type: "cc" })),
        ...parseAddressList(receivedEmail.bcc ?? []).map((recipient) => ({ ...recipient, recipient_type: "bcc" })),
      ].map((recipient) => ({
        message_id: message.id,
        mailbox_id: deliveredMailboxes.find((item) => item.address === recipient.address)?.id ?? null,
        recipient_type: recipient.recipient_type,
        address: recipient.address,
        name: recipient.name,
        delivery_status: "received",
      })),
    );

    await admin.from("portal_notifications").insert({
      recipient_user_id: mailbox.user_id,
      title: `New mail from ${from.name || from.address}`,
      body: subject,
      priority: "medium",
      source_type: "employee_mail_message",
      source_id: message.id,
      action_href: `/employee/mail?message=${message.id}`,
      metadata: jsonRecord({ from: from.address, provider_message_id: receivedEmail.id }),
    });
  }

  return NextResponse.json({ ok: true, delivered: deliveredMailboxes.length });
}
