create table if not exists public.employee_mailboxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  address text not null unique,
  display_name text,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint employee_mailboxes_address_lower_check check (address = lower(address)),
  constraint employee_mailboxes_domain_check check (address like '%@mail.reliancepredictivesafety.com'),
  constraint employee_mailboxes_status_check check (status in ('active', 'suspended', 'archived'))
);

create table if not exists public.employee_mail_messages (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.employee_mailboxes(id) on delete cascade,
  provider_message_id text,
  internet_message_id text,
  thread_key text not null,
  subject text not null default '',
  plain_body text not null default '',
  html_body text,
  from_address text not null,
  from_name text,
  direction text not null,
  status text not null,
  folder text not null,
  read_at timestamp with time zone,
  archived_at timestamp with time zone,
  deleted_at timestamp with time zone,
  sent_at timestamp with time zone,
  received_at timestamp with time zone,
  last_provider_event_at timestamp with time zone,
  error_message text,
  attachment_metadata jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint employee_mail_messages_direction_check check (direction in ('inbound', 'outbound', 'draft')),
  constraint employee_mail_messages_status_check check (
    status in ('draft', 'queued', 'sent', 'delivered', 'failed', 'received')
  ),
  constraint employee_mail_messages_folder_check check (folder in ('inbox', 'sent', 'drafts', 'archive', 'trash'))
);

create table if not exists public.employee_mail_recipients (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.employee_mail_messages(id) on delete cascade,
  mailbox_id uuid references public.employee_mailboxes(id) on delete set null,
  recipient_type text not null,
  address text not null,
  name text,
  delivery_status text not null default 'pending',
  provider_message_id text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint employee_mail_recipients_type_check check (recipient_type in ('to', 'cc', 'bcc')),
  constraint employee_mail_recipients_delivery_status_check check (
    delivery_status in ('pending', 'internal', 'sent', 'delivered', 'failed', 'received')
  )
);

create table if not exists public.employee_mail_delivery_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.employee_mail_messages(id) on delete cascade,
  recipient_id uuid references public.employee_mail_recipients(id) on delete set null,
  mailbox_id uuid references public.employee_mailboxes(id) on delete cascade,
  provider text not null default 'resend',
  event_type text not null,
  provider_event_id text,
  provider_message_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

create unique index if not exists employee_mail_delivery_events_provider_event_idx
on public.employee_mail_delivery_events(provider, provider_event_id)
where provider_event_id is not null;

create index if not exists employee_mailboxes_user_status_idx
on public.employee_mailboxes(user_id, status);

create index if not exists employee_mail_messages_mailbox_folder_idx
on public.employee_mail_messages(mailbox_id, folder, created_at desc);

create index if not exists employee_mail_messages_mailbox_unread_idx
on public.employee_mail_messages(mailbox_id, folder, read_at)
where read_at is null and folder = 'inbox';

create index if not exists employee_mail_messages_provider_message_idx
on public.employee_mail_messages(provider_message_id)
where provider_message_id is not null;

create index if not exists employee_mail_messages_thread_idx
on public.employee_mail_messages(mailbox_id, thread_key, created_at desc);

create index if not exists employee_mail_recipients_message_idx
on public.employee_mail_recipients(message_id);

create index if not exists employee_mail_recipients_address_idx
on public.employee_mail_recipients(lower(address));

create index if not exists employee_mail_delivery_events_message_idx
on public.employee_mail_delivery_events(message_id, created_at desc);

drop trigger if exists set_employee_mailboxes_updated_at on public.employee_mailboxes;
create trigger set_employee_mailboxes_updated_at
before update on public.employee_mailboxes
for each row execute function public.set_updated_at();

drop trigger if exists set_employee_mail_messages_updated_at on public.employee_mail_messages;
create trigger set_employee_mail_messages_updated_at
before update on public.employee_mail_messages
for each row execute function public.set_updated_at();

drop trigger if exists set_employee_mail_recipients_updated_at on public.employee_mail_recipients;
create trigger set_employee_mail_recipients_updated_at
before update on public.employee_mail_recipients
for each row execute function public.set_updated_at();

