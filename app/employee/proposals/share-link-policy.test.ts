import { describe, expect, it } from "vitest";
import {
  acceptanceEmailMaxLength,
  acceptanceNameMaxLength,
  buildShareLinkUrl,
  canShareProposal,
  clampShareLinkDays,
  defaultShareLinkDays,
  evaluateShareLink,
  extractClientIp,
  isShareLinkUsable,
  maxShareLinkDays,
  minShareLinkDays,
  shareLinkExpiryIso,
  validateAcceptanceInput,
} from "./share-link-policy";

const now = new Date("2026-08-04T12:00:00.000Z");
const hours = (n: number) => new Date(now.getTime() + n * 3_600_000).toISOString();

describe("share link lifecycle", () => {
  it("accepts a valid link — unrevoked and not yet expired", () => {
    const link = { expires_at: hours(24), revoked_at: null };
    expect(evaluateShareLink(link, now)).toBe("valid");
    expect(isShareLinkUsable(link, now)).toBe(true);
  });

  it("rejects an expired link", () => {
    expect(evaluateShareLink({ expires_at: hours(-1), revoked_at: null }, now)).toBe("expired");
    // Exactly at the boundary the link is already dead.
    expect(evaluateShareLink({ expires_at: now.toISOString(), revoked_at: null }, now)).toBe("expired");
    expect(isShareLinkUsable({ expires_at: hours(-1), revoked_at: null }, now)).toBe(false);
  });

  it("rejects a revoked link, even while it is still inside its expiry window", () => {
    expect(evaluateShareLink({ expires_at: hours(240), revoked_at: hours(-2) }, now)).toBe("revoked");
    // A revocation stamped in the future still counts — it was pulled back.
    expect(evaluateShareLink({ expires_at: hours(240), revoked_at: hours(5) }, now)).toBe("revoked");
    expect(isShareLinkUsable({ expires_at: hours(240), revoked_at: hours(-2) }, now)).toBe(false);
  });

  it("reports revoked before expired when a link is both", () => {
    expect(evaluateShareLink({ expires_at: hours(-48), revoked_at: hours(-72) }, now)).toBe("revoked");
  });

  it("rejects an unknown token — no row found", () => {
    expect(evaluateShareLink(null, now)).toBe("unknown");
    expect(evaluateShareLink(undefined, now)).toBe("unknown");
    expect(isShareLinkUsable(null, now)).toBe(false);
  });

  it("fails closed on missing or unparseable expiry", () => {
    expect(evaluateShareLink({ expires_at: null, revoked_at: null }, now)).toBe("expired");
    expect(evaluateShareLink({ expires_at: "", revoked_at: null }, now)).toBe("expired");
    expect(evaluateShareLink({ expires_at: "whenever", revoked_at: null }, now)).toBe("expired");
    expect(evaluateShareLink({}, now)).toBe("expired");
  });

  it("treats an unparseable revoked_at as revoked rather than ignoring it", () => {
    expect(evaluateShareLink({ expires_at: hours(24), revoked_at: "yes" }, now)).toBe("revoked");
  });
});

describe("share link expiry window", () => {
  it("clamps the requested lifetime", () => {
    expect(clampShareLinkDays(30)).toBe(30);
    expect(clampShareLinkDays(0)).toBe(minShareLinkDays);
    expect(clampShareLinkDays(-9999)).toBe(minShareLinkDays);
    expect(clampShareLinkDays(10_000)).toBe(maxShareLinkDays);
    expect(clampShareLinkDays(7.9)).toBe(7);
    expect(clampShareLinkDays("21")).toBe(21);
    expect(clampShareLinkDays("forever")).toBe(defaultShareLinkDays);
    expect(clampShareLinkDays(undefined)).toBe(defaultShareLinkDays);
    expect(clampShareLinkDays(Number.NaN)).toBe(defaultShareLinkDays);
    expect(clampShareLinkDays(Number.POSITIVE_INFINITY)).toBe(defaultShareLinkDays);
  });

  it("produces an expiry the lifecycle predicate then accepts, and later rejects", () => {
    const expires_at = shareLinkExpiryIso(7, now);
    expect(expires_at).toBe("2026-08-11T12:00:00.000Z");
    expect(evaluateShareLink({ expires_at, revoked_at: null }, now)).toBe("valid");
    const later = new Date(now.getTime() + 8 * 86_400_000);
    expect(evaluateShareLink({ expires_at, revoked_at: null }, later)).toBe("expired");
  });

  it("cannot mint an already-expired link, even from hostile input", () => {
    for (const requested of [-1, 0, "-50", Number.NaN, null]) {
      const expires_at = shareLinkExpiryIso(requested, now);
      expect(evaluateShareLink({ expires_at, revoked_at: null }, now)).toBe("valid");
    }
  });
});

