import { EmployeePresenceChat } from "@/components/EmployeePresenceChat";
import { EmployeeSidebar } from "@/components/EmployeeSidebar";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type EmployeeChatProfile = Database["public"]["Tables"]["employee_chat_profiles"]["Row"];
type EmployeeChatThread = Database["public"]["Tables"]["employee_chat_threads"]["Row"];
type EmployeeChatMessage = Database["public"]["Tables"]["employee_chat_messages"]["Row"];

function getChatDisplayName(profile: EmployeeChatProfile | undefined, email: string | null | undefined) {
  return profile?.display_name || email || profile?.user_id.slice(0, 8) || "Employee";
}

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  let chatProps: React.ComponentProps<typeof EmployeePresenceChat> | null = null;
  let currentRole: { role: string; account_status: string } | null = null;
  let unreadNotificationCount = 0;
  let unreadChatNotificationCount = 0;

  if (supabase && user) {
    const { data: role } = await supabase
      .from("user_roles")
      .select("role, account_status")
      .eq("user_id", user.id)
      .eq("account_status", "active")
      .maybeSingle();
    currentRole = role;

    const [
      { data: profiles, error: profilesError },
      { data: companyThread, error: companyThreadError },
      { count: notificationCount, error: notificationCountError },
      { count: chatNotificationCount, error: chatNotificationCountError },
    ] = await Promise.all([
      supabase.from("employee_chat_profiles").select("*").order("display_name"),
      supabase.from("employee_chat_threads").select("*").eq("thread_type", "company").maybeSingle(),
      supabase
        .from("portal_notifications")
        .select("*", { count: "exact", head: true })
        .eq("recipient_user_id", user.id)
        .eq("status", "unread"),
      supabase
        .from("portal_notifications")
        .select("*", { count: "exact", head: true })
        .eq("recipient_user_id", user.id)
        .eq("status", "unread")
        .eq("source_type", "employee_chat_message"),
    ]);

    if (
      (profilesError && !isMissingSchemaRelationError(profilesError)) ||
      (companyThreadError && !isMissingSchemaRelationError(companyThreadError)) ||
      (notificationCountError && !isMissingSchemaRelationError(notificationCountError)) ||
      (chatNotificationCountError && !isMissingSchemaRelationError(chatNotificationCountError))
    ) {
      console.error(
        "Could not load employee shell data.",
        profilesError ?? companyThreadError ?? notificationCountError ?? chatNotificationCountError,
      );
    }

    unreadNotificationCount = notificationCount ?? 0;
    unreadChatNotificationCount = chatNotificationCount ?? 0;

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
        initialUnreadChatNotificationCount: unreadChatNotificationCount,
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
