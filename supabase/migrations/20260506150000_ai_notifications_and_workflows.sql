create table if not exists public.portal_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  priority text not null default 'medium',
  source_type text,
  source_id text,
  action_href text,
  ai_summary text,
  dedupe_key text,
  status text not null default 'unread',
  created_by_ai boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamp with time zone,
  archived_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint portal_notifications_priority_check check (priority in ('low', 'medium', 'high', 'critical')),
  constraint portal_notifications_status_check check (status in ('unread', 'read', 'archived'))
);

create unique index if not exists portal_notifications_recipient_dedupe_idx
on public.portal_notifications(recipient_user_id, dedupe_key)
where dedupe_key is not null and status <> 'archived';

create index if not exists portal_notifications_recipient_status_idx
on public.portal_notifications(recipient_user_id, status, created_at desc);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_digest_enabled boolean not null default true,
  digest_time text not null default '08:00',
  digest_timezone text not null default 'America/Chicago',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.workflow_action_proposals (
  id uuid primary key default gen_random_uuid(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text not null,
  action_type text not null,
  target_table text not null,
  target_record_id text,
  proposed_patch jsonb not null default '{}'::jsonb,
  risk_level text not null default 'medium',
  status text not null default 'pending',
  approval_notes text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamp with time zone,
  applied_at timestamp with time zone,
  created_by_ai boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint workflow_action_proposals_risk_check check (risk_level in ('low', 'medium', 'high', 'critical')),
  constraint workflow_action_proposals_status_check check (status in ('pending', 'approved', 'rejected', 'applied'))
);

create index if not exists workflow_action_proposals_status_created_idx
on public.workflow_action_proposals(status, created_at desc);

create table if not exists public.ai_digest_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  digest_date date not null,
  status text not null default 'pending',
  notification_count integer not null default 0,
  email_to text,
  resend_email_id text,
  error_message text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (user_id, digest_date),
  constraint ai_digest_runs_status_check check (status in ('pending', 'sent', 'skipped', 'failed'))
);

drop trigger if exists set_portal_notifications_updated_at on public.portal_notifications;
create trigger set_portal_notifications_updated_at
before update on public.portal_notifications
for each row execute function public.set_updated_at();

drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

drop trigger if exists set_workflow_action_proposals_updated_at on public.workflow_action_proposals;
create trigger set_workflow_action_proposals_updated_at
before update on public.workflow_action_proposals
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_digest_runs_updated_at on public.ai_digest_runs;
create trigger set_ai_digest_runs_updated_at
before update on public.ai_digest_runs
for each row execute function public.set_updated_at();

alter table public.portal_notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.workflow_action_proposals enable row level security;
alter table public.ai_digest_runs enable row level security;

drop policy if exists "Employees can read own notifications" on public.portal_notifications;
create policy "Employees can read own notifications"
on public.portal_notifications
for select
to authenticated
using (recipient_user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Employees can create own notifications" on public.portal_notifications;
create policy "Employees can create own notifications"
on public.portal_notifications
for insert
to authenticated
with check (
  public.is_company_portal_employee()
  and recipient_user_id = (select auth.uid())
);

drop policy if exists "Employees can update own notifications" on public.portal_notifications;
create policy "Employees can update own notifications"
on public.portal_notifications
for update
to authenticated
using (recipient_user_id = (select auth.uid()) or public.is_company_portal_admin())
with check (recipient_user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Admins can manage notifications" on public.portal_notifications;
create policy "Admins can manage notifications"
on public.portal_notifications
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can read own notification preferences" on public.notification_preferences;
create policy "Employees can read own notification preferences"
on public.notification_preferences
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Employees can manage own notification preferences" on public.notification_preferences;
create policy "Employees can manage own notification preferences"
on public.notification_preferences
for all
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_admin())
with check (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Employees can read workflow proposals" on public.workflow_action_proposals;
create policy "Employees can read workflow proposals"
on public.workflow_action_proposals
for select
to authenticated
using (
  public.is_company_portal_admin()
  or target_user_id = (select auth.uid())
  or created_by_user_id = (select auth.uid())
);

drop policy if exists "Employees can create workflow proposals" on public.workflow_action_proposals;
create policy "Employees can create workflow proposals"
on public.workflow_action_proposals
for insert
to authenticated
with check (
  public.is_company_portal_employee()
  and coalesce(created_by_user_id, (select auth.uid())) = (select auth.uid())
);

drop policy if exists "Admins can manage workflow proposals" on public.workflow_action_proposals;
create policy "Admins can manage workflow proposals"
on public.workflow_action_proposals
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Employees can read own digest runs" on public.ai_digest_runs;
create policy "Employees can read own digest runs"
on public.ai_digest_runs
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_company_portal_admin());

drop policy if exists "Admins can manage digest runs" on public.ai_digest_runs;
create policy "Admins can manage digest runs"
on public.ai_digest_runs
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());
