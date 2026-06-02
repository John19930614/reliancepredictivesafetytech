import "server-only";

import { getResendClient } from "@/lib/email/resend";

export type ResendWebhookHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: Record<string, unknown>;
};

export function getEmployeeMailResendClient() {
  return getResendClient();
}

export function verifyResendWebhook(payload: string, headers: ResendWebhookHeaders): ResendWebhookEvent {
  const resend = getEmployeeMailResendClient();
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!resend || !webhookSecret) {
    throw new Error("Resend webhook verification is not configured.");
  }

  if (!headers.id || !headers.timestamp || !headers.signature) {
    throw new Error("Missing Resend webhook signature headers.");
  }

  return resend.webhooks.verify({
    payload,
    headers: {
      id: headers.id,
      timestamp: headers.timestamp,
      signature: headers.signature,
    },
    webhookSecret,
  }) as unknown as ResendWebhookEvent;
}

export async function retrieveReceivedEmail(emailId: string) {
  const resend = getEmployeeMailResendClient();

  if (!resend) {
    throw new Error("Resend is not configured.");
  }

  const result = await resend.emails.receiving.get(emailId);

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Could not retrieve the received email.");
  }

  return result.data as unknown as {
    id: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    from?: string;
    created_at?: string;
    subject?: string | null;
    html?: string | null;
    text?: string | null;
    headers?: Record<string, string | undefined>;
    message_id?: string | null;
    raw?: unknown;
    attachments?: unknown[];
  };
}