alter table public.employee_mailboxes enable row level security;
alter table public.employee_mail_messages enable row level security;
alter table public.employee_mail_recipients enable row level security;
alter table public.employee_mail_delivery_events enable row level security;

grant select, insert, update, delete on public.employee_mailboxes to authenticated;
grant select, insert, update, delete on public.employee_mail_messages to authenticated;
grant select, insert, update, delete on public.employee_mail_recipients to authenticated;
grant select, insert, update, delete on public.employee_mail_delivery_events to authenticated;

drop policy if exists "Employees can read own mailbox" on public.employee_mailboxes;
create policy "Employees can read own mailbox"
on public.employee_mailboxes
for select
to authenticated
using (
  (user_id = (select auth.uid()) and public.is_company_portal_employee())
  or public.is_company_portal_admin()
);

drop policy if exists "Admins can create mailboxes" on public.employee_mailboxes;
create policy "Admins can create mailboxes"
on public.employee_mailboxes
for insert
to authenticated
with check (public.is_company_portal_admin());

drop policy if exists "Admins can update mailboxes" on public.employee_mailboxes;
create policy "Admins can update mailboxes"
on public.employee_mailboxes
for update
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

drop policy if exists "Admins can delete mailboxes" on public.employee_mailboxes;
create policy "Admins can delete mailboxes"
on public.employee_mailboxes
for delete
to authenticated
using (public.is_company_portal_admin());

drop policy if exists "Employees can read own mail messages" on public.employee_mail_messages;
create policy "Employees can read own mail messages"
on public.employee_mail_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.employee_mailboxes mailbox
    where mailbox.id = employee_mail_messages.mailbox_id
      and (
        (mailbox.user_id = (select auth.uid()) and mailbox.status = 'active' and public.is_company_portal_employee())
        or public.is_company_portal_admin()
      )
  )
);

drop policy if exists "Employees can create own mail messages" on public.employee_mail_messages;
create policy "Employees can create own mail messages"
on public.employee_mail_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.employee_mailboxes mailbox
    where mailbox.id = employee_mail_messages.mailbox_id
      and mailbox.user_id = (select auth.uid())
      and mailbox.status = 'active'
      and public.is_company_portal_employee()
  )
);

drop policy if exists "Employees can update own mail messages" on public.employee_mail_messages;
create policy "Employees can update own mail messages"
on public.employee_mail_messages
for update
to authenticated
using (
  exists (
    select 1
    from public.employee_mailboxes mailbox
    where mailbox.id = employee_mail_messages.mailbox_id
      and (
        (mailbox.user_id = (select auth.uid()) and mailbox.status = 'active' and public.is_company_portal_employee())
        or public.is_company_portal_admin()
      )
  )
)
with check (
  exists (
    select 1
    from public.employee_mailboxes mailbox
    where mailbox.id = employee_mail_messages.mailbox_id
      and (
        (mailbox.user_id = (select auth.uid()) and mailbox.status = 'active' and public.is_company_portal_employee())
        or public.is_company_portal_admin()
      )
  )
);

drop policy if exists "Employees can delete own draft mail messages" on public.employee_mail_messages;
create policy "Employees can delete own draft mail messages"
on public.employee_mail_messages
for delete
to authenticated
using (
  status = 'draft'
  and exists (
    select 1
    from public.employee_mailboxes mailbox
    where mailbox.id = employee_mail_messages.mailbox_id
      and mailbox.user_id = (select auth.uid())
      and mailbox.status = 'active'
      and public.is_company_portal_employee()
  )
);

drop policy if exists "Employees can read own mail recipients" on public.employee_mail_recipients;
create policy "Employees can read own mail recipients"
on public.employee_mail_recipients
for select
to authenticated
using (
  exists (
    select 1
    from public.employee_mail_messages message
    join public.employee_mailboxes mailbox
      on mailbox.id = message.mailbox_id
    where message.id = employee_mail_recipients.message_id
      and (
        (mailbox.user_id = (select auth.uid()) and mailbox.status = 'active' and public.is_company_portal_employee())
        or public.is_company_portal_admin()
      )
  )
);

