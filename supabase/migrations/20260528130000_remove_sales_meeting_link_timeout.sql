create or replace function private.can_access_sales_video_meeting(meeting_id uuid)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select
    public.is_company_portal_employee()
    or exists (
      select 1
      from public.sales_video_meeting_participants participant
      join public.sales_video_meetings meeting
        on meeting.id = participant.meeting_id
      where participant.meeting_id = $1
        and participant.guest_user_id = (select auth.uid())
        and participant.participant_type = 'guest'
        and participant.status in ('invited', 'joined')
        and meeting.status in ('scheduled', 'active')
    );
$$;
