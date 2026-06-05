import { Mail } from "lucide-react";
import { EmployeeMailCenter } from "@/components/EmployeeMailCenter";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { isPortalAdminRole } from "@/lib/user-management";

type EmployeeMailbox = Database["public"]["Tables"]["employee_mailboxes"]["Row"];
type EmployeeMailMessage = Database["public"]["Tables"]["employee_mail_messages"]["Row"];
type EmployeeMailRecipient = Database["public"]["Tables"]["employee_mail_recipients"]["Row"];

type EmployeeMailPageProps = {
  searchParams: Promise<{ folder?: string; message?: string }>;
};

type MailAdminEmployee = {
  user_id: string;
  display_name: string | null;
  legal_name: string | null;
  email: string | null;
  mailbox: EmployeeMailbox | null;
};

type UserRoleRow = {
  user_id: string;
  role: string;
  account_status: string;
};

type EmployeeProfileRow = {
  user_id: string;
  display_name: string | null;
  legal_name: string | null;
  email: string | null;
};

function getDisplayName(metadata: Record<string, unknown> | null | undefined) {
  const displayName = metadata?.display_name;

  return typeof displayName === "string" && displayName.trim() ? displayName : null;
}

export default async function EmployeeMailPage({ searchParams }: EmployeeMailPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  const [{ data: role }, { data: mailbox }] =
    supabase && user
      ? await Promise.all([
          supabase
            .from("user_roles")
            .select("role, account_status")
            .eq("user_id", user.id)
            .eq("account_status", "active")
            .maybeSingle(),
          supabase
            .from("employee_mailboxes")
            .select("*")
            .eq("user_id", user.id)
            .eq("status", "active")
            .maybeSingle(),
        ])
      : [{ data: null }, { data: null }];

  const canManageMailboxes = Boolean(role?.account_status === "active" && isPortalAdminRole(role.role));
  const typedMailbox = (mailbox ?? null) as EmployeeMailbox | null;
  const { data: messages } =
    supabase && typedMailbox
      ? await supabase
          .from("employee_mail_messages")
          .select("*")
          .eq("mailbox_id", typedMailbox.id)
          .order("updated_at", { ascending: false })
          .limit(200)
      : { data: [] };
  const messageIds = (messages ?? []).map((message) => message.id);
  const { data: recipients } =
    supabase && messageIds.length > 0
      ? await supabase.from("employee_mail_recipients").select("*").in("message_id", messageIds)
      : { data: [] };

  const admin = canManageMailboxes ? createAdminClient() : null;
  const [{ data: authData }, { data: roleRows }, { data: employeeProfiles }, { data: mailboxDirectory }] = admin
    ? await Promise.all([
        admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
        admin.from("user_roles").select("user_id, role, account_status").eq("account_status", "active"),
        admin
          .from("employee_profiles")
          .select("user_id, display_name, legal_name, email")
          .order("display_name"),
        admin.from("employee_mailboxes").select("*").order("address"),
      ])
    : [{ data: null }, { data: [] }, { data: [] }, { data: [] }];

  const activeRolesByUserId = new Map((roleRows ?? []).map((role) => [role.user_id, role as UserRoleRow]));
  const profilesByUserId = new Map((employeeProfiles ?? []).map((profile) => [profile.user_id, profile as EmployeeProfileRow]));
  const mailboxesByUserId = new Map(((mailboxDirectory ?? []) as EmployeeMailbox[]).map((item) => [item.user_id, item]));
  const employees = (authData?.users ?? [])
    .filter((authUser) => activeRolesByUserId.has(authUser.id))
    .map((authUser) => {
      const profile = profilesByUserId.get(authUser.id);
      const metadataDisplayName = getDisplayName(authUser.user_metadata as Record<string, unknown> | null);

      return {
        user_id: authUser.id,
        display_name: profile?.display_name ?? metadataDisplayName,
        legal_name: profile?.legal_name ?? null,
        email: profile?.email ?? authUser.email ?? null,
        mailbox: mailboxesByUserId.get(authUser.id) ?? null,
      } satisfies MailAdminEmployee;
    })
    .sort((a, b) => (a.display_name || a.legal_name || a.email || a.user_id).localeCompare(b.display_name || b.legal_name || b.email || b.user_id));

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Employee Mail</div>
          <h1>Inbox, sent mail, and drafts</h1>
          <p>Send and receive company email through the Reliance employee portal.</p>
        </div>
        <span className="badge">
          <Mail size={14} />
          {typedMailbox?.address ?? "Mailbox setup"}
        </span>
      </div>

      <EmployeeMailCenter
        canManageMailboxes={canManageMailboxes}
        employees={employees}
        initialFolder={params.folder}
        initialMessageId={params.message}
        mailbox={typedMailbox}
        messages={(messages ?? []) as EmployeeMailMessage[]}
        recipients={(recipients ?? []) as EmployeeMailRecipient[]}
      />
    </>
  );
}
