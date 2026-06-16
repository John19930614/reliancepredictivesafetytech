import "server-only";

import { Resend } from "resend";
import { COMPANY_NAME } from "@/lib/company-data";

export const NOTIFICATION_FROM =
  process.env.RESEND_FROM_EMAIL || `${COMPANY_NAME} <notifications@safety360docs.com>`;

export function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }

  return new Resend(process.env.RESEND_API_KEY);
}
