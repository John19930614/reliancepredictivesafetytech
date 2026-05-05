"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import {
  defaultClientOnboardingItems,
  lifecycleStages,
  type CompanyClient,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";

type DemoRequest = {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  role: string | null;
  company_type: string | null;
  message: string | null;
  status: string;
  created_at: string;
};

type SalesPipelineManagerProps = {
  initialClients: CompanyClient[];
  demoRequests: DemoRequest[];
};

export function SalesPipelineManager({ initialClients, demoRequests }: SalesPipelineManagerProps) {
  const [clients, setClients] = useState(initialClients);
  const [requests, setRequests] = useState(demoRequests);
  const [message, setMessage] = useState("");
  const [draggingClientId, setDraggingClientId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);

  const groupedClients = useMemo(() => {
    return lifecycleStages.reduce<Record<string, CompanyClient[]>>((accumulator, stage) => {
      accumulator[stage] = clients.filter((client) => client.lifecycle_stage === stage);
      return accumulator;
    }, {});
  }, [clients]);

  async function seedOnboarding(clientId: string, owner: string) {
    const supabase = createClient();
    if (!supabase) {
      return;
    }

    await supabase.from("client_onboarding_items").insert(
      defaultClientOnboardingItems.map((item, index) => ({
        client_id: clientId,
        title: item.title,
        section: item.section,
        lifecycle_stage: item.lifecycle_stage,
        owner,
        sort_order: (index + 1) * 10,
      })),
    );
  }

  async function createLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const supabase = createClient();
    if (!supabase) {
      setMessage("Supabase is required to create leads.");
      return;
    }

    const payload = {
      name: String(formData.get("name") ?? ""),
      contact_name: String(formData.get("contact_name") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      company_type: String(formData.get("company_type") ?? ""),
      lifecycle_stage: "Lead",
      owner: String(formData.get("owner") ?? ""),
      source: "Manual",
      notes: String(formData.get("notes") ?? ""),
    };

    const { data, error } = await supabase.from("company_clients").insert(payload).select("*").single();
    if (error || !data) {
      setMessage(error?.message ?? "Could not create lead.");
      return;
    }

    await seedOnboarding(data.id, payload.owner);
    setClients((current) => [data as CompanyClient, ...current]);
    event.currentTarget.reset();
    setMessage("Company card added to Lead with onboarding checklist.");
  }

  async function convertDemoRequest(request: DemoRequest) {
    setMessage("");
    const supabase = createClient();
    if (!supabase) {
      setMessage("Supabase is required to convert demo requests.");
      return;
    }

    const { data, error } = await supabase
      .from("company_clients")
      .insert({
        name: request.company || request.name,
        contact_name: request.name,
        email: request.email,
        phone: request.phone,
        company_type: request.company_type,
        lifecycle_stage: "Lead",
        source: "Demo Request",
        notes: request.message,
      })
      .select("*")
      .single();

    if (error || !data) {
      setMessage(error?.message ?? "Could not convert demo request.");
      return;
    }

    await seedOnboarding(data.id, "");
    await supabase.from("demo_requests").update({ status: "converted" }).eq("id", request.id);
    await supabase.from("company_sales_activities").insert({
      client_id: data.id,
      activity_type: "Demo Request",
      title: `Demo request from ${request.name}`,
      notes: request.message,
      activity_date: request.created_at.slice(0, 10),
      outcome: "Converted to lead",
    });

    setClients((current) => [data as CompanyClient, ...current]);
    setRequests((current) => current.filter((item) => item.id !== request.id));
    setMessage("Demo request converted to Lead.");
  }

  async function updateStage(client: CompanyClient, lifecycle_stage: string) {
    if (client.lifecycle_stage === lifecycle_stage) {
      return;
    }

    const previousStage = client.lifecycle_stage;
    setClients((current) => current.map((item) => (item.id === client.id ? { ...item, lifecycle_stage } : item)));
    const supabase = createClient();
    if (supabase) {
      const { error } = await supabase.from("company_clients").update({ lifecycle_stage }).eq("id", client.id);
      if (error) {
        setClients((current) => current.map((item) => (item.id === client.id ? { ...item, lifecycle_stage: previousStage } : item)));
        setMessage(error.message);
        return;
      }
    }
    setMessage(`${client.name} moved to ${lifecycle_stage}.`);
  }

  function handleDrop(stage: string) {
    const client = clients.find((item) => item.id === draggingClientId);
    setDropStage(null);
    setDraggingClientId(null);
    if (client) {
      void updateStage(client, stage);
    }
  }

  function formatDate(value: string | null | undefined) {
    if (!value) {
      return "No update";
    }
    return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="lifecycle-layout">
      <aside className="form-panel">
        <h2>Add company card</h2>
        {message ? <div className="success-box">{message}</div> : null}
        <form className="form-grid" onSubmit={createLead} style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
          <div className="field">
            <label htmlFor="name">Company name</label>
            <input id="name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="contact_name">Primary contact</label>
            <input id="contact_name" name="contact_name" />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" />
          </div>
          <div className="field">
            <label htmlFor="company_type">Company type</label>
            <input id="company_type" name="company_type" />
          </div>
          <div className="field">
            <label htmlFor="owner">Owner</label>
            <input id="owner" name="owner" />
          </div>
          <div className="field">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" />
          </div>
          <button className="button button-primary" type="submit">
            <Plus size={18} />
            Add to Lead
          </button>
        </form>
      </aside>

      <section>
        {requests.length > 0 ? (
          <div className="table-card" style={{ marginBottom: 18 }}>
            <section className="checklist-section">
              <h2>New demo requests</h2>
              <div className="doc-list">
                {requests.map((request) => (
                  <article className="doc-card" key={request.id}>
                    <h3>{request.company || request.name}</h3>
                    <p>{request.name} - {request.email}</p>
                    <button className="button button-light" onClick={() => convertDemoRequest(request)} type="button">
                      Convert to lead
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        <div className="pipeline-grid">
          {lifecycleStages.map((stage) => (
            <section
              className={`pipeline-column ${dropStage === stage ? "pipeline-column-active" : ""}`}
              key={stage}
              onDragOver={(event) => {
                event.preventDefault();
                setDropStage(stage);
              }}
              onDragLeave={() => setDropStage((current) => (current === stage ? null : current))}
              onDrop={() => handleDrop(stage)}
            >
              <div className="pipeline-column-head">
                <h2>{stage}</h2>
                <span className="badge">{groupedClients[stage]?.length ?? 0}</span>
              </div>
              <div className="doc-list">
                {(groupedClients[stage] ?? []).map((client) => (
                  <article
                    className={`doc-card pipeline-card ${draggingClientId === client.id ? "pipeline-card-dragging" : ""}`}
                    draggable
                    key={client.id}
                    onDragEnd={() => {
                      setDraggingClientId(null);
                      setDropStage(null);
                    }}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", client.id);
                      setDraggingClientId(client.id);
                    }}
                  >
                    <h3>{client.name}</h3>
                    <p>{client.contact_name || "No contact"} {client.email ? `- ${client.email}` : client.phone ? `- ${client.phone}` : ""}</p>
                    <div className="pipeline-card-meta">
                      <span>{client.owner || "Unassigned"}</span>
                      <span>{client.source || "Manual"}</span>
                      <span>{formatDate(client.updated_at)}</span>
                    </div>
                    <Link className="button button-light" href={`/employee/clients/${client.id}`}>
                      Open record <ArrowRight size={16} />
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
