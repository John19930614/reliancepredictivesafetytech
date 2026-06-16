import crypto from "crypto";
import { COMPANY_NAME } from "@/lib/company-data";
import type { Json } from "@/lib/supabase/types";

const DEFAULT_EMPLOYEE_MAIL_DOMAIN = "mail.reliancepredictivesafety.com";

type ParsedMailAddress = {
  address: string;
  name: string | null;
};

type ParsedMailRecipients = {
  to: ParsedMailAddress[];
  cc: ParsedMailAddress[];
  bcc: ParsedMailAddress[];
};

const EMAIL_WITH_NAME_PATTERN = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/;

function getEmployeeMailDomain() {
  return (process.env.EMPLOYEE_MAIL_DOMAIN || DEFAULT_EMPLOYEE_MAIL_DOMAIN).trim().toLowerCase();
}

function getEmployeeMailFromName() {
  return (process.env.EMPLOYEE_MAIL_FROM_NAME || COMPANY_NAME).trim() || COMPANY_NAME;
}

export function cleanMailText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

export function normalizeMailAddress(value: string | null | undefined) {
  const cleanValue = cleanMailText(value);
  const match = cleanValue.match(EMAIL_WITH_NAME_PATTERN);
  const address = (match?.[2] ?? cleanValue).trim().toLowerCase();

  return address.replace(/^mailto:/, "");
}

export function parseMailAddress(value: string | null | undefined): ParsedMailAddress | null {
  const cleanValue = cleanMailText(value);

  if (!cleanValue) {
    return null;
  }

  const match = cleanValue.match(EMAIL_WITH_NAME_PATTERN);
  const address = normalizeMailAddress(match?.[2] ?? cleanValue);

  if (!address || !address.includes("@")) {
    return null;
  }

  return {
    address,
    name: cleanMailText(match?.[1]).replace(/^"|"$/g, "") || null,
  };
}

export function parseAddressList(value: string | string[] | null | undefined): ParsedMailAddress[] {
  const rawItems = Array.isArray(value) ? value : cleanMailText(value).split(/[,\n;]/);
  const unique = new Map<string, ParsedMailAddress>();

  for (const rawItem of rawItems) {
    const parsed = parseMailAddress(rawItem);

    if (parsed) {
      unique.set(parsed.address, parsed);
    }
  }

  return [...unique.values()];
}

export function parseMailRecipients(input: {
  to?: string | string[] | null;
  cc?: string | string[] | null;
  bcc?: string | string[] | null;
}): ParsedMailRecipients {
  return {
    to: parseAddressList(input.to),
    cc: parseAddressList(input.cc),
    bcc: parseAddressList(input.bcc),
  };
}

export function flattenRecipients(recipients: ParsedMailRecipients) {
  return [
    ...recipients.to.map((recipient) => ({ ...recipient, recipientType: "to" as const })),
    ...recipients.cc.map((recipient) => ({ ...recipient, recipientType: "cc" as const })),
    ...recipients.bcc.map((recipient) => ({ ...recipient, recipientType: "bcc" as const })),
  ];
}

function isEmployeeMailAddress(address: string, domain = getEmployeeMailDomain()) {
  return normalizeMailAddress(address).endsWith(`@${domain}`);
}

export function buildMailboxAddress(alias: string, domain = getEmployeeMailDomain()) {
  const cleanAlias = cleanMailText(alias)
    .toLowerCase()
    .replace(/[^a-z0-9._+-]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");

  if (!cleanAlias) {
    throw new Error("Mailbox alias is required.");
  }

  return `${cleanAlias}@${domain}`;
}

export function buildFromHeader(displayName: string | null | undefined, address: string) {
  const cleanName = cleanMailText(displayName) || getEmployeeMailFromName();
  return `${cleanName.replace(/"/g, "'")} <${normalizeMailAddress(address)}>`;
}

export function buildThreadKey(values: {
  subject: string;
  fromAddress?: string | null;
  firstRecipientAddress?: string | null;
  internetMessageId?: string | null;
}) {
  const reference = cleanMailText(values.internetMessageId);

  if (reference) {
    return crypto.createHash("sha256").update(reference.toLowerCase()).digest("hex");
  }

  return crypto
    .createHash("sha256")
    .update(
      [
        cleanMailText(values.subject).toLowerCase().replace(/^(re|fw|fwd):\s*/i, ""),
        normalizeMailAddress(values.fromAddress),
        normalizeMailAddress(values.firstRecipientAddress),
      ].join("|"),
    )
    .digest("hex");
}

export function textToBasicHtml(value: string) {
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export function jsonRecord(value: unknown): Json {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(jsonRecord);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, jsonRecord(entry)]),
    );
  }

  return null;
}
