import Image from "next/image";
import { logout } from "@/app/employee-login/actions";
import { EmployeePresenceChat } from "@/components/EmployeePresenceChat";
import { EmployeeSidebar } from "@/components/EmployeeSidebar";
import { COMPANY_NAME, TAGLINE } from "@/lib/company-data";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { isPortalAdminRole } from "@/lib/user-management";

type EmployeeChatProfile = Database["public"]["Tables"]["employee_chat_profiles"]["Row"];
type EmployeeChatThread = Database["public"]["Tables"]["employee_chat_threads"]["Row"];
type EmployeeChatMessage = Database["public"]["Tables"]["employee_chat_messages"]["Row"];

function getChatDisplayName(profile: EmployeeChatProfile | undefined, email: string | null | undefined) {
  return profile?.display_name || email || profile?.user_id.slice(0, 8) || "Employee";
}

async function hasPendingRequiredOnboarding(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  if (!supabase) {
    return false;
  }

  const { data: pendingAssignments } = await supabase
    .from("employee_document_assignments")
    .select("template_id")
    .eq("user_id", userId)
    .eq("status", "pending");
  const pendingTemplateIds = [...new Set((pendingAssignments ?? []).map((assignment) => assignment.template_id))];

  if (pendingTemplateIds.length === 0) {
    return false;
  }

  const { count } = await supabase
    .from("hr_document_templates")
    .select("id", { count: "exact", head: true })
    .in("id", pendingTemplateIds)
    .eq("required", true);

  return (count ?? 0) > 0;
}

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  let chatProps: React.ComponentProps<typeof EmployeePresenceChat> | null = null;
  let onboardingLocked = false;
  let currentRole: { role: string; account_status: string } | null = null;
  let unreadNotificationCount = 0;

  if (supabase && user) {
    const { data: role } = await supabase
      .from("user_roles")
      .select("role, account_status")
      .eq("user_id", user.id)
      .eq("account_status", "active")
      .maybeSingle();
    currentRole = role;
    const isAdminRole = isPortalAdminRole(role?.role);

    onboardingLocked = !isAdminRole && (await hasPendingRequiredOnboarding(supabase, user.id));

    if (onboardingLocked) {
      return (
        <div className="portal-onboarding-shell">
          <header className="portal-onboarding-header">
            <div className="portal-onboarding-brand">
              <Image className="portal-logo" alt={`${COMPANY_NAME} logo`} height={120} src="/reliance-logo-transparent.png" width={406} />
              <div>
                <strong>{COMPANY_NAME}</strong>
                <p>{TAGLINE}</p>
              </div>
            </div>
            <form action={logout}>
              <button className="button button-secondary" type="submit">
                Sign Out
              </button>
            </form>
          </header>
          <main className="portal-onboarding-main">{children}</main>
        </div>
      );
    }

    const [
      { data: profiles, error: profilesError },
      { data: companyThread, error: companyThreadError },
      { count: notificationCount, error: notificationCountError },
    ] = await Promise.all([
      supabase.from("employee_chat_profiles").select("*").order("display_name"),
      supabase.from("employee_chat_threads").select("*").eq("thread_type", "company").maybeSingle(),
      supabase
        .from("portal_notifications")
        .select("*", { count: "exact", head: true })
        .eq("recipient_user_id", user.id)
        .eq("status", "unread"),
    ]);

    if (
      (profilesError && !isMissingSchemaRelationError(profilesError)) ||
      (companyThreadError && !isMissingSchemaRelationError(companyThreadError)) ||
      (notificationCountError && !isMissingSchemaRelationError(notificationCountError))
    ) {
      console.error("Could not load employee shell data.", profilesError ?? companyThreadError ?? notificationCountError);
    }

    unreadNotificationCount = notificationCount ?? 0;

    const typedCompanyThread = (companyThread ?? null) as EmployeeChatThread | null;
    const { data: companyMessages, error: companyMessagesError } = typedCompanyThread
      ? await supabase
          .from("employee_chat_messages")
          .select("*")
          .eq("thread_id", typedCompanyThread.id)
          .order("created_at", { ascending: false })
          .limit(80)
      : { data: [], error: null };

    if (companyMessagesError && !isMissingSchemaRelationError(companyMessagesError)) {
      console.error("Could not load employee chat messages.", companyMessagesError);
    }

    const typedProfiles = (profiles ?? []) as EmployeeChatProfile[];
    const currentProfile = typedProfiles.find((profile) => profile.user_id === user.id);

    if (typedCompanyThread && !profilesError && !companyMessagesError) {
      chatProps = {
        currentUser: {
          id: user.id,
          displayName: getChatDisplayName(currentProfile, user.email),
          email: user.email ?? currentProfile?.email ?? null,
        },
        companyThread: typedCompanyThread,
        initialProfiles: typedProfiles,
        initialCompanyMessages: ([...(companyMessages ?? [])].reverse()) as EmployeeChatMessage[],
      };
    }
  }

  return (
    <div className="portal-shell">
      <EmployeeSidebar
        accountStatus={currentRole?.account_status}
        currentRole={currentRole?.role}
        unreadNotificationCount={unreadNotificationCount}
      />
      <main className="portal-main">{children}</main>
      {chatProps ? <EmployeePresenceChat {...chatProps} /> : null}
    </div>
  );
}
