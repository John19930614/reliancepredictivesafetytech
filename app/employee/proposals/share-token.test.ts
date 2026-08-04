import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  generateShareToken,
  hashShareToken,
  isShareTokenFormat,
  shareTokenHashesMatch,
  shareTokenLength,
} from "./share-token";

describe("share token generation", () => {
  it("mints base64url tokens of the declared length", () => {
    for (let i = 0; i < 25; i += 1) {
      const token = generateShareToken();
      expect(token).toHaveLength(shareTokenLength);
      expect(isShareTokenFormat(token)).toBe(true);
    }
  });

  it("never repeats a token", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(generateShareToken());
    expect(seen.size).toBe(500);
  });

  it("rejects anything that is not a well-formed token", () => {
    expect(isShareTokenFormat("")).toBe(false);
    expect(isShareTokenFormat("short")).toBe(false);
    expect(isShareTokenFormat("a".repeat(shareTokenLength - 1))).toBe(false);
    expect(isShareTokenFormat("a".repeat(shareTokenLength + 1))).toBe(false);
    // base64url has no +, / or = — and no path traversal or SQL metacharacters.
    expect(isShareTokenFormat(`${"a".repeat(shareTokenLength - 1)}+`)).toBe(false);
    expect(isShareTokenFormat(`${"a".repeat(shareTokenLength - 1)}/`)).toBe(false);
    expect(isShareTokenFormat(`${"a".repeat(shareTokenLength - 1)}=`)).toBe(false);
    expect(isShareTokenFormat("../".padEnd(shareTokenLength, "a"))).toBe(false);
    expect(isShareTokenFormat("' or 1=1 --".padEnd(shareTokenLength, "a"))).toBe(false);
    expect(isShareTokenFormat(null)).toBe(false);
    expect(isShareTokenFormat(undefined)).toBe(false);
    expect(isShareTokenFormat(12345)).toBe(false);
    expect(isShareTokenFormat({ toString: () => "a".repeat(shareTokenLength) })).toBe(false);
  });
});

describe("share token hashing", () => {
  it("produces a stable sha256 hex digest and never echoes the token", () => {
    const token = generateShareToken();
    const hash = hashShareToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashShareToken(token));
    expect(hash).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    expect(hash).not.toContain(token);
  });

  it("gives different tokens different hashes", () => {
    expect(hashShareToken(generateShareToken())).not.toBe(hashShareToken(generateShareToken()));
  });
});

describe("share token verification", () => {
  it("accepts a valid token: its digest matches the stored hash", () => {
    const token = generateShareToken();
    const stored = hashShareToken(token);
    expect(shareTokenHashesMatch(hashShareToken(token), stored)).toBe(true);
  });

  it("rejects an unknown token: a different token never matches a stored hash", () => {
    const stored = hashShareToken(generateShareToken());
    for (let i = 0; i < 50; i += 1) {
      expect(shareTokenHashesMatch(hashShareToken(generateShareToken()), stored)).toBe(false);
    }
  });

  it("rejects malformed, wrong-length, or non-string operands instead of throwing", () => {
    const hash = hashShareToken(generateShareToken());
    expect(shareTokenHashesMatch(hash, hash.slice(0, 63))).toBe(false);
    expect(shareTokenHashesMatch(hash, `${hash}0`)).toBe(false);
    expect(shareTokenHashesMatch(hash, hash.toUpperCase())).toBe(false);
    expect(shareTokenHashesMatch(hash, "")).toBe(false);
    expect(shareTokenHashesMatch(hash, null)).toBe(false);
    expect(shareTokenHashesMatch(null, null)).toBe(false);
    expect(shareTokenHashesMatch(hash, "z".repeat(64))).toBe(false);
  });
});
