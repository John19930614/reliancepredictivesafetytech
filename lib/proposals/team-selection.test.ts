import { describe, expect, it } from "vitest";
import {
  isUserId,
  maxTeamMembers,
  parseSignerId,
  parseTeamMemberIds,
  serializeTeamMemberIds,
  teamFieldIds,
  toggleTeamMember,
} from "./team-selection";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("isUserId", () => {
  it("accepts a uuid and rejects anything else", () => {
    expect(isUserId(A)).toBe(true);
    expect(isUserId(A.toUpperCase())).toBe(true);
    expect(isUserId("not-a-uuid")).toBe(false);
    expect(isUserId("")).toBe(false);
    expect(isUserId(null)).toBe(false);
    expect(isUserId(123)).toBe(false);
    // A near-miss: right shape, one character short.
    expect(isUserId(A.slice(0, -1))).toBe(false);
  });
});

describe("parseTeamMemberIds", () => {
  it("reads the comma-separated field in the seller's chosen order", () => {
    expect(parseTeamMemberIds({ [teamFieldIds.members]: `${B},${A}` })).toEqual([B, A]);
  });

  it("returns an empty array for a missing, blank, or non-string field", () => {
    expect(parseTeamMemberIds(undefined)).toEqual([]);
    expect(parseTeamMemberIds({})).toEqual([]);
    expect(parseTeamMemberIds({ [teamFieldIds.members]: "" })).toEqual([]);
    expect(parseTeamMemberIds({ [teamFieldIds.members]: "   " })).toEqual([]);
    expect(parseTeamMemberIds({ [teamFieldIds.members]: 42 })).toEqual([]);
  });

  it("drops malformed ids instead of passing them to a query", () => {
    // The field round-trips through a client-editable form, so its contents are
    // untrusted input.
    expect(parseTeamMemberIds({ [teamFieldIds.members]: `${A},oops,,${B}` })).toEqual([A, B]);
    expect(parseTeamMemberIds({ [teamFieldIds.members]: "'; drop table --" })).toEqual([]);
  });

  it("deduplicates case-insensitively and keeps the first occurrence", () => {
    expect(parseTeamMemberIds({ [teamFieldIds.members]: `${A},${A.toUpperCase()},${B}` })).toEqual([A, B]);
  });

  it("truncates at the cap so one proposal cannot print a staff directory", () => {
    const many = Array.from({ length: maxTeamMembers + 3 }, (_, index) =>
      `${String(index).repeat(8)}-1111-4111-8111-111111111111`,
    ).join(",");
    expect(parseTeamMemberIds({ [teamFieldIds.members]: many })).toHaveLength(maxTeamMembers);
  });
});

describe("parseSignerId", () => {
  it("returns a valid id and null for everything else", () => {
    expect(parseSignerId({ [teamFieldIds.signer]: A.toUpperCase() })).toBe(A);
    expect(parseSignerId({ [teamFieldIds.signer]: "" })).toBeNull();
    expect(parseSignerId({ [teamFieldIds.signer]: "nope" })).toBeNull();
    expect(parseSignerId({})).toBeNull();
    expect(parseSignerId(undefined)).toBeNull();
  });
});

describe("serializeTeamMemberIds / toggleTeamMember", () => {
  it("round-trips through the single scalar field the generator state stores", () => {
    const serialized = serializeTeamMemberIds([A, B]);
    expect(serialized).toBe(`${A},${B}`);
    expect(parseTeamMemberIds({ [teamFieldIds.members]: serialized })).toEqual([A, B]);
  });

  it("adds and removes without disturbing the rest of the order", () => {
    expect(toggleTeamMember([A, B], C, true)).toBe(`${A},${B},${C}`);
    expect(toggleTeamMember([A, B, C], B, false)).toBe(`${A},${C}`);
  });

  it("is idempotent: re-checking someone already selected changes nothing", () => {
    expect(toggleTeamMember([A, B], A, true)).toBe(`${A},${B}`);
  });

  it("unchecking the last person yields an empty field, not a stray comma", () => {
    expect(toggleTeamMember([A], A, false)).toBe("");
  });
});
