import Link from "next/link";
import { UserPen } from "lucide-react";
import { getProposalAccess } from "@/lib/proposals/access";
import { isProposalUuid } from "@/lib/proposals/policy";
import { proposalStatusLabels, proposalStatuses, type ProposalStatus } from "@/lib/proposals/types";
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
  /** Proposal moniker (HUN); null until assigned. The create form prompts when missing. */
  client_code?: string | null;
}

interface ProposalsSearchParams {
  q?: string;
  status?: string;
  client?: string;
  page?: string;
}

const pageSize = 50;
/** Bounds the company dropdown; the selected one is fetched separately if it falls outside. */
const clientOptionLimit = 500;
const maxSearchLength = 120;

/**
 * `%` and `_` are LIKE wildcards. Escaping them keeps the search literal so a
 * title containing an underscore is findable and a typed `%` does not silently
 * turn into "match everything".
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function buildHref(params: ProposalsSearchParams): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("status", params.status);
  if (params.client) query.set("client", params.client);
  if (params.page && params.page !== "1") query.set("page", params.page);
  const suffix = query.toString();
  return suffix ? `/employee/proposals?${suffix}` : "/employee/proposals";
}

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<ProposalsSearchParams>;
}) {
  const params = await searchParams;
  const { supabase } = await getProposalAccess();

  // Every filter is read from the URL and applied in the DATABASE query — this
  // stays a server component, so nothing here becomes a client-side Supabase
  // read/mutation (CLAUDE.md, architectural conventions).
  const search = (params.q ?? "").trim().slice(0, maxSearchLength);
  const status = proposalStatuses.includes(params.status as ProposalStatus) ? (params.status as ProposalStatus) : "";
  const clientId = params.client && isProposalUuid(params.client) ? params.client.trim() : "";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const rangeStart = (page - 1) * pageSize;

  let rows: ProposalListRow[] = [];
  let clientOptions: ClientOption[] = [];
  let totalCount = 0;

  if (supabase) {
    let query = supabase
      .from("client_proposals")
      .select(
        "id, title, status, owner, proposal_value, current_revision, updated_at, client:company_clients(name)",
        { count: "exact" },
      )
      .order("updated_at", { ascending: false })
      .range(rangeStart, rangeStart + pageSize - 1);

    if (status) query = query.eq("status", status);
    if (clientId) query = query.eq("client_id", clientId);
    if (search) query = query.ilike("title", `%${escapeLikePattern(search)}%`);

    const [{ data: proposals, count }, { data: clients }] = await Promise.all([
      query,
      supabase.from("company_clients").select("id, name, client_code").order("name").limit(clientOptionLimit),
    ]);

    rows = (proposals ?? []) as unknown as ProposalListRow[];
    clientOptions = (clients ?? []) as ClientOption[];
    totalCount = typeof count === "number" ? count : rows.length;

    // Keep the filter honest when the selected company sits past the dropdown cap.
    if (clientId && !clientOptions.some((option) => option.id === clientId)) {
      const { data: selected } = await supabase
        .from("company_clients")
        .select("id, name, client_code")
        .eq("id", clientId)
        .maybeSingle();
      if (selected) clientOptions = [selected as ClientOption, ...clientOptions];
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const filtersApplied = Boolean(search || status || clientId);
  const showingFrom = totalCount === 0 ? 0 : rangeStart + 1;
  const showingTo = rangeStart + rows.length;

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Proposals</div>
          <h1>Client proposals</h1>
          <p>Draft proposals, assign them to a company, and track every revision from first draft to signature.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Link className="button button-light" href="/employee/proposals/bio">
            <UserPen size={16} /> My bio &amp; signature
          </Link>
          <span className="badge">{totalCount} total</span>
        </div>
      </div>

      <div className="document-grid">
        <ProposalCreateForm clients={clientOptions} />

        <section>
          <h2 style={{ marginBottom: 12 }}>All proposals</h2>

          <form className="filters" method="get" action="/employee/proposals">
            <div className="field">
              <label htmlFor="proposal-search">Search title</label>
              <input id="proposal-search" name="q" defaultValue={search} placeholder="e.g. Acme Construction" />
            </div>
            <div className="field">
              <label htmlFor="proposal-status-filter">Status</label>
              <select id="proposal-status-filter" name="status" defaultValue={status}>
                <option value="">All statuses</option>
                {proposalStatuses.map((value) => (
                  <option key={value} value={value}>
                    {proposalStatusLabels[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="proposal-client-filter">Company</label>
              <select id="proposal-client-filter" name="client" defaultValue={clientId}>
                <option value="">All companies</option>
                {clientOptions.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ alignSelf: "end", display: "flex", gap: 8 }}>
              <button className="button button-primary" type="submit">
                Apply
              </button>
              {filtersApplied ? (
                <Link className="button button-light" href="/employee/proposals">
                  Clear
                </Link>
              ) : null}
            </div>
          </form>

          {rows.length === 0 ? (
            <div className="empty-state">
              {filtersApplied
                ? "No proposals match these filters."
                : "No proposals yet. Create one to get started."}
            </div>
          ) : (
            <>
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Company</th>
                      <th>Status</th>
                      <th>Owner</th>
                      <th>Value</th>
                      <th>Rev</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((proposal) => (
                      <tr key={proposal.id}>
                        <td>
                          <Link href={`/employee/proposals/${proposal.id}`}>{proposal.title}</Link>
                        </td>
                        <td>{proposal.client?.name ?? "—"}</td>
                        <td>
                          <ProposalStatusBadge status={proposal.status} />
                        </td>
                        <td>{proposal.owner ?? "—"}</td>
                        <td>
                          {proposal.proposal_value != null
                            ? `$${Number(proposal.proposal_value).toLocaleString("en-US")}`
                            : "—"}
                        </td>
                        <td>v{proposal.current_revision}</td>
                        <td>
                          {new Date(proposal.updated_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginTop: 12,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ color: "var(--portal-muted)", fontSize: "0.85rem" }}>
                  Showing {showingFrom}–{showingTo} of {totalCount} · page {page} of {totalPages}
                </span>
                <span style={{ display: "flex", gap: 8 }}>
                  {page > 1 ? (
                    <Link
                      className="button button-light"
                      href={buildHref({ q: search, status, client: clientId, page: String(page - 1) })}
                    >
                      Previous
                    </Link>
                  ) : null}
                  {page < totalPages ? (
                    <Link
                      className="button button-light"
                      href={buildHref({ q: search, status, client: clientId, page: String(page + 1) })}
                    >
                      Next
                    </Link>
                  ) : null}
                </span>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
