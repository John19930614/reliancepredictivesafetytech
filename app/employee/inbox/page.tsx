import { Inbox } from "lucide-react";
import { RequestInbox } from "@/components/RequestInbox";
import type { DemoRequest } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

export default async function RequestInboxPage() {
  const supabase = await createClient();
  const { data } = supabase
    ? await supabase.from("demo_requests").select("*").order("created_at", { ascending: false })
    : { data: null };

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Request Inbox</div>
          <h1>Information and demo requests</h1>
          <p>Review new website leads, see requested products, and track follow-up status.</p>
        </div>
        <span className="badge">
          <Inbox size={14} />
          {(data ?? []).length} request{(data ?? []).length === 1 ? "" : "s"}
        </span>
      </div>
      <RequestInbox initialRequests={(data ?? []) as DemoRequest[]} />
    </>
  );
}
