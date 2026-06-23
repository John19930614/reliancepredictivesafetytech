// Pure publish-gate logic for the Document Builder, kept separate from the
// server action so the Human Authority Rule can be unit-tested directly.

export interface PublishGateInput {
  humanReviewRequired: boolean;
  reviewStatus: string;
  alreadyPublished: boolean;
}

export interface PublishGateResult {
  ok: boolean;
  reason?: string;
}

/**
 * Human Authority Rule (CLAUDE.md): a draft that requires human review may not be
 * published until a human reviewer/admin has approved it. Also blocks double-publish.
 */
export function canPublishDraft(input: PublishGateInput): PublishGateResult {
  if (input.alreadyPublished) {
    return { ok: false, reason: "This draft has already been published." };
  }
  if (input.humanReviewRequired && input.reviewStatus !== "approved") {
    return { ok: false, reason: "This document must be approved by a human reviewer before it can be published." };
  }
  return { ok: true };
}
