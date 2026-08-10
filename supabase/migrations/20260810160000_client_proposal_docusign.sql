-- DocuSign tracking for client proposals.
--
-- This stores the envelope we sent for a proposal revision and, after
-- DocuSign Connect reports completion, links the completed signed PDF filed
-- into the File Center.

create table if not exists public.client_proposal_docusign_envelopes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.client_proposals(id) on delete cascade,
  revision_id uuid references public.client_proposal_revisions(id) on delete set null,
  envelope_id text not null unique,
  status text not null default 'sent'
    check (status in ('created', 'sent', 'delivered', 'completed', 'declined', 'voided', 'corrected', 'unknown')),
  recipient_name text not null,
  recipient_email text not null,
  email_subject text,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now(),
  completed_at timestamptz,
  declined_at timestamptz,
  voided_at timestamptz,
  completed_file_id uuid references public.company_files(id) on delete set null,
  last_event_at timestamptz,
  last_event_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_proposal_docusign_proposal
  on public.client_proposal_docusign_envelopes(proposal_id, sent_at desc);

create index if not exists idx_proposal_docusign_envelope
  on public.client_proposal_docusign_envelopes(envelope_id);

create index if not exists idx_proposal_docusign_status
  on public.client_proposal_docusign_envelopes(status)
  where status <> 'completed';

create trigger set_client_proposal_docusign_envelopes_updated_at
before update on public.client_proposal_docusign_envelopes
for each row execute function public.set_updated_at();

alter table public.client_proposal_docusign_envelopes enable row level security;

create policy "Active employees can read proposal DocuSign envelopes"
  on public.client_proposal_docusign_envelopes
  for select
  to authenticated
  using (public.is_company_portal_employee());

create policy "Active employees can create proposal DocuSign envelopes"
  on public.client_proposal_docusign_envelopes
  for insert
  to authenticated
  with check (public.is_company_portal_employee());

create policy "Active employees can update proposal DocuSign envelopes"
  on public.client_proposal_docusign_envelopes
  for update
  to authenticated
  using (public.is_company_portal_employee())
  with check (public.is_company_portal_employee());

create policy "Admins can delete proposal DocuSign envelopes"
  on public.client_proposal_docusign_envelopes
  for delete
  to authenticated
  using (public.is_company_portal_admin());

comment on table public.client_proposal_docusign_envelopes is
  'Tracks DocuSign envelopes sent for proposal revisions and the signed PDF filed after completion.';

comment on column public.client_proposal_docusign_envelopes.completed_file_id is
  'File Center company_files.id for the completed signed PDF downloaded from DocuSign.';
