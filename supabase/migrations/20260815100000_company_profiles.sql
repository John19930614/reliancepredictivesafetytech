-- The firmographics a safety contract is actually priced on.
--
-- MODULE_ID: active_companies (the editor lives under /employee/clients, which
--   the active_companies catalog entry already covers by prefix.)
--
-- WHY THIS EXISTS. company_clients knows a company's name, contact and stage.
-- It does not know how many people work there, across how many sites, doing how
-- dangerous a job, with what loss record — which is everything a safety
-- programme is scoped and priced on. Deal value was therefore a number somebody
-- typed into the opportunity with nothing behind it.
--
-- A SEPARATE 1:1 TABLE rather than more columns on company_clients. Same
-- reasoning as opportunity_qualification: company_clients is read by the sales
-- board, the client list, the proposal builder and the mobile app, and widening
-- it with a dozen mostly-null columns makes every one of those reads carry them.
--
-- WHAT IS AND IS NOT HERE. Revenue is stored but is deliberately NOT a pricing
-- driver — see lib/pricing/contract-estimate.ts, where it acts only as a sanity
-- ceiling. The drivers are headcount, sites, hazard class and the loss record
-- (EMR/TRIR), because those are what the work actually scales on.
--
-- STRICTLY ADDITIVE. No existing table, column, policy or row is touched.
--
-- ROLLBACK:
--   drop table if exists public.company_profiles;

create table if not exists public.company_profiles (
  -- PRIMARY KEY, not merely a foreign key: one profile per company, enforced by
  -- the database rather than by remembering to upsert.
  client_id              uuid primary key references public.company_clients(id) on delete cascade,

  /* --- Size: what the contract scales on --------------------------------- */

  employee_count         integer check (employee_count is null or employee_count between 0 and 500000),
  site_count             integer check (site_count is null or site_count between 0 and 5000),
  -- Stored for context and for the estimator's revenue ceiling. Never a driver.
  annual_revenue         numeric(16, 2) check (annual_revenue is null or annual_revenue >= 0),
  currency               text not null default 'USD' check (char_length(currency) = 3),

  /* --- Where ------------------------------------------------------------- */

  primary_state          text check (primary_state is null or char_length(primary_state) <= 100),
  -- Free text rather than an array: multi-state operators write things like
  -- "TX, OK, NM (seasonal)", and forcing a clean list here loses the caveat.
  states_operated        text check (states_operated is null or char_length(states_operated) <= 500),

  /* --- Risk: for a safety vendor this is what moves price ----------------- */

  naics_code             text check (naics_code is null or naics_code ~ '^[0-9]{2,6}$'),
  hazard_class           text check (hazard_class is null or hazard_class in ('low', 'moderate', 'high', 'severe')),

  -- Experience Modification Rate. 1.00 is the industry average; above it means
  -- a worse loss history and a higher insurance premium already being paid.
  emr                    numeric(4, 2) check (emr is null or emr between 0 and 10),
  -- Total Recordable Incident Rate per 100 workers per year.
  trir                   numeric(5, 2) check (trir is null or trir between 0 and 200),

  recordables_12mo       integer check (recordables_12mo is null or recordables_12mo >= 0),
  lost_time_12mo         integer check (lost_time_12mo is null or lost_time_12mo >= 0),
  osha_citations_3yr     integer check (osha_citations_3yr is null or osha_citations_3yr >= 0),

  union_workforce        boolean,
  -- A rotating population needs orientation and verification every turnover,
  -- and the client owns the liability without owning the training records.
  contractor_share_pct   integer check (contractor_share_pct is null or contractor_share_pct between 0 and 100),

  /* --- Provenance -------------------------------------------------------- */

  notes                  text check (notes is null or char_length(notes) <= 4000),
  -- Set when a person confirms the numbers came from the client rather than a
  -- guess. An unverified profile still estimates; it just says so.
  verified_at            timestamptz,
  verified_by            uuid references auth.users(id) on delete set null,

  updated_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- NO "verified_at implies verified_by" CHECK, deliberately.
  --
  -- verified_by is ON DELETE SET NULL, and that FK action runs an UPDATE which
  -- is itself subject to CHECK constraints. Pairing the two makes the parent
  -- DELETE fail with 23514: once somebody verifies a profile, that user can
  -- never be removed from the portal. opportunity_qualification already carries
  -- this exact pair (qualified_at / qualified_by) and already has the bug.
  --
  -- verified_at alone is the claim. Somebody verified these numbers on that
  -- date; if they have since left the company, the verification still happened
  -- and the audit trail still names them.

  -- Lost-time incidents are a subset of recordables. A row claiming more of the
  -- former than the latter is a data-entry error, and it would skew any rate
  -- computed from it.
  constraint company_profiles_lost_time_within_recordables
    check (
      lost_time_12mo is null
      or recordables_12mo is null
      or lost_time_12mo <= recordables_12mo
    )
);

comment on table public.company_profiles is
  'Firmographics and safety loss record for one company. Feeds lib/pricing/contract-estimate.ts; revenue is a ceiling there, never a driver.';

comment on column public.company_profiles.emr is
  'Experience Modification Rate. 1.00 = industry average; higher means a worse loss history.';

-- No secondary index. The estimator reads by client, which is the primary key,
-- and nothing lists profiles on their own — an index on hazard_class would be
-- write amplification for a lookup nothing performs.

drop trigger if exists set_company_profiles_updated_at on public.company_profiles;
create trigger set_company_profiles_updated_at
before update on public.company_profiles
for each row execute function public.set_updated_at();

/* -------------------------------------------------------------------------- */
/* RLS                                                                        */
/* -------------------------------------------------------------------------- */

alter table public.company_profiles enable row level security;

-- Readable by any portal employee: the estimate is a sales tool, and the whole
-- point is that the person working the deal can see what drives the number.
drop policy if exists "Employees can read company profiles" on public.company_profiles;
create policy "Employees can read company profiles"
  on public.company_profiles for select to authenticated
  using (public.is_company_portal_employee());

-- A profile arrives unverified. Verification is a claim about provenance — it
-- is what separates a real number from a guess — so it cannot be smuggled in on
-- the insert that creates the row.
drop policy if exists "Employees can create company profiles" on public.company_profiles;
create policy "Employees can create company profiles"
  on public.company_profiles for insert to authenticated
  with check (
    public.is_company_portal_employee()
    and verified_at is null
    and verified_by is null
  );

-- verified_by is pinned to the caller, so a verification cannot be attributed
-- to a colleague. Same rule as opportunity_stage_events.changed_by and
-- client_invoices.created_by; without it any employee could stamp the CFO's id
-- onto numbers they made up.
drop policy if exists "Employees can update company profiles" on public.company_profiles;
create policy "Employees can update company profiles"
  on public.company_profiles for update to authenticated
  using (public.is_company_portal_employee())
  with check (
    public.is_company_portal_employee()
    and (verified_by is null or verified_by = (select auth.uid()))
  );

-- Deleting a profile discards a client's loss history. Voiding the numbers by
-- editing them is the supported route; removal is an admin act.
drop policy if exists "Admins can delete company profiles" on public.company_profiles;
create policy "Admins can delete company profiles"
  on public.company_profiles for delete to authenticated
  using (public.is_company_portal_admin());
