import Link from "next/link";
import { getProposalAccess } from "@/lib/proposals/access";
import type { ProposalStatus } from "@/lib/proposals/types";
import { ProposalStatusBadge } from "@/components/proposals/ProposalStatusBadge";
import { ProposalCreateForm } from "@/components/proposals/ProposalCreateForm";

interface ProposalListRow {
  id: string;
  title: string;
  status: ProposalStatus;
  owner: string | null;
  proposal_value: number | null;
  current_revision: number;
  updated_at: string;
  client: { name: string } | null;
}

interface ClientOption {
  id: string;
  name: string;
}

export default async function ProposalsPage() {
  const { supabase } = await getProposalAccess();

  const [{ data: proposals }, { data: clients }] = supabase
    ? await Promise.all([
        supabase
          .from("client_proposals")
          .select("id, title, status, owner, proposal_value, current_revision, updated_at, client:company_clients(name)")
          .order("updated_at", { ascending: false })
          .limit(200),
        supabase.from("company_clients").select("id, name").order("name"),
      ])
    : [{ data: null }, { data: null }];

  const rows = (proposals ?? []) as unknown as ProposalListRow[];
  const clientOptions = (clients ?? []) as ClientOption[];

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Proposals</div>
          <h1>Client proposals</h1>
          <p>Draft proposals, assign them to a company, and track every revision from first draft to signature.</p>
        </div>
      </div>

      <div className="document-grid">
        <ProposalCreateForm clients={clientOptions} />

        <section>
          <h2 style={{ marginBottom: 12 }}>All proposals</h2>
          {rows.length === 0 ? (
            <div className="empty-state">No proposals yet. Create one to get started.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>Value</th>
                  <th>Rev</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/employee/proposals/${p.id}`}>{p.title}</Link>
                    </td>
                    <td>{p.client?.name ?? "—"}</td>
                    <td>
                      <ProposalStatusBadge status={p.status} />
                    </td>
                    <td>{p.owner ?? "—"}</td>
                    <td>{p.proposal_value != null ? `$${Number(p.proposal_value).toLocaleString()}` : "—"}</td>
                    <td>v{p.current_revision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
