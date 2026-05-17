import { Bot } from "lucide-react";
import { AICommandCenter } from "@/components/AICommandCenter";
import { getCommandSnapshot } from "@/lib/ai/command-context";
import type { PortalNotification, WorkflowActionProposal } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole } from "@/lib/user-management";

export default async function AICommandPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <>
        <div className="portal-topline">
          <div>
            <div className="eyebrow">AI Command Center</div>
            <h1>Workflow assistant</h1>
            <p>Supabase is required before AI notifications can be used.</p>
          </div>
          <span className="badge">
            <Bot size={14} />
            Setup required
          </span>
        </div>
      </>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const [{ data: role }, snapshot, { data: notifications }, { data: proposals }] = await Promise.all([
    supabase.from("user_roles").select("role, account_status").eq("user_id", user.id).maybeSingle(),
    getCommandSnapshot(supabase, user.id),
    supabase
      .from("portal_notifications")
      .select("*")
      .eq("recipient_user_id", user.id)
      .eq("status", "unread")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("workflow_action_proposals")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <AICommandCenter
      canManageProposals={role?.account_status === "active" && isPortalAdminRole(role.role)}
      notifications={(notifications ?? []) as unknown as PortalNotification[]}
      proposals={(proposals ?? []) as unknown as WorkflowActionProposal[]}
      snapshot={snapshot}
    />
  );
}
