import { describe, expect, it } from "vitest";
import {
  canCreatePerformanceReview,
  canManageReviewCycles,
  canReadPerformanceReview,
  canUpdatePerformanceReview,
  visiblePerformanceReviews,
} from "./policy";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const MANAGER = "33333333-3333-3333-3333-333333333333";

const aliceReview = { employee_user_id: ALICE, reviewer_user_id: MANAGER };
const bobReview = { employee_user_id: BOB, reviewer_user_id: MANAGER };
const unassignedReview = { employee_user_id: BOB, reviewer_user_id: null };

// ===========================================================================
// Reading — the permission matrix CLAUDE.md requires
// ===========================================================================

describe("canReadPerformanceReview", () => {
  it("lets the subject read their own review", () => {
    expect(canReadPerformanceReview(aliceReview, ALICE, false)).toBe(true);
  });

  it("lets the assigned reviewer read it", () => {
    expect(canReadPerformanceReview(aliceReview, MANAGER, false)).toBe(true);
  });

  it("lets an admin read anyone's review", () => {
    expect(canReadPerformanceReview(aliceReview, BOB, true)).toBe(true);
  });

  // The regression this whole change exists to prevent.
  it("denies one employee another employee's review", () => {
    expect(canReadPerformanceReview(bobReview, ALICE, false)).toBe(false);
  });

  it("denies an unauthenticated caller, including on an unassigned review", () => {
    for (const userId of [null, undefined, ""]) {
      expect(canReadPerformanceReview(aliceReview, userId, false)).toBe(false);
      // A null reviewer_user_id must not match a null/empty userId.
      expect(canReadPerformanceReview(unassignedReview, userId, false)).toBe(false);
    }
  });

  it("does not treat a null reviewer as a wildcard", () => {
    expect(canReadPerformanceReview(unassignedReview, ALICE, false)).toBe(false);
    expect(canReadPerformanceReview(unassignedReview, BOB, false)).toBe(true);
  });
});

// ===========================================================================
// Writing
// ===========================================================================

describe("canUpdatePerformanceReview", () => {
  it("allows the subject, the reviewer, and an admin", () => {
    expect(canUpdatePerformanceReview(aliceReview, ALICE, false)).toBe(true);
    expect(canUpdatePerformanceReview(aliceReview, MANAGER, false)).toBe(true);
    expect(canUpdatePerformanceReview(aliceReview, BOB, true)).toBe(true);
  });

  it("denies an unrelated employee — no rewriting someone else's rating", () => {
    expect(canUpdatePerformanceReview(bobReview, ALICE, false)).toBe(false);
  });
});

describe("canCreatePerformanceReview", () => {
  it("is admin-only, so nobody authors their own review row", () => {
    expect(canCreatePerformanceReview(true)).toBe(true);
    expect(canCreatePerformanceReview(false)).toBe(false);
  });
});

describe("canManageReviewCycles", () => {
  it("is admin-only", () => {
    expect(canManageReviewCycles(true)).toBe(true);
    expect(canManageReviewCycles(false)).toBe(false);
  });
});

// ===========================================================================
// The list view
// ===========================================================================

describe("visiblePerformanceReviews", () => {
  const all = [aliceReview, bobReview, unassignedReview];

  it("gives an employee only their own", () => {
    expect(visiblePerformanceReviews(all, ALICE, false)).toEqual([aliceReview]);
  });

  it("gives a reviewer the reviews assigned to them", () => {
    expect(visiblePerformanceReviews(all, MANAGER, false)).toEqual([aliceReview, bobReview]);
  });

  it("gives an admin everything", () => {
    expect(visiblePerformanceReviews(all, ALICE, true)).toEqual(all);
  });

  it("gives an unauthenticated caller nothing", () => {
    expect(visiblePerformanceReviews(all, null, false)).toEqual([]);
  });
});
