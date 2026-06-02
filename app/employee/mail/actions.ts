"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { getEmployeeMailResendClient } from "@/lib/mail/resend";
import {
  buildFromHeader,
  buildMailboxAddress,
  buildThreadKey,
  cleanMailText,
  flattenRecipients,
  jsonRecord,
  normalizeMailAddress,
  parseMailRecipients,
  textToBasicHtml,
} from "@/lib/mail/utils";

type EmployeeMailbox = Database["public"]["Tables"]["employee_mailboxes"]["Row"];
type EmployeeMailMessage = Database["public"]["Tables"]["employee_mail_messages"]["Row"];
type EmployeeMailRecipientInsert = Database["public"]["Tables"]["employee_mail_recipients"]["Insert"];

export type EmployeeMailSendInput = {
  draftId?: string | null;
  to: string;
  cc?: string | null;
  bcc?: string | null;
  subject: string;
  body: string;
};

export type EmployeeMailActionResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

export type EmployeeMailMoveTarget = "inbox" | "archive" | "trash";

async function getAuthenticatedMailbox() {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to use employee mail.");
  }

  const [{ data: role, error: roleError }, { data: mailbox, error: mailboxError }] = await Promise.all([
    supabase
      .from("user_roles")
      .select("role, account_status")
      .eq("user_id", user.id)
      .eq("account_status", "active")
      .maybeSingle(),
    supabase
      .from("employee_mailboxes")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (roleError) {
    throw new Error(roleError.message);
  }

  if (!role) {
    throw new Error("Only active employees can use employee mail.");
  }

  if (mailboxError) {
    throw new Error(mailboxError.message);
  }

  if (!mailbox) {
    throw new Error("Ask an admin to assign your employee mail alias before sending mail.");
  }

  return { supabase, user, mailbox: mailbox as EmployeeMailbox };
}

function getAdminClient() {
  const admin = createAdminClient();

  if (!admin) {
    throw new Error("Add SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY before using employee mail.");
  }

  return admin;
}

async function getInternalMailboxMap(addresses: string[]) {
  const uniqueAddresses = [...new Set(addresses.map(normalizeMailAddress).filter(Boolean))];

  if (uniqueAddresses.length === 0) {
    return new Map<string, EmployeeMailbox>();
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("employee_mailboxes")
    .select("*")
    .in("address", uniqueAddresses)
    .eq("status", "active");

  if (error) {
    throw new Error(error.message);
  }

  return new Map(((data ?? []) as EmployeeMailbox[]).map((mailbox) => [mailbox.address, mailbox]));
}

async function replaceRecipients(messageId: string, recipients: EmployeeMailRecipientInsert[]) {
  const admin = getAdminClient();
  const { error: deleteError } = await admin.from("employee_mail_recipients").delete().eq("message_id", messageId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (recipients.length === 0) {
    return;
  }

  const { error } = await admin.from("employee_mail_recipients").insert(recipients);

  if (error) {
    throw new Error(error.message);
  }
}

async function saveEmployeeMailDraftUnsafe(input: EmployeeMailSendInput): Promise<EmployeeMailMessage> {
  const { mailbox, user } = await getAuthenticatedMailbox();
  const admin = getAdminClient();
  const recipients = parseMailRecipients(input);
  const allRecipients = flattenRecipients(recipients);
  const internalMailboxMap = await getInternalMailboxMap(allRecipients.map((recipient) => recipient.address));
  const cleanSubject = cleanMailText(input.subject);
  const cleanBody = cleanMailText(input.body);
  const draftId = cleanMailText(input.draftId);
  const messagePatch = {
    mailbox_id: mailbox.id,
    thread_key: buildThreadKey({
      subject: cleanSubject,
      fromAddress: mailbox.address,
      firstRecipientAddress: allRecipients[0]?.address,
    }),
    subject: cleanSubject,
    plain_body: cleanBody,
    html_body: cleanBody ? textToBasicHtml(cleanBody) : null,
    from_address: mailbox.address,
    from_name: mailbox.display_name,
    direction: "draft",
    status: "draft",
    folder: "drafts",
    created_by: user.id,
  };

  const result = draftId
    ? await admin
        .from("employee_mail_messages")
        .update(messagePatch)
        .eq("id", draftId)
        .eq("mailbox_id", mailbox.id)
        .eq("status", "draft")
        .select("*")
        .single()
    : await admin.from("employee_mail_messages").insert(messagePatch).select("*").single();

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Could not save draft.");
  }

  await replaceRecipients(
    result.data.id,
    allRecipients.map((recipient) => ({
      message_id: result.data.id,
      mailbox_id: internalMailboxMap.get(recipient.address)?.id ?? null,
      recipient_type: recipient.recipientType,
      address: recipient.address,
      name: recipient.name,
      delivery_status: internalMailboxMap.has(recipient.address) ? "internal" : "pending",
    })),
  );

  revalidatePath("/employee/mail");
  return result.data as EmployeeMailMessage;
}

export async function saveEmployeeMailDraft(input: EmployeeMailSendInput): Promise<EmployeeMailActionResult<EmployeeMailMessage>> {
  try {
    return {
      ok: true,
      data: await saveEmployeeMailDraftUnsafe(input),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save draft.",
    };
  }
}

async function sendEmployeeMailUnsafe(input: EmployeeMailSendInput): Promise<EmployeeMailMessage> {
  const { mailbox, user } = await getAuthenticatedMailbox();
  const admin = getAdminClient();
  const recipients = parseMailRecipients(input);
  const allRecipients = flattenRecipients(recipients);

  if (allRecipients.length === 0 || recipients.to.length === 0) {
    throw new Error("Add at least one recipient in the To field.");
  }

  const subject = cleanMailText(input.subject) || "(no subject)";
  const body = cleanMailText(input.body);

  if (!body) {
    throw new Error("Type a message before sending.");
  }

  const internalMailboxMap = await getInternalMailboxMap(allRecipients.map((recipient) => recipient.address));
  const externalRecipients = allRecipients.filter((recipient) => !internalMailboxMap.has(recipient.address));
  const now = new Date().toISOString();
  const messagePayload = {
    mailbox_id: mailbox.id,
    thread_key: buildThreadKey({
      subject,
      fromAddress: mailbox.address,
      firstRecipientAddress: allRecipients[0]?.address,
    }),
    subject,
    plain_body: body,
    html_body: textToBasicHtml(body),
    from_address: mailbox.address,
    from_name: mailbox.display_name,
    direction: "outbound",
    status: externalRecipients.length > 0 ? "queued" : "delivered",
    folder: "sent",
    sent_at: now,
    read_at: now,
    created_by: user.id,
  };

  const draftId = cleanMailText(input.draftId);
  const messageResult = draftId
    ? await admin
        .from("employee_mail_messages")
        .update(messagePayload)
        .eq("id", draftId)
        .eq("mailbox_id", mailbox.id)
        .select("*")
        .single()
    : await admin.from("employee_mail_messages").insert(messagePayload).select("*").single();

  if (messageResult.error || !messageResult.data) {
    throw new Error(messageResult.error?.message ?? "Could not create sent mail.");
  }

  const sentMessage = messageResult.data as EmployeeMailMessage;
  const recipientRows = allRecipients.map((recipient) => ({
    message_id: sentMessage.id,
    mailbox_id: internalMailboxMap.get(recipient.address)?.id ?? null,
    recipient_type: recipient.recipientType,
    address: recipient.address,
    name: recipient.name,
    delivery_status: internalMailboxMap.has(recipient.address) ? "internal" : "pending",
  }));

  await replaceRecipients(sentMessage.id, recipientRows);

  for (const recipient of allRecipients) {
    const recipientMailbox = internalMailboxMap.get(recipient.address);

    if (!recipientMailbox || recipientMailbox.id === mailbox.id) {
      continue;
    }

    const { data: inboundCopy, error: inboundError } = await admin
      .from("employee_mail_messages")
      .insert({
        mailbox_id: recipientMailbox.id,
        thread_key: sentMessage.thread_key,
        subject,
        plain_body: body,
        html_body: textToBasicHtml(body),
        from_address: mailbox.address,
        from_name: mailbox.display_name,
        direction: "inbound",
        status: "received",
        folder: "inbox",
        received_at: now,
        created_by: user.id,
        metadata: jsonRecord({ internal_source_message_id: sentMessage.id }),
      })
      .select("*")
      .single();

    if (inboundError || !inboundCopy) {
      throw new Error(inboundError?.message ?? "Could not deliver internal mail.");
    }

    await admin.from("employee_mail_recipients").insert(
      allRecipients.map((item) => ({
        message_id: inboundCopy.id,
        mailbox_id: internalMailboxMap.get(item.address)?.id ?? null,
        recipient_type: item.recipientType,
        address: item.address,
        name: item.name,
        delivery_status: internalMailboxMap.has(item.address) ? "internal" : "pending",
      })),
    );

    await admin.from("portal_notifications").insert({
      recipient_user_id: recipientMailbox.user_id,
      title: `New mail from ${mailbox.display_name || mailbox.address}`,
      body: subject,
      priority: "medium",
      source_type: "employee_mail_message",
      source_id: inboundCopy.id,
      action_href: `/employee/mail?message=${inboundCopy.id}`,
      metadata: jsonRecord({ from: mailbox.address, subject }),
    });
  }

  if (externalRecipients.length > 0) {
    const resend = getEmployeeMailResendClient();

    if (!resend) {
      await admin
        .from("employee_mail_messages")
        .update({ status: "failed", error_message: "RESEND_API_KEY is not configured." })
        .eq("id", sentMessage.id);
      throw new Error("RESEND_API_KEY is not configured.");
    }

    const externalTo = recipients.to.filter((recipient) => !internalMailboxMap.has(recipient.address)).map((recipient) => recipient.address);
    const externalCc = recipients.cc.filter((recipient) => !internalMailboxMap.has(recipient.address)).map((recipient) => recipient.address);
    const externalBcc = recipients.bcc.filter((recipient) => !internalMailboxMap.has(recipient.address)).map((recipient) => recipient.address);
    const fallbackTo = externalTo.length > 0 ? externalTo : [externalRecipients[0].address];
    const safeExternalCc = externalTo.length > 0 ? externalCc : externalCc.filter((address) => address !== fallbackTo[0]);
    const safeExternalBcc = externalTo.length > 0 ? externalBcc : externalBcc.filter((address) => address !== fallbackTo[0]);
    const sendResult = await resend.emails.send({
      from: buildFromHeader(mailbox.display_name, mailbox.address),
      to: fallbackTo,
      cc: safeExternalCc,
      bcc: safeExternalBcc,
      subject,
      text: body,
      html: textToBasicHtml(body),
      replyTo: mailbox.address,
      tags: [
        { name: "source", value: "employee_mail" },
        { name: "mailbox_id", value: mailbox.id },
        { name: "message_id", value: sentMessage.id },
      ],
    });

    if (sendResult.error) {
      await admin
        .from("employee_mail_messages")
        .update({ status: "failed", error_message: sendResult.error.message })
        .eq("id", sentMessage.id);
      throw new Error(sendResult.error.message);
    }

    await admin
      .from("employee_mail_messages")
      .update({
        status: "sent",
        provider_message_id: sendResult.data?.id ?? null,
        error_message: null,
      })
      .eq("id", sentMessage.id);

    await admin
      .from("employee_mail_recipients")
      .update({
        delivery_status: "sent",
        provider_message_id: sendResult.data?.id ?? null,
      })
      .eq("message_id", sentMessage.id)
      .is("mailbox_id", null);
  }

  revalidatePath("/employee/mail");
  return sentMessage;
}

export async function sendEmployeeMail(input: EmployeeMailSendInput): Promise<EmployeeMailActionResult<EmployeeMailMessage>> {
  try {
    return {
      ok: true,
      data: await sendEmployeeMailUnsafe(input),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not send message.",
    };
  }
}

export async function moveEmployeeMailMessage(messageId: string, target: EmployeeMailMoveTarget) {
  const { mailbox } = await getAuthenticatedMailbox();
  const cleanMessageId = cleanMailText(messageId);
  const now = new Date().toISOString();
  const folderPatch =
    target === "archive"
      ? { folder: "archive", archived_at: now, deleted_at: null }
      : target === "trash"
        ? { folder: "trash", deleted_at: now }
        : { folder: "inbox", archived_at: null, deleted_at: null };

  const { error } = await getAdminClient()
    .from("employee_mail_messages")
    .update(folderPatch)
    .eq("id", cleanMessageId)
    .eq("mailbox_id", mailbox.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/employee/mail");
}

export async function markEmployeeMailRead(messageId: string, read: boolean) {
  const { mailbox } = await getAuthenticatedMailbox();
  const { error } = await getAdminClient()
    .from("employee_mail_messages")
    .update({ read_at: read ? new Date().toISOString() : null })
    .eq("id", cleanMailText(messageId))
    .eq("mailbox_id", mailbox.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/employee/mail");
}

export async function assignEmployeeMailbox(formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in as an admin.");
  }

  const { data: role, error: roleError } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .eq("account_status", "active")
    .maybeSingle();

  if (roleError) {
    throw new Error(roleError.message);
  }

  if (!role || !["platform_admin", "super_admin", "company_admin", "admin"].includes(role.role)) {
    throw new Error("Admin access is required to assign mailboxes.");
  }

  const targetUserId = cleanMailText(String(formData.get("user_id") ?? ""));
  const alias = cleanMailText(String(formData.get("alias") ?? ""));
  const displayName = cleanMailText(String(formData.get("display_name") ?? ""));
  const address = buildMailboxAddress(alias);

  if (!targetUserId) {
    throw new Error("Choose an employee before assigning a mailbox.");
  }

  const { error } = await getAdminClient().from("employee_mailboxes").upsert(
    {
      user_id: targetUserId,
      address,
      display_name: displayName || null,
      status: "active",
      created_by: user.id,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/employee/mail");
}
