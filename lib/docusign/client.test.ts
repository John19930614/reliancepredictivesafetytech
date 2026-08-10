import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseDocusignWebhookEvent, verifyDocusignHmac } from "./client";

describe("DocuSign webhook helpers", () => {
  it("verifies the DocuSign Connect HMAC header", () => {
    const body = JSON.stringify({ event: "envelope-completed", data: { envelopeId: "env-123" } });
    const secret = "shared-secret";
    const signature = createHmac("sha256", secret).update(body, "utf8").digest("base64");

    expect(verifyDocusignHmac(body, signature, secret)).toBe(true);
    expect(verifyDocusignHmac(body, signature, "wrong-secret")).toBe(false);
    expect(verifyDocusignHmac(body, null, secret)).toBe(false);
  });

  it("parses modern DocuSign Connect JSON events", () => {
    expect(
      parseDocusignWebhookEvent({
        event: "envelope-completed",
        generatedDateTime: "2026-08-10T17:00:00.000Z",
        data: { envelopeId: "env-456" },
      }),
    ).toEqual({
      envelopeId: "env-456",
      status: "completed",
      occurredAt: "2026-08-10T17:00:00.000Z",
    });
  });

  it("falls back to envelopeSummary when DocuSign nests the status there", () => {
    expect(
      parseDocusignWebhookEvent({
        data: {
          envelopeSummary: {
            envelopeId: "env-789",
            status: "Delivered",
            statusChangedDateTime: "2026-08-10T17:01:00.000Z",
          },
        },
      }),
    ).toEqual({
      envelopeId: "env-789",
      status: "delivered",
      occurredAt: "2026-08-10T17:01:00.000Z",
    });
  });
});
