create schema if not exists private;

create or replace function private.create_chat_message_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  thread_record public.employee_chat_threads%rowtype;
  sender_label text;
  message_preview text;
begin
  select *
  into thread_record
  from public.employee_chat_threads
  where id = new.thread_id;

  if not found then
    return new;
  end if;

  select coalesce(nullif(profile.display_name, ''), profile.email, 'Someone')
  into sender_label
  from public.employee_chat_profiles profile
  where profile.user_id = new.sender_user_id;

  sender_label := coalesce(sender_label, 'Someone');
  message_preview := left(new.body, 180);

  if thread_record.thread_type = 'direct' then
    insert into public.portal_notifications (
      recipient_user_id,
      title,
      body,
      priority,
      source_type,
      source_id,
      action_href,
      dedupe_key,
      metadata
    )
    select
      recipient.recipient_user_id,
      'New message from ' || sender_label,
      message_preview,
      'medium',
      'employee_chat_message',
      new.id::text,
      '/employee',
      'chat-message-' || new.id::text || '-' || recipient.recipient_user_id::text,
      jsonb_build_object(
        'thread_id', new.thread_id,
        'thread_type', thread_record.thread_type,
        'sender_user_id', new.sender_user_id
      )
    from (
      values (
        case
          when thread_record.participant_one_user_id = new.sender_user_id then thread_record.participant_two_user_id
          else thread_record.participant_one_user_id
        end
      )
    ) as recipient(recipient_user_id)
    left join public.notification_preferences preference
      on preference.user_id = recipient.recipient_user_id
    where recipient.recipient_user_id is not null
      and recipient.recipient_user_id <> new.sender_user_id
      and coalesce(preference.in_app_enabled, true)
    on conflict do nothing;
  elsif thread_record.thread_type = 'company' then
    insert into public.portal_notifications (
      recipient_user_id,
      title,
      body,
      priority,
      source_type,
      source_id,
      action_href,
      dedupe_key,
      metadata
    )
    select
      profile.user_id,
      sender_label || ' messaged Company Room',
      message_preview,
      'low',
      'employee_chat_message',
      new.id::text,
      '/employee',
      'chat-message-' || new.id::text || '-' || profile.user_id::text,
      jsonb_build_object(
        'thread_id', new.thread_id,
        'thread_type', thread_record.thread_type,
        'sender_user_id', new.sender_user_id
      )
    from public.employee_chat_profiles profile
    left join public.notification_preferences preference
      on preference.user_id = profile.user_id
    where profile.account_status = 'active'
      and profile.user_id <> new.sender_user_id
      and coalesce(preference.in_app_enabled, true)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists create_chat_message_notifications on public.employee_chat_messages;
create trigger create_chat_message_notifications
after insert on public.employee_chat_messages
for each row execute function private.create_chat_message_notifications();

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'portal_notifications'
  ) then
    alter publication supabase_realtime add table public.portal_notifications;
  end if;
end $$;
