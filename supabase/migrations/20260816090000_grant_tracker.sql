-- Grant Tracker — the funding programmes the company is pursuing.
--
-- MODULE_ID: grant_tracker
-- PURPOSE: One controlled record per grant or funding programme, from first
--   sighting through application to award, decline or disqualification.
-- GROUP: Command
-- PATH_PREFIX: /employee/grants
-- DATA_OBJECTS: company_grant_opportunities
-- WORKFLOW_STATES: identified -> researching -> inquiry_sent -> pre_registered
--   -> application_submitted -> awarded | declined; plus not_eligible and
--   on_hold, reachable from any pre-terminal state.
--
-- WHY A NEW TABLE. This lives in a Google Sheet today. Nothing in the platform
-- models money coming IN from a programme: company_finance_transactions records
-- money that has already moved, and opportunities models a deal we sell. A grant
-- is neither — it is an application with a fee, a deadline, an agency contact
-- and an outcome, and none of those columns exist anywhere.
--
-- NO SEPARATE HISTORY TABLE, unlike opportunity_stage_events. That one exists
-- because "days in step" and "who skipped Discovery" are on every lifecycle
-- screen. Here the only history question is "when did we submit and what
-- happened", which status_changed_at plus the platform_audit_events rows written
-- by recordAuditEvent() already answer. A second table would be write
-- amplification for a read nothing performs.
--
-- STRICTLY ADDITIVE. The only existing object touched is the
-- portal_user_module_access module_key CHECK, which is re-declared as a strict
-- superset of the list in 20260810100000_file_center.sql.
--
-- ROLLBACK:
--   drop table if exists public.company_grant_opportunities;
--   drop function if exists public.set_grant_status_changed_at();
--   delete from public.portal_user_module_access where module_key = 'grant_tracker';
--   -- then re-apply the module_key check from 20260810100000_file_center.sql verbatim

/* -------------------------------------------------------------------------- */
/* 1. The grant record                                                        */
/* -------------------------------------------------------------------------- */

