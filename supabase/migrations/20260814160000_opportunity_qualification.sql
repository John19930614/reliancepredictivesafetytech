-- Discovery and qualification facts for an opportunity — lifecycle steps 5 & 6.
--
-- MODULE_ID: client_lifecycle
--
-- Step 5 (Discovery) asks what the client needs, who decides, and what the money
-- and the timeline look like. Step 6 (Opportunity Qualified) asks whether those
-- four answers add up to a real opportunity — authority, need, budget, timeline,
-- which is BANT, and which the lifecycle map names verbatim.
--
-- A SEPARATE 1:1 TABLE rather than more columns on opportunities. These fields
-- are only meaningful once a deal reaches step 5, most opportunities in a
-- pipeline have not, and opportunities is already the row every lifecycle screen
-- reads — widening it with a dozen mostly-null qualification columns makes every
-- one of those reads carry them.
--
-- STRICTLY ADDITIVE. Nothing existing is read, written or altered.
--
-- ROLLBACK:
--   drop table if exists public.opportunity_qualification;

create table if not exists public.opportunity_qualification (
  -- PRIMARY KEY, not just a foreign key: one qualification record per
  -- opportunity, enforced by the database rather than by remembering to upsert.
  opportunity_id        uuid primary key references public.opportunities(id) on delete cascade,

  /* --- Step 5: Discovery -------------------------------------------------- */

  discovery_call_at     timestamptz,
  primary_need          text check (primary_need is null or char_length(primary_need) <= 2000),
  pain_points           text check (pain_points is null or char_length(pain_points) <= 4000),
  -- Free text rather than a link to company_client_contacts: at Discovery the
  -- names are often known before anyone has created contact records, and
  -- forcing that first is how discovery notes end up in a notebook instead.
  decision_makers       text check (decision_makers is null or char_length(decision_makers) <= 2000),
  budget_range          text check (budget_range is null or char_length(budget_range) <= 200),
  timeline              text check (timeline is null or char_length(timeline) <= 200),

  /* --- Step 6: Qualified -------------------------------------------------- */

  -- BANT, one boolean each. Deliberately not a single score: "we have budget
  -- but no timeline" and "we have timeline but no budget" are different deals,
  -- and a 50% would hide which.
  has_budget            boolean not null default false,
  has_authority         boolean not null default false,
  has_need              boolean not null default false,
  has_timeline          boolean not null default false,

  competition           text check (competition is null or char_length(competition) <= 1000),

  qualified_at          timestamptz,
  qualified_by          uuid references auth.users(id) on delete set null,

  updated_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- A record that claims it was qualified has to say who did it, and when.
  constraint opportunity_qualification_qualified_has_actor
    check (qualified_at is null or qualified_by is not null)
);

create index if not exists opportunity_qualification_qualified_idx
  on public.opportunity_qualification (qualified_at desc)
  where qualified_at is not null;

drop trigger if exists set_opportunity_qualification_updated_at on public.opportunity_qualification;
create trigger set_opportunity_qualification_updated_at
before update on public.opportunity_qualification
for each row execute function public.set_updated_at();

/* -------------------------------------------------------------------------- */
/* RLS                                                                        */
/* -------------------------------------------------------------------------- */

alter table public.opportunity_qualification enable row level security;

drop policy if exists "Employees can read qualification" on public.opportunity_qualification;
create policy "Employees can read qualification"
  on public.opportunity_qualification for select to authenticated
  using (public.is_company_portal_employee());

-- Writable only while the parent opportunity is still open. Qualification notes
-- on a closed deal are history: editing them after the outcome is reported
-- rewrites the reasoning behind a number somebody has already acted on.
drop policy if exists "Employees can write qualification" on public.opportunity_qualification;
create policy "Employees can write qualification"
  on public.opportunity_qualification for insert to authenticated
  with check (
    public.is_company_portal_employee()
    and exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id and o.status = 'open'
    )
  );

drop policy if exists "Employees can update qualification" on public.opportunity_qualification;
create policy "Employees can update qualification"
  on public.opportunity_qualification for update to authenticated
  using (
    public.is_company_portal_employee()
    and exists (
      select 1 from public.opportunities o
      where o.id = opportunity_id and o.status = 'open'
    )
  )
  with check (public.is_company_portal_employee());

drop policy if exists "Admins can delete qualification" on public.opportunity_qualification;
create policy "Admins can delete qualification"
  on public.opportunity_qualification for delete to authenticated
  using (public.is_company_portal_admin());
