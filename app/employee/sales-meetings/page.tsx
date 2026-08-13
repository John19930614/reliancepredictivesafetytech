import Link from "next/link";
import { Video } from "lucide-react";
import { splitMeetingsByTime, type ClientMeetingRow } from "@/lib/clients/related";
import { createClient } from "@/lib/supabase/server";

/**
 * The sales meetings index.
 *
 * The client record has always linked "All sales meetings" here, but only the
 * /[meetingId] room route existed, so the link 404d. This is that missing page.
 *
 * Covered by the existing `sales_pipeline` module key, which already maps
 * /employee/sales-meetings by path prefix — no new grant, and reads are gated by
 * the "Employees can read sales video meetings" RLS policy rather than by a
 * service-role client.
 */

/** Bounds the list; the room itself is always reachable by direct link. */
const meetingLimit = 200;

interface MeetingRow extends ClientMeetingRow {
  client_id: string | null;
  client: { name: string } | null;
}

function formatWhen(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MeetingTable({ rows, emptyCopy }: { rows: MeetingRow[]; emptyCopy: string }) {
  if (rows.length === 0) {
    return <div className="empty-state">{emptyCopy}</div>;
  }

  return (
    <div className="data-table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Meeting</th>
            <th>Company</th>
            <th>When</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((meeting) => (
            <tr key={meeting.id}>
              <td>
                <Link href={`/employee/sales-meetings/${meeting.id}`}>{meeting.title ?? "Untitled meeting"}</Link>
              </td>
              <td>
                {meeting.client_id ? (
                  <Link href={`/employee/clients/${meeting.client_id}`}>{meeting.client?.name ?? "Open record"}</Link>
                ) : (
                  "—"
                )}
              </td>
              <td>{formatWhen(meeting.scheduled_at)}</td>
              <td>{meeting.status ?? "—"}</td>
              <td>
                <Link
                  className="button button-light"
                  href={`/employee/sales-meetings/${meeting.id}`}
                  aria-label={`Open ${meeting.title ?? "meeting"}`}
                >
                  <Video size={14} /> Open room
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function SalesMeetingsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const params = await searchParams;
  const clientId = (params.client ?? "").trim();
  const supabase = await createClient();

  let rows: MeetingRow[] = [];
  let clientName: string | null = null;

  if (supabase) {
    let query = supabase
      .from("sales_video_meetings")
      .select("id, title, status, scheduled_at, client_id, client:company_clients(name)")
      .order("scheduled_at", { ascending: false, nullsFirst: false })
      .limit(meetingLimit);

    if (clientId) query = query.eq("client_id", clientId);

    const { data } = await query;
    rows = (data ?? []) as unknown as MeetingRow[];

    if (clientId) {
      clientName = rows.find((row) => row.client?.name)?.client?.name ?? null;
      // The filter must still name the company when it has no meetings yet,
      // otherwise an empty result reads as "no such company".
      if (!clientName) {
        const { data: client } = await supabase
          .from("company_clients")
          .select("name")
          .eq("id", clientId)
          .maybeSingle();
        clientName = (client as { name: string } | null)?.name ?? null;
      }
    }
  }

  // One clock for both halves of the split, so a meeting cannot land in neither.
  const { upcoming, past } = splitMeetingsByTime(rows, new Date());

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Sales Pipeline</div>
          <h1>Sales meetings</h1>
          <p>
            {clientId
              ? `Demos and calls for ${clientName ?? "this company"}.`
              : "Every demo and sales call, upcoming and past."}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {clientId ? (
            <>
              <Link className="button button-light" href={`/employee/clients/${clientId}`}>
                Back to the company
              </Link>
              <Link className="button button-light" href="/employee/sales-meetings">
                Show all meetings
              </Link>
            </>
          ) : null}
          <span className="badge">{rows.length} shown</span>
        </div>
      </div>

      <section>
        <h2 style={{ marginBottom: 12 }}>Upcoming</h2>
        <MeetingTable
          rows={upcoming}
          emptyCopy={
            clientId
              ? "Nothing scheduled for this company. Book a demo from the Sales Pipeline."
              : "Nothing scheduled. Book a demo from the Sales Pipeline or a company record."
          }
        />
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ marginBottom: 12 }}>Past</h2>
        <MeetingTable rows={past} emptyCopy="No past meetings yet." />
      </section>
    </>
  );
}