create table if not exists public.company_grant_opportunities (
  id                   uuid primary key default gen_random_uuid(),

  name                 text not null check (char_length(btrim(name)) between 1 and 200),

  -- Agency and sub_agency are separate because SBIR is one programme run by many
  -- agencies: the NOAA and NIST rows are different applications with different
  -- contacts, and collapsing them into one name would lose an application.
  agency               text check (agency is null or char_length(agency) <= 200),
  sub_agency           text check (sub_agency is null or char_length(sub_agency) <= 200),

  -- Free text on purpose. The source holds email addresses AND phone numbers in
  -- one column (info@f1stcp.com, 1-800-649-6273), and splitting them would
  -- either drop data or invent a shape the sheet never had.
  contact              text check (contact is null or char_length(contact) <= 200),

  /* --- Where it is ------------------------------------------------------- */

  -- Status keys are snake_case and STABLE. Display labels live in
  -- lib/grants/statuses.ts; renaming a label must never strand a stored row.
  status               text not null default 'identified'
                         check (status in (
                           'identified', 'researching', 'inquiry_sent', 'pre_registered',
                           'application_submitted', 'on_hold',
                           'awarded', 'declined', 'not_eligible'
                         )),
  -- Kept by a trigger, not by callers. Same lesson as opportunities.step_changed_at.
  status_changed_at    timestamptz not null default now(),

  /* --- What it asks for -------------------------------------------------- */

  -- The verbatim "What is needed" column. Long, messy, and the single most
  -- useful field in the sheet — it is what tells you why a row is stuck.
  requirements         text check (requirements is null or char_length(requirements) <= 4000),

  -- A fee is not always an application fee: NASE charges $125 for MEMBERSHIP
  -- before you may apply at all, which is a different decision from Freed's $19
  -- filing fee. Flattening the two hides that.
  fee_amount           numeric(10, 2) check (fee_amount is null or fee_amount >= 0),
  fee_kind             text check (fee_kind is null or fee_kind in ('application', 'membership', 'other')),
  fee_paid             boolean not null default false,

  -- What the programme is worth if we win it, when the programme states it.
  award_amount         numeric(12, 2) check (award_amount is null or award_amount >= 0),

  /* --- Where to read about it -------------------------------------------- */

  -- Split deliberately. Several source cells are not links at all ("$500 Freed
  -- Fellowship Grant") and several are links truncated by the source export. A
  -- truncated URL in website_url would render as a broken anchor; as a label it
  -- renders as the text it actually is, and stays findable.
  website_url          text check (website_url is null or website_url ~ '^https?://'),
  website_label        text check (website_label is null or char_length(website_label) <= 300),

  /* --- When -------------------------------------------------------------- */

  -- The Tadlock grant opens 2026-09-15; an open date is not a deadline, and
  -- storing it as one would put the row on the wrong end of every sort.
  opens_on             date,
  deadline             date,
  submitted_at         timestamptz,

  /* --- Who, and what next ------------------------------------------------ */

  owner_user_id        uuid references auth.users(id) on delete set null,
  next_action          text check (next_action is null or char_length(next_action) <= 500),
  next_action_due      date,
  notes                text check (notes is null or char_length(notes) <= 8000),

  /* --- How it ended ------------------------------------------------------ */

  outcome_reason       text check (outcome_reason is null or char_length(outcome_reason) <= 1000),
  decided_at           timestamptz,

  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- NO decided_by column, deliberately, for the reason documented on
  -- company_profiles: an `on delete set null` FK runs an UPDATE that is itself
  -- subject to CHECK constraints, so pairing decided_at with a decided_by FK
  -- makes removing that user from the portal fail with 23514 forever.
  -- recordAuditEvent() already names who decided.

  -- A finished row has to say why. Without this, "declined" and "not_eligible"
  -- collapse into "it stopped", which is exactly what the spreadsheet does.
  constraint company_grant_opportunities_outcome_has_reason
    check (
      status not in ('awarded', 'declined', 'not_eligible')
      or outcome_reason is not null
    ),

  -- Paid what, exactly? A paid flag with no amount is unauditable.
  constraint company_grant_opportunities_fee_paid_needs_amount
    check (fee_paid = false or fee_amount is not null),

  -- A fee kind with no fee is a label on nothing.
  constraint company_grant_opportunities_fee_kind_needs_amount
    check (fee_kind is null or fee_amount is not null),

  -- Applications open before they close.
  constraint company_grant_opportunities_window_ordered
    check (opens_on is null or deadline is null or opens_on <= deadline)
);

comment on table public.company_grant_opportunities is
  'Grant and funding programmes the company is pursuing. Ported from the Grant Tracker sheet; status keys are defined in lib/grants/statuses.ts.';

comment on column public.company_grant_opportunities.sub_agency is
  'Distinguishes programmes run by many agencies — the two SBIR rows (NOAA, NIST) are separate applications, and the uniqueness index depends on this.';

comment on column public.company_grant_opportunities.website_label is
  'Display text for a source cell that is not a URL, or a URL too truncated to link. website_url holds only links that actually resolve.';

/* -------------------------------------------------------------------------- */
/* 2. Indexes                                                                 */
/* -------------------------------------------------------------------------- */

-- One row per programme per sub-agency. SBIR/NOAA and SBIR/NIST are different
-- applications; SBIR entered twice for NOAA is a duplicate. Postgres treats
-- nulls as distinct in unique indexes, which would exempt every row with no
-- sub_agency from the rule, so it is coalesced to ''.
create unique index if not exists company_grant_opportunities_name_agency_key
  on public.company_grant_opportunities (
    lower(btrim(name)),
    lower(coalesce(btrim(sub_agency), ''))
  );

-- The list groups by status, most recent activity first.
create index if not exists company_grant_opportunities_status_idx
  on public.company_grant_opportunities (status, status_changed_at desc);

-- "What is due next" — only live rows, so the index does not carry the archive.
create index if not exists company_grant_opportunities_deadline_idx
  on public.company_grant_opportunities (deadline)
  where deadline is not null
    and status not in ('awarded', 'declined', 'not_eligible');

create index if not exists company_grant_opportunities_owner_idx
  on public.company_grant_opportunities (owner_user_id)
  where owner_user_id is not null;

/* -------------------------------------------------------------------------- */
/* 3. Triggers                                                                */
/* -------------------------------------------------------------------------- */

drop trigger if exists set_company_grant_opportunities_updated_at
  on public.company_grant_opportunities;
create trigger set_company_grant_opportunities_updated_at
before update on public.company_grant_opportunities
for each row execute function public.set_updated_at();

-- status_changed_at belongs to the database, not the caller. Learned from
-- stage_changed_at on company_clients, which four code paths write and three
-- forgot; "days in status" is on the page, so the database keeps it.
create or replace function public.set_grant_status_changed_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();

    if new.status in ('awarded', 'declined', 'not_eligible') then
      new.decided_at := coalesce(new.decided_at, now());
    else
      new.decided_at := null;
    end if;

    if new.status = 'application_submitted' then
      new.submitted_at := coalesce(new.submitted_at, now());
    end if;
  end if;

  return new;
end $$;

drop trigger if exists set_grant_status_changed_at on public.company_grant_opportunities;
create trigger set_grant_status_changed_at
before update on public.company_grant_opportunities
for each row execute function public.set_grant_status_changed_at();

/* -------------------------------------------------------------------------- */
/* 4. RLS                                                                     */
/* -------------------------------------------------------------------------- */

-- The app-side gates in lib/grants/policy.ts are the enforcement path; these
-- policies are the backstop that stops a hand-crafted PostgREST call writing
-- something the UI would never permit. Same posture as opportunities.

alter table public.company_grant_opportunities enable row level security;

grant select, insert, update, delete on public.company_grant_opportunities to authenticated;

drop policy if exists "Employees can read grant opportunities"
  on public.company_grant_opportunities;
create policy "Employees can read grant opportunities"
  on public.company_grant_opportunities for select to authenticated
  using (public.is_company_portal_employee());

-- A new row cannot be conjured straight into an outcome. Awarded, declined and
-- not_eligible are reported results others act on, so they are reached by an
-- UPDATE — which is the transition the audit trail records. created_by is
-- pinned to the caller so a row cannot be attributed to a colleague, the same
-- rule as opportunity_stage_events.changed_by.
drop policy if exists "Employees can create grant opportunities"
  on public.company_grant_opportunities;
create policy "Employees can create grant opportunities"
  on public.company_grant_opportunities for insert to authenticated
  with check (
    public.is_company_portal_employee()
    and status not in ('awarded', 'declined', 'not_eligible')
    and outcome_reason is null
    and decided_at is null
    and created_by = (select auth.uid())
  );

drop policy if exists "Employees can update live grant opportunities"
  on public.company_grant_opportunities;
create policy "Employees can update live grant opportunities"
  on public.company_grant_opportunities for update to authenticated
  using (
    public.is_company_portal_employee()
    and status not in ('awarded', 'declined', 'not_eligible')
  )
  with check (public.is_company_portal_employee());

-- Editing a row after it has been awarded or declined rewrites a reported
-- outcome — the amount somebody may already have put in a forecast. Admin act.
drop policy if exists "Admins can update any grant opportunity"
  on public.company_grant_opportunities;
create policy "Admins can update any grant opportunity"
  on public.company_grant_opportunities for update to authenticated
  using (public.is_company_portal_admin())
  with check (public.is_company_portal_admin());

-- Deleting discards the application history and the fee we paid. Setting
-- not_eligible with a reason is the supported route; removal is an admin act.
drop policy if exists "Admins can delete grant opportunities"
  on public.company_grant_opportunities;
create policy "Admins can delete grant opportunities"
  on public.company_grant_opportunities for delete to authenticated
  using (public.is_company_portal_admin());

/* -------------------------------------------------------------------------- */
/* 5. Module access                                                           */
/* -------------------------------------------------------------------------- */

-- Re-declared in full so it matches portalModuleKeys in lib/user-management.ts,
-- which lib/grants/migration-parity.test.ts now asserts. Two keys are added
-- versus 20260810100000_file_center.sql: 'grant_tracker' (this module) and
-- 'client_lifecycle', which reached the catalog in
-- 20260814140000_client_lifecycle_opportunities.sql without the constraint being
-- widened — so granting that module per-user has been failing with 23514 ever
-- since. Widening a CHECK is additive and rejects nothing that was valid before.
alter table public.portal_user_module_access
  drop constraint if exists portal_user_module_access_module_key_check;

alter table public.portal_user_module_access
  add constraint portal_user_module_access_module_key_check
  check (
    module_key in (
      'dashboard',
      'mobile_app',
      'ai_command',
      'website_operations',
      'work_management',
      'parking_lots',
      'employee_expenses',
      'reports',
      'finance',
      'payroll_tracker',
      'grant_tracker',
      'operations_database',
      'startup_checklist',
      'demo_showcase',
      'request_inbox',
      'sales_pipeline',
      'client_lifecycle',
      'client_proposals',
      'ehs_talent_engine',
      'active_companies',
      'employee_mail',
      'company_tree',
      'hr_onboarding',
      'training',
      'performance_reviews',
      'hr_documents',
      'time_cards',
      'employee_time_off',
      'employee_calendar',
      'master_document_library',
      'file_center',
      'ai_document_builder',
      'legal_issues',
      'legal_register',
      'required_documents',
      'launch_gate',
      'users',
      'settings',
      'platform_sprint',
      'platform_releases',
      'platform_qa',
      'platform_metrics',
      'platform_docs',
      'platform_packages',
      'platform_billing',
      'platform_audit',
      'platform_ai_services',
      'platform_infrastructure',
      'platform_dev_command'
    )
  );

-- NO BACKFILL, unlike file_center. The tracker shows what the company is
-- applying for, what it has paid to apply, and what it has been told it does not
-- qualify for — a funding-strategy view, not a whole-team utility. It is granted
-- deliberately, per user, and is deliberately absent from
-- defaultEmployeePortalModuleKeys. Owner roles (super_admin / platform_admin)
-- reach it without a grant via hasFullPortalVisibility().

/* -------------------------------------------------------------------------- */
/* 6. Seed — the twelve rows from the Grant Tracker sheet                      */
/* -------------------------------------------------------------------------- */

-- Verbatim from the source, including its typos ("recieve", "attendence"): this
-- is the record of what was written, and silently correcting it makes the sheet
-- and the table disagree about what was said. Four website cells were truncated
-- in the source export and are carried as labels rather than links, flagged in
-- notes for someone to confirm — a broken href is worse than plain text.
-- created_by is null: these rows predate the module, so no portal user authored
-- them, and the FK is nullable for exactly this case.

with seed_grants(
  name, agency, sub_agency, contact, status, requirements,
  fee_amount, fee_kind, fee_paid, award_amount,
  website_url, website_label, opens_on, notes, outcome_reason
) as (
  values
    ('F1st CP', null, null, 'info@f1stcp.com', 'application_submitted',
     'Applied',
     null::numeric, null, false, null::numeric,
     null, 'Small Certified Supplier Innovative Finance Program', null::date,
     'Programme name was cut off in the source sheet — confirm the exact legal name and add the agency.',
     null),

    ('Freed Fellowship Grant', null, null, null, 'researching',
     '$500 grant $19 app fee potential to recieve business advice and $2500 at year end',
     19.00, 'application', false, 500.00,
     null, '$500 Freed Fellowship Grant', null,
     'Year-end follow-on of $2,500 is not modelled as a separate row; it is the same programme.',
     null),

    ('Lighter Capital', null, null, null, 'on_hold',
     'future objective this is capital investment not grants',
     null, null, false, null,
     null, 'https://www.lightercapital.com/guides/raising-ca...', null,
     'Revenue-based financing, not a grant. Kept in the tracker as a funding route. Source URL truncated — confirm before linking.',
     null),

    ('NASE Growth Grant', 'National Association for the Self-Employed', null, '1-800-649-6273', 'researching',
     'This also requires a $125 membership to NASE to apply along with: Statement of Grant use, P&L statement, Business Plan, Photo of Member, any additional supporting documents we could provide',
     125.00, 'membership', false, null,
     null, 'https://www.nase.org/become-a-member/mem...', null,
     'The $125 is a membership gate, not a filing fee — fee_kind reflects that. Source URL truncated.',
     null),

    ('Outta Excuses', null, null, 'grant@outtaexcuses.com', 'application_submitted',
     '$15 application fee. Paid.',
     15.00, 'application', true, null,
     null, null, null, null, null),

    ('SBIR', null, 'NOAA', 'noaa.sbir@noaa.gov', 'inquiry_sent',
     'response/more research',
     null, null, false, null,
     null, null, null,
     'One of two SBIR rows; NOAA and NIST are separate applications under the same programme.',
     null),

    ('SBIR', null, 'NIST', 'sbir@nist.gov', 'inquiry_sent',
     'response/more research',
     null, null, false, null,
     null, null, null,
     'One of two SBIR rows; NOAA and NIST are separate applications under the same programme.',
     null),

    ('SecretSOS', null, null, null, 'application_submitted',
     '$15 application fee. Paid.',
     15.00, 'application', true, null,
     'https://secretsos.com/', null, null, null, null),

    ('Stephen L. Tadlock for Veterans (National Grant)', null, null, null, 'pre_registered',
     'Applications open September 15th 2026, pre-reg completed',
     null, null, false, null,
     null, null, '2026-09-15'::date,
     'Pre-registration complete. Move to application_submitted once the window opens.',
     null),

    ('$20,000 Veteran Founder grant', null, null, null, 'identified',
     '$20k opportunity more review to look into',
     null, null, false, 20000.00,
     null, 'linkedin.com/pulse/20000-veteran-...', null,
     'Sourced from a LinkedIn article; the source URL is truncated and has no scheme. Confirm the sponsoring organisation.',
     null),

    ('Warrior Rising - Business Showers', 'Warrior Rising', null, null, 'researching',
     'Requires attendence and graduation of warrior university which then requires highly competitive application',
     null, null, false, null,
     null, null, null,
     'Two gates: Warrior University graduation, then a competitive application.',
     null),

    ('Zensurance Grant', 'Zensurance', null, null, 'not_eligible',
     'Our product must help generate revenue for Canadian Businesses. at the current time we don''t to my knowledge will ask Steve and John regarding this',
     null, null, false, null,
     null, null, null,
     'Re-open if the product line changes to serve Canadian businesses.',
     'Programme requires the product to generate revenue for Canadian businesses; we do not at present. Confirm with Steve and John before closing permanently.')
)
insert into public.company_grant_opportunities (
  name, agency, sub_agency, contact, status, requirements,
  fee_amount, fee_kind, fee_paid, award_amount,
  website_url, website_label, opens_on, notes, outcome_reason,
  decided_at, submitted_at, created_by
)
select
  name, agency, sub_agency, contact, status, requirements,
  fee_amount, fee_kind, fee_paid, award_amount,
  website_url, website_label, opens_on, notes, outcome_reason,
  -- The outcome constraint needs a reason, not a moment, but a decided row with
  -- no date reads as undecided on the page. The sheet records no dates, so the
  -- seed timestamp is the honest answer: this is when we recorded it.
  case when status in ('awarded', 'declined', 'not_eligible') then now() end,
  -- Likewise: the sheet says these were submitted, not when.
  case when status = 'application_submitted' then now() end,
  null
from seed_grants
on conflict (lower(btrim(name)), lower(coalesce(btrim(sub_agency), ''))) do nothing;
