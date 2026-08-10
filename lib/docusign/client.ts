import "server-only";

import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { configuredSiteUrl, getDocusignConfig, type DocusignConfig } from "./config";

export interface DocusignRecipient {
  name: string;
  email: string;
}

export interface CreateProposalEnvelopeInput {
  proposalId: string;
  revisionId: string | null;
  documentName: string;
  pdfBytes: Uint8Array;
  recipient: DocusignRecipient;
  emailSubject?: string | null;
}

export interface DocusignEnvelopeResult {
  envelopeId: string;
  status: string;
  emailSubject: string;
}

export interface DocusignWebhookEvent {
  envelopeId: string | null;
  status: string;
  occurredAt: string | null;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function oauthAudience(oauthBaseUrl: string): string {
  try {
    return new URL(oauthBaseUrl).host;
  } catch {
    return oauthBaseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

export function buildDocusignJwt(config: DocusignConfig, now = Math.floor(Date.now() / 1000)): string {
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: config.integrationKey,
    sub: config.userId,
    aud: oauthAudience(config.oauthBaseUrl),
    iat: now,
    exp: now + 55 * 60,
    scope: "signature impersonation",
  };

  const body = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(body);
  signer.end();
  return `${body}.${signer.sign(config.privateKey).toString("base64url")}`;
}

async function requestAccessToken(config: DocusignConfig): Promise<string> {
  const response = await fetch(`${stripTrailingSlash(config.oauthBaseUrl)}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: buildDocusignJwt(config),
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`DocuSign authentication failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const parsed = JSON.parse(text) as { access_token?: string };
  if (!parsed.access_token) throw new Error("DocuSign authentication did not return an access token.");
  return parsed.access_token;
}

function proposalCustomFields(input: CreateProposalEnvelopeInput) {
  return {
    textCustomFields: [
      { name: "proposalId", required: "false", show: "false", value: input.proposalId },
      { name: "revisionId", required: "false", show: "false", value: input.revisionId ?? "" },
    ],
  };
}

function recipientTabs() {
  // These anchors match labels drawn in lib/proposals/pdf.ts. If the signature
  // block text changes, DocuSign should fail loudly instead of sending an
  // unsigned-looking proposal.
  return {
    signHereTabs: [
      {
        anchorString: "Authorized Signature / Date",
        anchorUnits: "pixels",
        anchorXOffset: "0",
        anchorYOffset: "-18",
        anchorIgnoreIfNotPresent: "false",
      },
    ],
    dateSignedTabs: [
      {
        anchorString: "Authorized Signature / Date",
        anchorUnits: "pixels",
        anchorXOffset: "160",
        anchorYOffset: "-18",
        anchorIgnoreIfNotPresent: "false",
      },
    ],
    fullNameTabs: [
      {
        anchorString: "Printed Name / Title",
        anchorUnits: "pixels",
        anchorXOffset: "0",
        anchorYOffset: "-18",
        anchorIgnoreIfNotPresent: "false",
      },
    ],
  };
}

function eventNotification(siteUrl: string) {
  return {
    url: `${siteUrl}/api/docusign/connect`,
    loggingEnabled: "true",
    requireAcknowledgment: "true",
    useSoapInterface: "false",
    includeCertificateOfCompletion: "true",
    includeDocuments: "false",
    includeEnvelopeVoidReason: "true",
    includeTimeZone: "true",
    includeSenderAccountAsCustomField: "true",
    envelopeEvents: [
      { envelopeEventStatusCode: "sent" },
      { envelopeEventStatusCode: "delivered" },
      { envelopeEventStatusCode: "completed" },
      { envelopeEventStatusCode: "declined" },
      { envelopeEventStatusCode: "voided" },
    ],
  };
}

export async function createProposalEnvelope(input: CreateProposalEnvelopeInput): Promise<DocusignEnvelopeResult> {
  const config = getDocusignConfig();
  const siteUrl = configuredSiteUrl();
  if (!siteUrl) throw new Error("NEXT_PUBLIC_SITE_URL is required so DocuSign can call the completion webhook.");

  const accessToken = await requestAccessToken(config);
  const emailSubject = input.emailSubject?.trim() || config.defaultEmailSubject;
  const payload = {
    emailSubject,
    documents: [
      {
        documentBase64: Buffer.from(input.pdfBytes).toString("base64"),
        name: input.documentName,
        fileExtension: "pdf",
        documentId: "1",
      },
    ],
    recipients: {
      signers: [
        {
          email: input.recipient.email,
          name: input.recipient.name,
          recipientId: "1",
          routingOrder: "1",
          tabs: recipientTabs(),
        },
      ],
    },
    customFields: proposalCustomFields(input),
    eventNotification: eventNotification(siteUrl),
    status: "sent",
  };

  const response = await fetch(
    `${stripTrailingSlash(config.basePath)}/restapi/v2.1/accounts/${config.accountId}/envelopes`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`DocuSign envelope creation failed (${response.status}): ${text.slice(0, 500)}`);
  }

  const parsed = JSON.parse(text) as { envelopeId?: string; status?: string };
  if (!parsed.envelopeId) throw new Error("DocuSign did not return an envelope id.");
  return { envelopeId: parsed.envelopeId, status: parsed.status ?? "sent", emailSubject };
}

export async function downloadCompletedEnvelopePdf(envelopeId: string): Promise<Uint8Array> {
  const config = getDocusignConfig();
  const accessToken = await requestAccessToken(config);
  const response = await fetch(
    `${stripTrailingSlash(config.basePath)}/restapi/v2.1/accounts/${config.accountId}/envelopes/${encodeURIComponent(
      envelopeId,
    )}/documents/combined`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DocuSign signed-document download failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export function verifyDocusignHmac(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(signatureHeader);
  if (expectedBytes.length !== providedBytes.length) return false;
  return timingSafeEqual(expectedBytes, providedBytes);
}

export function parseDocusignWebhookEvent(payload: unknown): DocusignWebhookEvent {
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : {};
  const summary =
    data.envelopeSummary && typeof data.envelopeSummary === "object"
      ? (data.envelopeSummary as Record<string, unknown>)
      : {};

  const event = typeof body.event === "string" ? body.event.toLowerCase() : "";
  const status =
    (typeof summary.status === "string" && summary.status) ||
    (typeof data.status === "string" && data.status) ||
    event.split("-").pop() ||
    "unknown";

  const occurredAt =
    (typeof body.generatedDateTime === "string" && body.generatedDateTime) ||
    (typeof summary.completedDateTime === "string" && summary.completedDateTime) ||
    (typeof summary.statusChangedDateTime === "string" && summary.statusChangedDateTime) ||
    null;

  return {
    envelopeId:
      (typeof data.envelopeId === "string" && data.envelopeId) ||
      (typeof summary.envelopeId === "string" && summary.envelopeId) ||
      (typeof body.envelopeId === "string" && body.envelopeId) ||
      null,
    status: status.toLowerCase(),
    occurredAt,
  };
}
