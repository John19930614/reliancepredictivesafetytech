-- Per-client proposal references: HUN-01, SE-02 — not RPS-2026-0003.
--
-- MODULE_ID: client_proposals
--
-- WHY
-- Decision from the 2026-08-07 build review: proposal numbers switch from the
-- global "RPS-YYYY-NNNN" scheme to a per-client code — a 2–3 letter moniker
-- assigned by whoever writes that client's first proposal (SE = Staff Electric,
-- HUN = Hunzinger), followed by a per-client sequence (01, 02, 03…). On an
-- initials collision the team extends the code (e.g. "Staff Electric Company
-- Incorporated" → SEC); the state initial is never used. The system's job is to
-- store the moniker, enforce uniqueness, and hand out the next number.
--
-- HOW
--   * company_clients.client_code — the moniker. Nullable (a client has none
--     until a human assigns it), CHECK-constrained to 2–3 uppercase letters,
--     unique across clients.
--   * company_clients.proposal_seq — the last sequence number allocated for
--     this client. Bumped atomically (UPDATE … RETURNING), so two proposals
--     created at the same moment cannot share a number.
--   * allocate_client_proposal_number() — BEFORE INSERT trigger on
--     client_proposals. A client with a code gets CODE-NN; anything else
--     (no client assigned, or client not yet given a code) falls back to the
--     existing global allocator, so proposal_number never comes out null. The
--     trigger replaces the column DEFAULT, which could not see NEW.client_id.
--   * renumber_client_draft_proposals(uuid) — moves a client's DRAFT proposals
--     onto the new scheme in creation order and mirrors the number into
--     form_data.fields.proposalNo (the document prints from form state).
--     SECURITY INVOKER on purpose: it can only renumber rows the caller's RLS
--     already lets them update, so granting EXECUTE to authenticated adds no
--     authority. Sent / accepted / declined proposals are never touched — the
--     reference a client was quoted must stay quotable.
--
-- The two codes decided in the meeting are seeded below, and those clients'
-- draft proposals are renumbered, so the Hunzinger pilot goes to Sue as HUN-01.
--
-- Rollback:
--   drop trigger if exists allocate_client_proposal_number on public.client_proposals;
--   drop function if exists public.allocate_client_proposal_number();
--   drop function if exists public.renumber_client_draft_proposals(uuid);
--   alter table public.client_proposals
--     alter column proposal_number set default public.next_client_proposal_number();
--   alter table public.company_clients
--     drop constraint if exists company_clients_client_code_format,
--     drop column if exists client_code,
--     drop column if exists proposal_seq;
--   (Numbers already printed on documents are data, not schema — leave them.)

/* -------------------------------------------------------------------------- */
/* 1. The moniker and the per-client sequence                                  */
/* -------------------------------------------------------------------------- */

alter table public.company_clients
  add column if not exists client_code  text,
  add column if not exists proposal_seq integer not null default 0;

alter table public.company_clients
  drop constraint if exists company_clients_client_code_format;
alter table public.company_clients
  add constraint company_clients_client_code_format
  check (client_code is null or client_code ~ '^[A-Z]{2,3}$');

-- Partial unique index rather than a UNIQUE constraint: many clients will sit
-- at NULL until someone writes their first proposal.
create unique index if not exists company_clients_client_code_key
  on public.company_clients (client_code)
  where client_code is not null;

comment on column public.company_clients.client_code is
  'Proposal moniker: 2-3 uppercase letters, assigned by whoever writes the client''s first proposal. Prefixes every proposal number (HUN-01).';
comment on column public.company_clients.proposal_seq is
  'Last per-client proposal sequence number allocated. Bumped atomically by the numbering trigger; never edited by hand.';

/* -------------------------------------------------------------------------- */
/* 2. Allocation — the numbering trigger                                       */
/* -------------------------------------------------------------------------- */

-- SECURITY DEFINER for one narrow reason: the seq bump writes company_clients,
-- and the person creating a proposal is not necessarily someone the client
-- table's UPDATE policy covers. The function takes no arguments, only fires
-- from the insert trigger, and is not executable over the API (revoked below).
create or replace function public.allocate_client_proposal_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_code text;
  v_seq  integer;
begin
  -- An explicit number (a migration, a backfill) is respected as-is.
  if new.proposal_number is not null then
    return new;
  end if;

  if new.client_id is not null then
    update public.company_clients
       set proposal_seq = proposal_seq + 1
     where id = new.client_id
       and client_code is not null
    returning client_code, proposal_seq into v_code, v_seq;

    if v_code is not null then
      -- greatest() guard: lpad TRUNCATES a longer string, so a bare lpad would
      -- turn sequence 100 into "10" and collide with an existing number.
      new.proposal_number := v_code || '-' || lpad(v_seq::text, greatest(2, length(v_seq::text)), '0');
      return new;
    end if;
  end if;

  -- No client, or a client nobody has given a code yet: the global scheme.
  new.proposal_number := public.next_client_proposal_number();
  return new;
end $$;

revoke execute on function public.allocate_client_proposal_number() from public, anon, authenticated;

comment on function public.allocate_client_proposal_number() is
  'BEFORE INSERT on client_proposals: CODE-NN for clients with a client_code, global RPS fallback otherwise.';

-- The trigger supersedes the column default from 20260809102000 — the default
-- ran for every insert and could not see the row''s client_id.
alter table public.client_proposals
  alter column proposal_number drop default;

drop trigger if exists allocate_client_proposal_number on public.client_proposals;
create trigger allocate_client_proposal_number
before insert on public.client_proposals
for each row execute function public.allocate_client_proposal_number();

/* -------------------------------------------------------------------------- */
/* 3. Renumbering a client's drafts onto the new scheme                        */
/* -------------------------------------------------------------------------- */

create or replace function public.renumber_client_draft_proposals(p_client uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_code     text;
  v_seq      integer;
  v_number   text;
  v_count    integer := 0;
  r          record;
begin
  select client_code into v_code
    from public.company_clients
   where id = p_client;

  if v_code is null then
    return 0;
  end if;

  for r in
    select p.id
      from public.client_proposals p
     where p.client_id = p_client
       and p.status = 'draft'
       and (p.proposal_number is null or p.proposal_number not like v_code || '-%')
     order by p.created_at nulls last, p.id
  loop
    update public.company_clients
       set proposal_seq = proposal_seq + 1
     where id = p_client
    returning proposal_seq into v_seq;

    -- The caller may lack UPDATE on company_clients (security invoker); a
    -- zero-row bump means no authority, so stop rather than mint duplicates.
    if v_seq is null then
      return v_count;
    end if;

    v_number := v_code || '-' || lpad(v_seq::text, greatest(2, length(v_seq::text)), '0');

    update public.client_proposals
       set proposal_number = v_number,
           form_data = case
             when form_data ? 'fields'
               then jsonb_set(form_data, '{fields,proposalNo}', to_jsonb(v_number), true)
             else form_data
           end
     where id = r.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

revoke execute on function public.renumber_client_draft_proposals(uuid) from public, anon;
grant execute on function public.renumber_client_draft_proposals(uuid) to authenticated;

comment on function public.renumber_client_draft_proposals(uuid) is
  'Moves a client''s draft proposals onto the CODE-NN scheme in creation order, mirroring the number into form_data. Runs with the caller''s rights.';

/* -------------------------------------------------------------------------- */
/* 4. The two codes decided in the 2026-08-07 meeting                          */
/* -------------------------------------------------------------------------- */

-- Matched by name rather than id (ids differ per environment); each guarded so
-- a re-run, a renamed client, or a hand-assigned code leaves nothing to do.
do $$
declare
  v_id uuid;
begin
  select id into v_id
    from public.company_clients
   where client_code is null and lower(name) like 'hunzinger%'
   order by created_at nulls last, id
   limit 1;
  if v_id is not null
     and not exists (select 1 from public.company_clients where client_code = 'HUN') then
    update public.company_clients set client_code = 'HUN' where id = v_id;
    perform public.renumber_client_draft_proposals(v_id);
  end if;

  select id into v_id
    from public.company_clients
   where client_code is null and lower(name) like 'staff electric%'
   order by created_at nulls last, id
   limit 1;
  if v_id is not null
     and not exists (select 1 from public.company_clients where client_code = 'SE') then
    update public.company_clients set client_code = 'SE' where id = v_id;
    perform public.renumber_client_draft_proposals(v_id);
  end if;
end $$;
