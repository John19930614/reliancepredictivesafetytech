// Who may see and change a performance review.
//
// These predicates mirror the RLS policies in
// 20260809180000_scope_reviews_and_tighten_grants.sql one for one. The database
// is the enforcement; this module exists so the UI reaches the same answer
// without guessing, and so the rule is unit-testable.
//
// Keep the two in step. If a predicate here gains a clause, the policy needs the
// same clause — otherwise the UI offers an action the database will refuse, or
// worse, hides one it would have allowed.
//
// HISTORY
// Before that migration the SELECT policy was `is_company_portal_employee()`,
// true for all seven portal roles. PerformanceReviewManager.tsx filtered the
// rows in the browser, so the list looked correct while every employee's
// manager rating and private notes travelled to every other employee's machine.
// Filtering in the client is presentation. This is authorization.

/** The fields any access decision depends on. */
export interface ReviewSubject {
  employee_user_id: string;
  reviewer_user_id?: string | null;
}

/**
 * Readable by the person being reviewed, the assigned reviewer, or an admin.
 *
 * `userId` may be null/empty for an unauthenticated caller, which must never
 * match a row — an empty string is not a user id, and comparing it loosely would
 * make a row with a null reviewer readable by anyone.
 */
export function canReadPerformanceReview(
  review: ReviewSubject,
  userId: string | null | undefined,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  if (!userId) return false;
  return review.employee_user_id === userId || review.reviewer_user_id === userId;
}

/**
 * Updatable by the same three parties.
 *
 * The subject writes their self-assessment; the reviewer or an admin writes the
 * manager block. Which *columns* each may write is enforced by the form, not
 * here — RLS grants the row, not the field.
 */
export function canUpdatePerformanceReview(
  review: ReviewSubject,
  userId: string | null | undefined,
  isAdmin: boolean,
): boolean {
  return canReadPerformanceReview(review, userId, isAdmin);
}

/**
 * Only admins create reviews.
 *
 * Rows are created by the bulk insert behind "Open cycle". Letting an employee
 * author their own review row would let them pick their own reviewer.
 */
export function canCreatePerformanceReview(isAdmin: boolean): boolean {
  return isAdmin;
}

/** Cycles are HR-owned configuration: everyone reads, only admins write. */
export function canManageReviewCycles(isAdmin: boolean): boolean {
  return isAdmin;
}

/**
 * The reviews a given user may see, in one call.
 *
 * Prefer this over filtering inline: the point of the migration was that a
 * hand-rolled `.filter()` in a component is easy to get right for display and
 * easy to forget entirely.
 */
export function visiblePerformanceReviews<T extends ReviewSubject>(
  reviews: readonly T[],
  userId: string | null | undefined,
  isAdmin: boolean,
): T[] {
  return reviews.filter((review) => canReadPerformanceReview(review, userId, isAdmin));
}
