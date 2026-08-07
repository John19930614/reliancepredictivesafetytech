import { describe, expect, it } from "vitest";
import {
  canEditMatchRates,
  canTransitionMatch,
  certExpiringSoon,
  isTalentPortalRole,
  isTalentUuid,
  missingRequiredCerts,
  requiresHumanApproval,
  resolveTalentRoleFlags,
  talentMatchTransitions,
  type HumanApprovalInput,
} from "./policy";
import { certExpiryWarningDays, matchStatuses, type MatchStatus } from "./types";
import { portalUserRoles } from "@/lib/user-management";

/** A match that clears every gate — each test below breaks exactly one field. */
const cleanMatch = (overrides: Partial<HumanApprovalInput> = {}): HumanApprovalInput => ({
  requires_human_review: false,
  spread: 25,
  min_spread: 20,
  floor_ok: true,
  cert_requirements: ["CSP", "OSHA 30"],
  verified_certifications: ["CSP", "OSHA 30"],
  ...overrides,
});

/* -------------------------------------------------------------------------- */
/* Match status graph                                                         */
/* -------------------------------------------------------------------------- */

describe("match status transitions", () => {
  it("walks the happy path draft → pending_approval → approved → submitted → placed", () => {
    expect(canTransitionMatch("draft", "pending_approval").ok).toBe(true);
    expect(canTransitionMatch("pending_approval", "approved").ok).toBe(true);
    expect(canTransitionMatch("approved", "submitted").ok).toBe(true);
    expect(canTransitionMatch("submitted", "placed").ok).toBe(true);
  });

  it("routes a counter-offer back through approval rather than around it", () => {
    expect(canTransitionMatch("pending_approval", "counter_proposed").ok).toBe(true);
    expect(canTransitionMatch("counter_proposed", "pending_approval").ok).toBe(true);
    expect(canTransitionMatch("counter_proposed", "approved").ok).toBe(true);
    expect(canTransitionMatch("counter_proposed", "rejected").ok).toBe(true);
  });

  it("lets a rejected or withdrawn match be reworked as a draft", () => {
    expect(canTransitionMatch("rejected", "draft").ok).toBe(true);
    expect(canTransitionMatch("withdrawn", "draft").ok).toBe(true);
  });

  it("allows withdrawal from every live state", () => {
    for (const from of ["draft", "pending_approval", "counter_proposed", "approved", "submitted"] as const) {
      expect(canTransitionMatch(from, "withdrawn").ok).toBe(true);
    }
  });

  // The gate the whole module exists for: nothing reaches a client without a
  // human approval in between.
  it("refuses to submit a match that was never approved", () => {
    expect(canTransitionMatch("draft", "submitted").ok).toBe(false);
    expect(canTransitionMatch("pending_approval", "submitted").ok).toBe(false);
    expect(canTransitionMatch("counter_proposed", "submitted").ok).toBe(false);
    expect(canTransitionMatch("rejected", "submitted").ok).toBe(false);
  });

  it("refuses to place a match that was never submitted", () => {
    for (const from of ["draft", "pending_approval", "counter_proposed", "approved", "rejected", "withdrawn"] as const) {
      expect(canTransitionMatch(from, "placed").ok).toBe(false);
    }
  });

  it("treats placed as terminal", () => {
    expect(talentMatchTransitions.placed).toEqual([]);
    for (const to of matchStatuses) {
      const gate = canTransitionMatch("placed", to);
      expect(gate.ok).toBe(false);
      expect(gate.reason).toBeTruthy();
    }
  });

  it("rejects no-op transitions", () => {
    for (const status of matchStatuses) {
      expect(canTransitionMatch(status, status).ok).toBe(false);
    }
  });

  it("rejects every edge that is not in the declared graph", () => {
    const illegal: Array<[MatchStatus, MatchStatus]> = [];
    for (const from of matchStatuses) {
      for (const to of matchStatuses) {
        if (from === to) continue;
        if (talentMatchTransitions[from].includes(to)) continue;
        illegal.push([from, to]);
      }
    }
    // 8 statuses → 56 ordered pairs, of which 17 are legal edges.
    const legal = matchStatuses.reduce((sum, from) => sum + talentMatchTransitions[from].length, 0);
    expect(legal).toBe(17);
    expect(illegal.length).toBe(56 - 17);
    for (const [from, to] of illegal) {
      const gate = canTransitionMatch(from, to);
      expect(gate.ok, `${from} → ${to} must be rejected`).toBe(false);
      expect(gate.reason).toBeTruthy();
    }
  });

  it("rejects statuses that are not statuses at all", () => {
    expect(canTransitionMatch("nope" as MatchStatus, "approved").ok).toBe(false);
    expect(canTransitionMatch("draft", "" as MatchStatus).ok).toBe(false);
    expect(canTransitionMatch(null as unknown as MatchStatus, "draft" as MatchStatus).ok).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Rate edit lock                                                             */
/* -------------------------------------------------------------------------- */

describe("match rate edit lock", () => {
  it("allows re-pricing while the match is still being worked out", () => {
    expect(canEditMatchRates("draft").ok).toBe(true);
    expect(canEditMatchRates("pending_approval").ok).toBe(true);
    expect(canEditMatchRates("counter_proposed").ok).toBe(true);
  });

  it("freezes the rates once a human has signed the spread off, and after", () => {
    for (const status of ["approved", "submitted", "rejected", "placed", "withdrawn"] as const) {
      const gate = canEditMatchRates(status);
      expect(gate.ok).toBe(false);
      expect(gate.reason).toContain(status);
    }
  });

  it("rejects a status it does not recognise", () => {
    expect(canEditMatchRates("nope" as MatchStatus).ok).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* RBAC                                                                       */
/* -------------------------------------------------------------------------- */

describe("talent engine RBAC flags", () => {
  it("makes admin roles the Oversight Manager", () => {
    for (const role of ["platform_admin", "super_admin", "company_admin", "admin"]) {
      expect(resolveTalentRoleFlags(role, true)).toMatchObject({
        canRead: true,
        canPropose: true,
        canSetRate: true,
        canApprove: true,
        canManagePlacements: true,
      });
    }
  });

  it("reserves isAdmin for platform owners", () => {
    expect(resolveTalentRoleFlags("platform_admin", true).isAdmin).toBe(true);
    expect(resolveTalentRoleFlags("super_admin", true).isAdmin).toBe(true);
    // Fail-closed: the DB would allow these two, the destructive UI does not.
    expect(resolveTalentRoleFlags("company_admin", true).isAdmin).toBe(false);
    expect(resolveTalentRoleFlags("admin", true).isAdmin).toBe(false);
  });

  // A proposer who can approve their own proposal is not a gate.
  it("lets recruiters/reviewers propose but never approve or price", () => {
    for (const role of ["internal_reviewer", "employee"]) {
      expect(resolveTalentRoleFlags(role, true)).toEqual({
        canRead: true,
        canPropose: true,
        canSetRate: false,
        canApprove: false,
        canManagePlacements: false,
        isAdmin: false,
      });
    }
  });

  it("gives the account manager read-only visibility", () => {
    expect(resolveTalentRoleFlags("marketing", true)).toEqual({
      canRead: true,
      canPropose: false,
      canSetRate: false,
      canApprove: false,
      canManagePlacements: false,
      isAdmin: false,
    });
  });

  it("denies everything to inactive users and to roles outside the whitelist", () => {
    expect(resolveTalentRoleFlags("super_admin", false).canRead).toBe(false);
    expect(resolveTalentRoleFlags("super_admin", false).canApprove).toBe(false);
    for (const role of ["client_user", "contractor", "viewer", "", "ADMIN", null, undefined]) {
      const flags = resolveTalentRoleFlags(role, true);
      expect(isTalentPortalRole(role)).toBe(false);
      expect(Object.values(flags).every((value) => value === false)).toBe(true);
    }
  });

  // The DB predicate is_company_portal_employee() whitelists exactly these seven
  // roles; granting read to anything outside it makes the UI promise a query RLS
  // will return empty.
  it("mirrors the is_company_portal_employee() whitelist exactly", () => {
    expect([...portalUserRoles].sort()).toEqual(
      ["admin", "company_admin", "employee", "internal_reviewer", "marketing", "platform_admin", "super_admin"].sort(),
    );
    for (const role of portalUserRoles) {
      expect(isTalentPortalRole(role)).toBe(true);
      expect(resolveTalentRoleFlags(role, true).canRead).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The Human Authority gate                                                   */
/* -------------------------------------------------------------------------- */

describe("requiresHumanApproval", () => {
  it("clears a complete, well-formed, above-floor, fully-verified match", () => {
    expect(requiresHumanApproval(cleanMatch())).toBe(false);
    expect(requiresHumanApproval(cleanMatch({ cert_requirements: [], verified_certifications: [] }))).toBe(false);
    // Exactly on the floor still clears.
    expect(requiresHumanApproval(cleanMatch({ spread: 20, min_spread: 20 }))).toBe(false);
  });

  it("is true whenever the row carries the review flag", () => {
    expect(requiresHumanApproval(cleanMatch({ requires_human_review: true }))).toBe(true);
  });

  it("is true when the spread is under the floor", () => {
    expect(requiresHumanApproval(cleanMatch({ spread: 19.99, min_spread: 20 }))).toBe(true);
    expect(requiresHumanApproval(cleanMatch({ spread: -5, min_spread: 20 }))).toBe(true);
  });

  it("falls back to the agency default floor when the job order sets none", () => {
    // defaultMinSpreadPerHour is 20.
    expect(requiresHumanApproval(cleanMatch({ min_spread: null, spread: 25 }))).toBe(false);
    expect(requiresHumanApproval(cleanMatch({ min_spread: null, spread: 15 }))).toBe(true);
  });

  it("is true when the stored floor_ok disagrees with the arithmetic", () => {
    expect(requiresHumanApproval(cleanMatch({ floor_ok: false }))).toBe(true);
  });

  it("is true when a required certification is not verified", () => {
    expect(
      requiresHumanApproval(cleanMatch({ cert_requirements: ["CSP", "CIH"], verified_certifications: ["CSP"] })),
    ).toBe(true);
    // Held-but-unverified is exactly the case the gate exists for.
    expect(requiresHumanApproval(cleanMatch({ verified_certifications: [] }))).toBe(true);
  });

  it("accepts case- and whitespace-differing certifications as verified", () => {
    expect(
      requiresHumanApproval(
        cleanMatch({ cert_requirements: ["OSHA 30"], verified_certifications: [" osha 30 "] }),
      ),
    ).toBe(false);
  });

  // The safety property: there is no accidental path to `false`.
  it("defaults to true for missing, malformed, or wrongly-typed input", () => {
    for (const malformed of [
      null,
      undefined,
      {},
      "approved",
      42,
      [],
      true,
      { ...cleanMatch(), requires_human_review: undefined },
      { ...cleanMatch(), requires_human_review: 0 },
      { ...cleanMatch(), requires_human_review: "false" },
      { ...cleanMatch(), spread: undefined },
      { ...cleanMatch(), spread: "25" },
      { ...cleanMatch(), spread: NaN },
      { ...cleanMatch(), spread: Infinity },
      { ...cleanMatch(), min_spread: "20" },
      { ...cleanMatch(), min_spread: NaN },
      { ...cleanMatch(), floor_ok: undefined },
      { ...cleanMatch(), floor_ok: "true" },
      { ...cleanMatch(), floor_ok: 1 },
      { ...cleanMatch(), cert_requirements: undefined },
      { ...cleanMatch(), cert_requirements: null },
      { ...cleanMatch(), cert_requirements: "CSP" },
      { ...cleanMatch(), verified_certifications: null },
      { ...cleanMatch(), verified_certifications: "CSP,OSHA 30" },
    ]) {
      expect(requiresHumanApproval(malformed as unknown as HumanApprovalInput)).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Certifications                                                             */
/* -------------------------------------------------------------------------- */

describe("missingRequiredCerts", () => {
  it("returns nothing when every requirement is verified", () => {
    expect(missingRequiredCerts(["CSP", "OSHA 30"], ["CSP", "OSHA 30", "CHST"])).toEqual([]);
    expect(missingRequiredCerts([], ["CSP"])).toEqual([]);
  });

  it("compares case-insensitively and ignores surrounding whitespace", () => {
    expect(missingRequiredCerts(["OSHA 30"], ["osha 30"])).toEqual([]);
    expect(missingRequiredCerts(["csp"], ["  CSP  "])).toEqual([]);
    expect(missingRequiredCerts([" CIH "], ["cih"])).toEqual([]);
  });

  it("names the missing requirements in the job order's own casing", () => {
    expect(missingRequiredCerts(["CSP", "CIH"], ["csp"])).toEqual(["CIH"]);
    expect(missingRequiredCerts(["OSHA 500"], [])).toEqual(["OSHA 500"]);
  });

  it("reports each requirement once even if it is listed twice", () => {
    expect(missingRequiredCerts(["CIH", "cih", " CIH "], ["CSP"])).toEqual(["CIH"]);
  });

  it("drops blank requirements and survives malformed lists", () => {
    expect(missingRequiredCerts(["", "   ", null as unknown as string], ["CSP"])).toEqual([]);
    expect(missingRequiredCerts(null as unknown as string[], ["CSP"])).toEqual([]);
    // A malformed verified list means nothing is verified — fail closed.
    expect(missingRequiredCerts(["CSP"], null as unknown as string[])).toEqual(["CSP"]);
    expect(missingRequiredCerts(["CSP"], "CSP" as unknown as string[])).toEqual(["CSP"]);
  });
});

describe("certExpiringSoon", () => {
  const now = new Date("2026-08-06T00:00:00.000Z");

  it("warns on a certification lapsing inside the window", () => {
    expect(certExpiringSoon("2026-09-01", now)).toBe(true);
    expect(certExpiringSoon("2026-10-05", now)).toBe(true); // day 60, the boundary
  });

  it("warns loudest on one that has already lapsed", () => {
    expect(certExpiringSoon("2025-01-01", now)).toBe(true);
    expect(certExpiringSoon("2026-08-05", now)).toBe(true);
  });

  it("stays quiet outside the window", () => {
    expect(certExpiringSoon("2026-10-06", now)).toBe(false); // day 61
    expect(certExpiringSoon("2027-06-01", now)).toBe(false);
  });

  it("honours a custom window", () => {
    expect(certExpiringSoon("2026-08-20", now, 7)).toBe(false);
    expect(certExpiringSoon("2026-08-20", now, 30)).toBe(true);
    expect(certExpiryWarningDays).toBe(60);
  });

  it("stays quiet for a missing or unparseable date rather than crying wolf", () => {
    for (const value of [null, undefined, "", "   ", "not-a-date", 42, {}]) {
      expect(certExpiringSoon(value as unknown as string, now)).toBe(false);
    }
  });

  it("reads a full ISO timestamp as well as a bare date", () => {
    expect(certExpiringSoon("2026-09-01T12:30:00.000Z", now)).toBe(true);
    expect(certExpiringSoon("2027-09-01T12:30:00.000Z", now)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Input validation                                                           */
/* -------------------------------------------------------------------------- */

describe("isTalentUuid", () => {
  it("accepts a well-formed uuid in either case, with surrounding space", () => {
    expect(isTalentUuid("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(true);
    expect(isTalentUuid("3F2504E0-4F89-11D3-9A0C-0305E82C3301")).toBe(true);
    expect(isTalentUuid("  3f2504e0-4f89-11d3-9a0c-0305e82c3301  ")).toBe(true);
  });

  it("rejects anything else, including an injection attempt", () => {
    for (const value of [
      "not-a-uuid",
      "1; drop table talent_matches",
      "3f2504e0-4f89-11d3-9a0c-0305e82c330",
      "3f2504e0-4f89-11d3-9a0c-0305e82c33011",
      "",
      null,
      undefined,
      42,
    ]) {
      expect(isTalentUuid(value as unknown as string)).toBe(false);
    }
  });
});
