drop policy if exists "Employees can read sales video meetings" on public.sales_video_meetings;
drop policy if exists "Guests can read joined sales video meetings" on public.sales_video_meetings;
create policy "Participants can read sales video meetings"
on public.sales_video_meetings
for select
to authenticated
using (private.can_access_sales_video_meeting(id));

drop policy if exists "Employees can manage sales video meeting invites" on public.sales_video_meeting_invites;
drop policy if exists "Guests can read own sales video meeting invite" on public.sales_video_meeting_invites;
create policy "Participants can read sales video meeting invites"
on public.sales_video_meeting_invites
for select
to authenticated
using (
  public.is_company_portal_employee()
  or exists (
    select 1
    from public.sales_video_meeting_participants participant
    where participant.invite_id = sales_video_meeting_invites.id
      and participant.guest_user_id = (select auth.uid())
      and participant.participant_type = 'guest'
  )
);

create policy "Employees can create sales video meeting invites"
on public.sales_video_meeting_invites
for insert
to authenticated
with check (public.is_company_portal_employee());

create policy "Employees can update sales video meeting invites"
on public.sales_video_meeting_invites
for update
to authenticated
using (public.is_company_portal_employee())
with check (public.is_company_portal_employee());

create policy "Employees can delete sales video meeting invites"
on public.sales_video_meeting_invites
for delete
to authenticated
using (public.is_company_portal_employee());

drop policy if exists "Employees can manage sales video meeting participants" on public.sales_video_meeting_participants;
drop policy if exists "Participants can read sales video meeting participants" on public.sales_video_meeting_participants;
drop policy if exists "Guests can update own sales video meeting participant" on public.sales_video_meeting_participants;
create policy "Participants can read sales video meeting participants"
on public.sales_video_meeting_participants
for select
to authenticated
using (private.can_access_sales_video_meeting(meeting_id));

create policy "Employees can create sales video meeting participants"
on public.sales_video_meeting_participants
for insert
to authenticated
with check (public.is_company_portal_employee());

create policy "Participants can update sales video meeting participants"
on public.sales_video_meeting_participants
for update
to authenticated
using (
  public.is_company_portal_employee()
  or (
    participant_type = 'guest'
    and guest_user_id = (select auth.uid())
    and private.can_access_sales_video_meeting(meeting_id)
  )
)
with check (
  public.is_company_portal_employee()
  or (
    participant_type = 'guest'
    and guest_user_id = (select auth.uid())
    and private.can_access_sales_video_meeting(meeting_id)
  )
);

create policy "Employees can delete sales video meeting participants"
on public.sales_video_meeting_participants
for delete
to authenticated
using (public.is_company_portal_employee());
