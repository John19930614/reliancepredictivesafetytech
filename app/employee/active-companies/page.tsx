import Link from "next/link";
import type { CompanyClient } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

export default async function ActiveCompaniesPage() {
  const supabase = await createClient();
  const { data } = supabase
    ? await supabase
        .from("company_clients")
        .select("*")
        .in("lifecycle_stage", ["Active Company", "Renewal / Expansion"])
        .order("updated_at", { ascending: false })
    : { data: null };
  const clients = (data ?? []) as CompanyClient[];

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Active Companies</div>
          <h1>Signed and onboarded customers</h1>
          <p>Companies Reliance is actively serving or reviewing for renewal and expansion.</p>
        </div>
      </div>
      <div className="portal-grid">
        {clients.length === 0 ? (
          <div className="empty-state">No active companies yet.</div>
        ) : (
          clients.map((client) => (
            <Link className="portal-card" href={`/employee/clients/${client.id}`} key={client.id}>
              <h3>{client.name}</h3>
              <p>{client.contact_name ?? "No contact"} - {client.email ?? "No email"}</p>
              <div className="metric" style={{ fontSize: "1.1rem" }}>
                {client.lifecycle_stage}
              </div>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
