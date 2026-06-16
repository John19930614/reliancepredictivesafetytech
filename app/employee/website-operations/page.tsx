import { redirect } from "next/navigation";
import { Globe2 } from "lucide-react";
import { WebsiteOperationsCenter } from "@/components/WebsiteOperationsCenter";
import type { WorkflowActionProposal } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole } from "@/lib/user-management";
import { getWebsiteOperationsSnapshot } from "@/lib/website-operations";

export default async function WebsiteOperationsPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Website Operations AI</div>
          <h1>Website manager cockpit</h1>
          <p>Supabase is required before website automation can be used.</p>
        </div>
        <span className="badge">
          <Globe2 size={14} />
          Setup required
        </span>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/employee-login");
  }

  const { data: role } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .eq("account_status", "active")
    .maybeSingle();

  if (!isPortalAdminRole(role?.role)) {
    return (
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Website Operations AI</div>
          <h1>Admin access required</h1>
          <p>Website scans, public content proposals, and deployment recommendations are limited to portal admins.</p>
        </div>
      </div>
    );
  }

  const [snapshot, { data: proposals }] = await Promise.all([
    getWebsiteOperationsSnapshot(supabase),
    supabase
      .from("workflow_action_proposals")
      .select("*")
      .eq("status", "pending")
      .in("target_table", ["website_content_items", "website_operations_events"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return <WebsiteOperationsCenter proposals={(proposals ?? []) as unknown as WorkflowActionProposal[]} snapshot={snapshot} />;
}
