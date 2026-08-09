-- Row-scope performance reviews, constrain the public demo form, and finish the
-- least-privilege pass on SECURITY DEFINER functions.
--
-- MODULE_ID: employee_performance
-- ROLES_ALLOWED: employee, internal_reviewer, marketing, admin, company_admin,
--                platform_admin, super_admin
--
-- WHY (1) — performance reviews were readable by every employee
-- The SELECT policy is named "Employees can view their own reviews and admins
-- can view all". Its predicate was `is_company_portal_employee()`, which
-- implements neither half of that sentence: it is true for all seven portal
-- roles and says nothing about whose review a row is.
--
-- The scoping did exist, but only in the browser. PerformanceReviewManager.tsx
-- filters with `reviews.filter(r => r.employee_user_id === currentUserId)` at
-- render time, so the page hid other people's reviews while the rows — including
-- overall_manager_rating and manager_notes — were already in the payload
-- delivered to that employee's machine. Client-side filtering is presentation,
-- not authorization.
--
-- The UPDATE policy had the same predicate, so any employee could also rewrite
-- any other employee's manager rating. Both tables are empty today (0 rows), so
-- nothing has leaked; this closes it before the first review is written.
--
-- WHY (2) — the demo form accepted anything
-- `with_check = true` on an {anon,authenticated} INSERT means an unauthenticated
-- caller could write unbounded rows and pre-set `status` to hide them from
-- triage. support_tickets already models this correctly; demo_requests now
-- matches it. DemoRequestForm.tsx never sets status and relies on the column
-- default 'new', so the new check passes for the real form unchanged.
--
-- WHY (3) — SECURITY DEFINER grants
-- PUBLIC still held EXECUTE on six functions; every role inherits PUBLIC, so
-- 20260806183707's revoke of the explicit anon/authenticated grants left them
-- reachable anyway.
--
-- DELIBERATE EXCEPTION: is_company_portal_admin() KEEPS its anon grant. The
-- website_content_items SELECT policy is `(status = 'approved') OR
-- is_company_portal_admin()` and applies to {anon,authenticated} — it is the
-- query that serves public site content, and it is the single busiest endpoint
-- on the platform. Revoking anon's EXECUTE there would fail that policy for
-- every anonymous visitor.
--
-- Rollback:
--   The policy changes are reversible by restoring the previous predicates from
--   20260606110000_performance_reviews.sql. The grant revocations are reversed
--   with `GRANT EXECUTE ON FUNCTION <fn> TO PUBLIC;` per function, though doing
--   so restores the least-privilege violation.

/* -------------------------------------------------------------------------- */
/* 1. performance_reviews — scope to the subject, the reviewer, or an admin     */
/* -------------------------------------------------------------------------- */

drop policy if exists "Employees can view their own reviews and admins can view all" on public.performance_reviews;
create policy "Employees read own or reviewed performance reviews"
  on public.performance_reviews for select to authenticated
  using (
    is_company_portal_admin()
    or employee_user_id = (select auth.uid())
    or reviewer_user_id = (select auth.uid())
  );

-- Self-assessment is written by the subject; the manager block is written by the
-- assigned reviewer or an admin. WITH CHECK repeats the predicate so a row
-- cannot be updated *into* someone else's name.
drop policy if exists "Employees can update reviews" on public.performance_reviews;
create policy "Subject reviewer or admin updates performance review"
  on public.performance_reviews for update to authenticated
  using (
    is_company_portal_admin()
    or employee_user_id = (select auth.uid())
    or reviewer_user_id = (select auth.uid())
  )
  with check (
    is_company_portal_admin()
    or employee_user_id = (select auth.uid())
    or reviewer_user_id = (select auth.uid())
  );

-- Reviews are created by the bulk insert behind "Open cycle", which the UI
-- already gates on isAdmin. Nobody should be able to author a review row for
-- themselves.
drop policy if exists "Employees can create reviews" on public.performance_reviews;
create policy "Admins create performance reviews"
  on public.performance_reviews for insert to authenticated
  with check (is_company_portal_admin());

/* -------------------------------------------------------------------------- */
/* 2. performance_review_cycles — readable by staff, writable by admins         */
/* -------------------------------------------------------------------------- */

