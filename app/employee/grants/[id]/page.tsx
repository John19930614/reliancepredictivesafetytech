import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { GrantDeleteButton } from "@/components/grants/GrantDeleteButton";
import { GrantEditForm } from "@/components/grants/GrantEditForm";
import { GrantFeePaidToggle } from "@/components/grants/GrantFeePaidToggle";
import { GrantStatusBadge } from "@/components/grants/GrantStatusBadge";
import { GrantStatusEditor } from "@/components/grants/GrantStatusEditor";
import { getGrantTrackerAccess } from "@/lib/grants/access";
import { isGrantTerminalStatus } from "@/lib/grants/statuses";
import { isUuid } from "@/lib/grants/validation";

interface GrantDetailRow {
  id: string;
  name: string;
  agency: string | null;
  sub_agency: string | null;
  contact: string | null;
  status: string;
  requirements: string | null;
  fee_amount: number | string | null;
  fee_kind: string | null;
  fee_paid: boolean;
  award_amount: number | string | null;
  website_url: string | null;
  website_label: string | null;
  opens_on: string | null;
  deadline: string | null;
  next_action: string | null;
  next_action_due: string | null;
  notes: string | null;
  outcome_reason: string | null;
}

const money2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default async function GrantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, canRead, canManage, canEditClosed, canDelete } = await getGrantTrackerAccess();

  if (!supabase) {
    return <section className="portal-card empty-state">Supabase is not configured yet.</section>;
  }
  if (!canRead) {
    return <section className="portal-card empty-state">Grant Tracker is not visible for this account.</section>;
  }
  if (!isUuid(id)) {
    notFound();
  }

  const { data } = await supabase
    .from("company_grant_opportunities")
    .select(
      "id, name, agency, sub_agency, contact, status, requirements, fee_amount, fee_kind, fee_paid, award_amount, website_url, website_label, opens_on, deadline, next_action, next_action_due, notes, outcome_reason",
    )
    .eq("id", id)
    .maybeSingle();

  const grant = data as GrantDetailRow | null;
  if (!grant) {
    notFound();
  }

  const closed = isGrantTerminalStatus(grant.status);
  const readOnly = closed && !canEditClosed;
  const fee = grant.fee_amount === null ? null : Number(grant.fee_amount);

  return (
    <>
      <div className="portal-topline">
        <div>
          <Link href="/employee/grants" className="button button-light button-sm" style={{ marginBottom: 12 }}>
            <ChevronLeft size={14} /> All pursuits
          </Link>
          <span className="eyebrow">Grant Tracker</span>
          <h1>{grant.name}</h1>
          {grant.sub_agency ? <p>{[grant.agency, grant.sub_agency].filter(Boolean).join(" — ")}</p> : grant.agency ? <p>{grant.agency}</p> : null}
        </div>
        {canManage && (!closed || canEditClosed) ? (
          <GrantStatusEditor grantId={grant.id} status={grant.status} />
        ) : (
          <GrantStatusBadge status={grant.status} />
        )}
      </div>

      {grant.outcome_reason ? (
        <section className="portal-card" style={{ padding: 16, marginBottom: 16 }}>
          <strong>Outcome</strong>
          <p style={{ color: "var(--portal-muted)", marginTop: 4 }}>{grant.outcome_reason}</p>
        </section>
      ) : null}

      <div className="document-grid">
        <GrantEditForm grant={grant} readOnly={readOnly} />

        <section>
          <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
            <strong>Fee</strong>
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
              {fee === null ? (
                <span className="table-subtext">No fee recorded</span>
              ) : (
                <>
                  <span>{money2.format(fee)}</span>
                  {canManage ? (
                    <GrantFeePaidToggle grantId={grant.id} feePaid={grant.fee_paid} />
                  ) : (
                    <span className="table-subtext">{grant.fee_paid ? "paid" : "unpaid"}</span>
                  )}
                </>
              )}
            </div>
          </div>

          {grant.website_url ? (
            <div className="table-card" style={{ padding: 16, marginBottom: 16 }}>
              <strong>Website</strong>
              <div style={{ marginTop: 8 }}>
                <a className="button button-light button-sm" href={grant.website_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} /> Open site
                </a>
              </div>
            </div>
          ) : null}

          {canDelete ? (
            <div className="table-card" style={{ padding: 16 }}>
              <strong>Danger zone</strong>
              <p className="table-subtext" style={{ marginTop: 4, marginBottom: 12 }}>
                Deleting removes this grant and its history permanently. Setting it to Not Eligible with a reason is
                usually the better move for a dead pursuit.
              </p>
              <GrantDeleteButton grantId={grant.id} grantName={grant.name} />
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
