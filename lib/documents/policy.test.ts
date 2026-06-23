import { describe, expect, it } from "vitest";
import { canPublishDraft } from "./policy";

describe("canPublishDraft (Human Authority Rule)", () => {
  it("blocks publishing a review-required draft that is not approved", () => {
    for (const reviewStatus of ["draft", "needs_review", "rejected", "changes_requested"]) {
      const result = canPublishDraft({ humanReviewRequired: true, reviewStatus, alreadyPublished: false });
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/approved by a human reviewer/i);
    }
  });

  it("allows publishing once a review-required draft is approved", () => {
    expect(canPublishDraft({ humanReviewRequired: true, reviewStatus: "approved", alreadyPublished: false })).toEqual({
      ok: true,
    });
  });

  it("blocks double-publishing regardless of review state", () => {
    const result = canPublishDraft({ humanReviewRequired: false, reviewStatus: "approved", alreadyPublished: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already been published/i);
  });

  it("allows publishing when human review is not required and not yet published", () => {
    expect(canPublishDraft({ humanReviewRequired: false, reviewStatus: "draft", alreadyPublished: false })).toEqual({
      ok: true,
    });
  });
});
