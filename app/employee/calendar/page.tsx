import { CalendarManager } from "@/components/CalendarManager";
import type { CalendarEvent, CalendarEventAttendee, EmployeeProfile } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole } from "@/lib/user-management";

export default async function CalendarPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <div className="portal-topline">
        <div>
          <h1>Calendar</h1>
          <p>Calendar data is unavailable right now. Refresh the page, or contact an administrator.</p>
        </div>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  const isAdmin = isPortalAdminRole(roleRow?.role);

  const [{ data: events }, { data: attendees }, { data: profiles }] = await Promise.all([
    supabase
      .from("employee_calendar_events")
      .select("*")
      .order("start_at", { ascending: true }),
    supabase
      .from("employee_calendar_event_attendees")
      .select("*"),
    supabase
      .from("employee_profiles")
      .select("user_id, display_name, email, profile_status")
      .eq("profile_status", "active"),
  ]);

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">People</div>
          <h1>Team Calendar</h1>
          <p>Schedule meetings, request time off, and keep the team in sync.</p>
        </div>
      </div>

      <CalendarManager
        currentUserId={user?.id ?? ""}
        isAdmin={isAdmin}
        events={(events ?? []) as CalendarEvent[]}
        attendees={(attendees ?? []) as CalendarEventAttendee[]}
        profiles={(profiles ?? []) as EmployeeProfile[]}
      />
    </>
  );
}