-- Employees legitimately need to read cycles: their own review renders the
-- cycle's title and due dates. Only the read stays open.
drop policy if exists "Employees can view review cycles" on public.performance_review_cycles;
create policy "Employees read review cycles"
  on public.performance_review_cycles for select to authenticated
  using (is_company_portal_employee());

drop policy if exists "Employees can create review cycles" on public.performance_review_cycles;
drop policy if exists "Employees can update review cycles" on public.performance_review_cycles;

create policy "Admins create review cycles"
  on public.performance_review_cycles for insert to authenticated
  with check (is_company_portal_admin());

create policy "Admins update review cycles"
  on public.performance_review_cycles for update to authenticated
  using (is_company_portal_admin())
  with check (is_company_portal_admin());

/* -------------------------------------------------------------------------- */
/* 3. demo_requests — bound the public insert                                   */
/* -------------------------------------------------------------------------- */

-- Mirrors the support_tickets policy. Length bounds are generous enough for a
-- real enquiry and small enough that the table cannot be used as free storage.
-- Rate limiting is not expressible in RLS and still belongs in the route.
drop policy if exists "Public users can create demo requests" on public.demo_requests;
create policy "Public users can create demo requests"
  on public.demo_requests for insert to anon, authenticated
  with check (
    status = 'new'
    and char_length(coalesce(name, '')) between 1 and 200
    and char_length(coalesce(email, '')) between 3 and 254
    and char_length(coalesce(company, '')) <= 200
    and char_length(coalesce(phone, '')) <= 50
    and char_length(coalesce(role, '')) <= 200
    and char_length(coalesce(company_type, '')) <= 200
    and char_length(coalesce(message, '')) <= 4000
    and coalesce(array_length(interested_products, 1), 0) <= 20
  );

/* -------------------------------------------------------------------------- */
/* 4. SECURITY DEFINER least privilege                                          */
/* -------------------------------------------------------------------------- */

-- Trigger bodies. Never called directly, so no caller needs EXECUTE — the
-- trigger mechanism does not consult it.
revoke execute on function public.enforce_client_proposal_revision_immutability() from public, anon, authenticated;
revoke execute on function private.refresh_time_card_payroll_from_card() from public, anon, authenticated;
revoke execute on function private.refresh_time_card_payroll_from_entry() from public, anon, authenticated;
revoke execute on function private.refresh_time_card_payroll(uuid) from public, anon, authenticated;
revoke execute on function private.enforce_super_admin_time_card_review() from public, anon, authenticated;
revoke execute on function private.create_chat_message_notifications() from public, anon, authenticated;
revoke execute on function private.create_support_ticket_notifications() from public, anon, authenticated;
revoke execute on function private.sync_employee_chat_profile_from_employee_profile() from public, anon, authenticated;
revoke execute on function private.sync_employee_chat_profile_from_user_role() from public, anon, authenticated;

-- Role helpers. RLS policies call these as the *calling* role, so `authenticated`
-- must keep EXECUTE — revoking PUBLIC removes the grant it was inheriting, so it
-- is re-granted explicitly rather than left to inheritance.
revoke execute on function public.is_company_finance_user() from public, anon;
revoke execute on function public.is_company_portal_employee() from public, anon;
revoke execute on function public.is_company_portal_owner() from public, anon;
revoke execute on function public.is_company_portal_super_admin() from public, anon;

grant execute on function public.is_company_finance_user() to authenticated;
grant execute on function public.is_company_portal_employee() to authenticated;
grant execute on function public.is_company_portal_owner() to authenticated;
grant execute on function public.is_company_portal_super_admin() to authenticated;

-- See the DELIBERATE EXCEPTION above: anon must retain this one.
revoke execute on function public.is_company_portal_admin() from public;
grant execute on function public.is_company_portal_admin() to anon, authenticated;

/* -------------------------------------------------------------------------- */
/* 5. Pin search_path on the last three unpinned definer functions              */
/* -------------------------------------------------------------------------- */

-- A SECURITY DEFINER function without a pinned search_path resolves unqualified
-- names through the caller's path while running as its owner. Every other
-- definer function on this database is already pinned; these three were missed.
alter function private.refresh_time_card_payroll(uuid) set search_path = public, private;
alter function private.refresh_time_card_payroll_from_card() set search_path = public, private;
alter function private.refresh_time_card_payroll_from_entry() set search_path = public, private;