describe("share link url", () => {
  it("builds an absolute url when an origin is known", () => {
    expect(buildShareLinkUrl("https://example.com", "abc")).toBe("https://example.com/proposals/share/abc");
    expect(buildShareLinkUrl("https://example.com/nested/", "abc")).toBe("https://example.com/proposals/share/abc");
  });

  it("falls back to a relative path when the origin is missing or unusable", () => {
    expect(buildShareLinkUrl(null, "abc")).toBe("/proposals/share/abc");
    expect(buildShareLinkUrl("", "abc")).toBe("/proposals/share/abc");
    expect(buildShareLinkUrl("not a url", "abc")).toBe("/proposals/share/abc");
  });
});

describe("share gate", () => {
  it("only mints links from a sent proposal", () => {
    expect(canShareProposal("sent").ok).toBe(true);
  });

  it("refuses every other status, with a reason", () => {
    for (const status of ["draft", "in_review", "accepted", "declined", "archived"] as const) {
      const gate = canShareProposal(status);
      expect(gate.ok).toBe(false);
      expect(gate.reason).toBeTruthy();
    }
  });
});

describe("acceptance input validation", () => {
  it("accepts a complete, agreed submission and normalises the email", () => {
    const result = validateAcceptanceInput({ name: "  Dana Reyes ", email: " Dana@Example.COM ", agreed: true });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ name: "Dana Reyes", email: "dana@example.com" });
  });

  it("refuses to record an acceptance without an explicit agreement", () => {
    const result = validateAcceptanceInput({ name: "Dana", email: "dana@example.com", agreed: false });
    expect(result.ok).toBe(false);
    expect(result.errors.agreed).toBeTruthy();
    expect(validateAcceptanceInput({ name: "Dana", email: "dana@example.com" }).ok).toBe(false);
    expect(validateAcceptanceInput({ name: "Dana", email: "dana@example.com", agreed: "yes" }).ok).toBe(false);
  });

  it("requires a name and a plausible email", () => {
    expect(validateAcceptanceInput({ name: "  ", email: "dana@example.com", agreed: true }).errors.name).toBeTruthy();
    expect(validateAcceptanceInput({ name: "Dana", email: "nope", agreed: true }).errors.email).toBeTruthy();
    expect(validateAcceptanceInput({ name: "Dana", email: "a@b", agreed: true }).errors.email).toBeTruthy();
    expect(validateAcceptanceInput({ name: "Dana", email: "a b@c.com", agreed: true }).errors.email).toBeTruthy();
    expect(validateAcceptanceInput({ name: 42, email: {}, agreed: true }).ok).toBe(false);
  });

  it("bounds the stored values", () => {
    const longName = "n".repeat(acceptanceNameMaxLength + 1);
    expect(validateAcceptanceInput({ name: longName, email: "a@b.com", agreed: true }).errors.name).toBeTruthy();
    const longEmail = `${"e".repeat(acceptanceEmailMaxLength)}@example.com`;
    expect(validateAcceptanceInput({ name: "Dana", email: longEmail, agreed: true }).errors.email).toBeTruthy();
  });
});

describe("client ip extraction", () => {
  it("keeps only the first forwarded hop", () => {
    expect(extractClientIp("203.0.113.7, 70.41.3.18, 150.172.238.178")).toBe("203.0.113.7");
    expect(extractClientIp("  203.0.113.7  ")).toBe("203.0.113.7");
    expect(extractClientIp("2001:db8::1")).toBe("2001:db8::1");
  });

  it("returns null for a missing or empty header", () => {
    expect(extractClientIp(null)).toBeNull();
    expect(extractClientIp(undefined)).toBeNull();
    expect(extractClientIp("")).toBeNull();
    expect(extractClientIp("  ,  ")).toBeNull();
  });

  it("caps an oversized header value", () => {
    expect(extractClientIp("9".repeat(500))?.length).toBe(100);
  });
});