drop policy if exists "Employees can create own mail recipients" on public.employee_mail_recipients;
create policy "Employees can create own mail recipients"
on public.employee_mail_recipients
for insert
to authenticated
with check (
  exists (
    select 1
    from public.employee_mail_messages message
    join public.employee_mailboxes mailbox
      on mailbox.id = message.mailbox_id
    where message.id = employee_mail_recipients.message_id
      and mailbox.user_id = (select auth.uid())
      and mailbox.status = 'active'
      and public.is_company_portal_employee()
  )
);

drop policy if exists "Employees can update own mail recipients" on public.employee_mail_recipients;
create policy "Employees can update own mail recipients"
on public.employee_mail_recipients
for update
to authenticated
using (
  exists (
    select 1
    from public.employee_mail_messages message
    join public.employee_mailboxes mailbox
      on mailbox.id = message.mailbox_id
    where message.id = employee_mail_recipients.message_id
      and (
        (mailbox.user_id = (select auth.uid()) and mailbox.status = 'active' and public.is_company_portal_employee())
        or public.is_company_portal_admin()
      )
  )
)
with check (
  exists (
    select 1
    from public.employee_mail_messages message
    join public.employee_mailboxes mailbox
      on mailbox.id = message.mailbox_id
    where message.id = employee_mail_recipients.message_id
      and (
        (mailbox.user_id = (select auth.uid()) and mailbox.status = 'active' and public.is_company_portal_employee())
        or public.is_company_portal_admin()
      )
  )
);

drop policy if exists "Employees can delete own mail recipients" on public.employee_mail_recipients;
create policy "Employees can delete own mail recipients"
on public.employee_mail_recipients
for delete
to authenticated
using (
  exists (
    select 1
    from public.employee_mail_messages message
    join public.employee_mailboxes mailbox
      on mailbox.id = message.mailbox_id
    where message.id = employee_mail_recipients.message_id
      and message.status = 'draft'
      and mailbox.user_id = (select auth.uid())
      and mailbox.status = 'active'
      and public.is_company_portal_employee()
  )
);

drop policy if exists "Employees can read own mail delivery events" on public.employee_mail_delivery_events;
create policy "Employees can read own mail delivery events"
on public.employee_mail_delivery_events
for select
to authenticated
using (
  public.is_company_portal_admin()
  or exists (
    select 1
    from public.employee_mailboxes mailbox
    where mailbox.id = employee_mail_delivery_events.mailbox_id
      and mailbox.user_id = (select auth.uid())
      and mailbox.status = 'active'
      and public.is_company_portal_employee()
  )
  or exists (
    select 1
    from public.employee_mail_messages message
    join public.employee_mailboxes mailbox
      on mailbox.id = message.mailbox_id
    where message.id = employee_mail_delivery_events.message_id
      and mailbox.user_id = (select auth.uid())
      and mailbox.status = 'active'
      and public.is_company_portal_employee()
  )
);

drop policy if exists "Admins can manage mail delivery events" on public.employee_mail_delivery_events;
create policy "Admins can manage mail delivery events"
on public.employee_mail_delivery_events
for all
to authenticated
using (public.is_company_portal_admin())
with check (public.is_company_portal_admin());

alter table public.portal_user_module_access
  drop constraint if exists portal_user_module_access_module_key_check;

alter table public.portal_user_module_access
  add constraint portal_user_module_access_module_key_check
  check (
    module_key in (
      'dashboard',
      'ai_command',
      'website_operations',
      'work_management',
      'parking_lots',
      'employee_expenses',
      'finance',
      'payroll_tracker',
      'operations_database',
      'startup_checklist',
      'demo_showcase',
      'request_inbox',
      'sales_pipeline',
      'active_companies',
      'employee_mail',
      'company_tree',
      'hr_onboarding',
      'training',
      'hr_documents',
      'time_cards',
      'master_document_library',
      'legal_issues',
      'required_documents',
      'launch_gate',
      'users',
      'settings'
    )
  );

insert into public.portal_user_module_access (user_id, module_key, granted_by)
select role_row.user_id, 'employee_mail', null
from public.user_roles role_row
where role_row.account_status = 'active'
on conflict (user_id, module_key) do nothing;
