// Share-link token primitives: generation, hashing, and constant-time
// verification.
//
// SERVER ONLY by construction — this module imports `node:crypto`. The rules
// that both the server and the browser need (expiry, revocation, the share gate,
// acceptance validation) deliberately live in ./share-link-policy so a client
// component can import them without dragging a Node built-in into the browser
// bundle.
//
// THREAT MODEL
//   The share URL is a bearer credential handed to a client over email. It must
//   therefore be (a) unguessable, (b) revocable, (c) expiring, and (d) useless
//   to anyone who steals the database. (d) is why only the SHA-256 hash is
//   persisted: the raw token is returned to its creator exactly once and is
//   never recoverable from storage.
//
//   A plain (unsalted, un-stretched) SHA-256 is the right primitive here and a
//   password KDF is not: the input is 256 bits of CSPRNG output, so there is no
//   dictionary to attack and nothing for a salt to defeat. Stretching would only
//   add latency to every page view.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Entropy per token. 256 bits — brute force is not a consideration. */
export const shareTokenByteLength = 32;
/** base64url length of `shareTokenByteLength` bytes, unpadded. */
export const shareTokenLength = 43;

const shareTokenPattern = new RegExp(`^[A-Za-z0-9_-]{${shareTokenLength}}$`);
const shareTokenHashPattern = /^[0-9a-f]{64}$/;

/**
 * Mints a new raw share token. This value is shown to the creator once and then
 * discarded — only `hashShareToken(token)` is persisted.
 */
export function generateShareToken(): string {
  return randomBytes(shareTokenByteLength).toString("base64url");
}

/**
 * Cheap structural check run BEFORE the token is hashed or sent to the
 * database. Rejects junk paths without a round trip and keeps arbitrary
 * user-controlled bytes out of the query.
 */
export function isShareTokenFormat(value: unknown): value is string {
  return typeof value === "string" && shareTokenPattern.test(value);
}

/** SHA-256 hex digest. The only form of the token that ever reaches storage. */
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Constant-time comparison of two token hashes.
 *
 * The database lookup itself is an ordinary indexed `token_hash = $1`, which is
 * not constant time — but its input is already a one-way digest, so its timing
 * reveals nothing about the token. This is defence in depth for the final
 * confirmation step, and it is where a constant-time compare is actually
 * meaningful. Length is checked first because `timingSafeEqual` throws on a
 * length mismatch, and the digest length is public anyway.
 */
export function shareTokenHashesMatch(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (!shareTokenHashPattern.test(a) || !shareTokenHashPattern.test(b)) return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
