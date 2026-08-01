import { Inbox } from "lucide-react";
import { LeadTriagePanel } from "@/components/LeadTriagePanel";
import { RequestInbox } from "@/components/RequestInbox";
import type { DemoRequest, SupportTicket } from "@/lib/company-data";
import { loadLatestLeadTriage } from "@/lib/leads/latest-triage";
import { createClient } from "@/lib/supabase/server";

export default async function RequestInboxPage() {
  const supabase = await createClient();
  const [{ data: requests }, { data: supportTickets }] = supabase
    ? await Promise.all([
        supabase.from("demo_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("support_tickets").select("*").order("created_at", { ascending: false }),
      ])
    : [{ data: null }, { data: null }];

  const triage = await loadLatestLeadTriage(supabase);

  const totalCount = (requests ?? []).length + (supportTickets ?? []).length;

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Request Inbox</div>
          <h1>Requests and tech support</h1>
          <p>Review website leads, support tickets, requested products, and follow-up status.</p>
        </div>
        <span className="badge">
          <Inbox size={14} />
          {totalCount} item{totalCount === 1 ? "" : "s"}
        </span>
      </div>
      <LeadTriagePanel runDate={triage.runDate} suggestions={triage.suggestions} />
      <RequestInbox initialRequests={(requests ?? []) as DemoRequest[]} initialSupportTickets={(supportTickets ?? []) as SupportTicket[]} />
    </>
  );
}
