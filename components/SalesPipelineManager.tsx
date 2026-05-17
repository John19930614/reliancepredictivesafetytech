"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Mail,
  Phone,
  Plus,
  Target,
  TrendingUp,
  UserRound,
} from "lucide-react";
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

const negotiatingStages = new Set(["Proposal Sent", "Legal Review", "Contract Sent", "Signed / Won"]);
const liveStages = new Set(["Active Company", "Renewal / Expansion"]);

const stageDetails: Record<string, { lane: string; summary: string }> = {
  Lead: { lane: "Intake", summary: "New account fit and ownership" },
  "First Pitch": { lane: "Engaged", summary: "Initial conversation complete" },
  "Demo Scheduled": { lane: "Calendar", summary: "Demo date and attendee prep" },
  "Demo Completed": { lane: "Qualified", summary: "Demo recap and next action" },
  "Proposal Sent": { lane: "Proposal", summary: "Commercial package delivered" },
  "Legal Review": { lane: "Review", summary: "Terms, security, and approvals" },
  "Contract Sent": { lane: "Signature", summary: "Final documents in circulation" },
  "Signed / Won": { lane: "Won", summary: "Ready for activation handoff" },
  Onboarding: { lane: "Launch", summary: "Admin setup and kickoff" },
  "Pilot / Setup": { lane: "Deploy", summary: "Pilot workspace configuration" },
  "Active Company": { lane: "Live", summary: "Operational account" },
  "Renewal / Expansion": { lane: "Growth", summary: "Expansion and renewal motion" },
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

  const pipelineMetrics = useMemo(() => {
    const negotiatingCount = clients.filter((client) => negotiatingStages.has(client.lifecycle_stage)).length;
    const liveCount = clients.filter((client) => liveStages.has(client.lifecycle_stage)).length;
    const nextUpCount = clients.filter((client) =>
      ["First Pitch", "Demo Scheduled", "Demo Completed"].includes(client.lifecycle_stage),
    ).length;

    return [
      { label: "Total prospects", value: clients.length, icon: BriefcaseBusiness },
      { label: "Demo requests", value: requests.length, icon: ClipboardList },
      { label: "Active pursuits", value: nextUpCount + negotiatingCount, icon: Target },
      { label: "Live or renewal", value: liveCount, icon: CheckCircle2 },
    ];
  }, [clients, requests.length]);

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
    <div className="sales-pipeline-workspace">
      <aside className="sales-intake-panel">
        <div className="sales-panel-kicker">
          <span>
            <Plus size={15} />
          </span>
          Manual entry
        </div>
        <h2>Add company card</h2>
        <p>Create a lead, seed its onboarding checklist, and place it into the commercial workflow.</p>
        {message ? <div className="sales-status-box">{message}</div> : null}
        <form className="sales-intake-form" onSubmit={createLead}>
          <div className="field">
            <label htmlFor="name">Company name</label>
            <input id="name" name="name" placeholder="Acme Industrial" required />
          </div>
          <div className="field">
            <label htmlFor="contact_name">Primary contact</label>
            <input id="contact_name" name="contact_name" placeholder="Name and role" />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" placeholder="contact@company.com" type="email" />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" placeholder="(555) 000-0000" />
          </div>
          <div className="field">
            <label htmlFor="company_type">Company type</label>
            <input id="company_type" name="company_type" placeholder="Construction, industrial, energy" />
          </div>
          <div className="field">
            <label htmlFor="owner">Owner</label>
            <input id="owner" name="owner" placeholder="Account owner" />
          </div>
          <div className="field">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" placeholder="Buying signals, meeting context, next step" />
          </div>
          <button className="button button-primary" type="submit">
            <Plus size={18} />
            Add to Lead
          </button>
        </form>
      </aside>

      <section className="sales-board-area">
        <div className="sales-metric-strip">
          {pipelineMetrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <article className="sales-metric-card" key={metric.label}>
                <span>
                  <Icon size={18} />
                </span>
                <div>
                  <strong>{metric.value}</strong>
                  <p>{metric.label}</p>
                </div>
              </article>
            );
          })}
        </div>

        {requests.length > 0 ? (
          <div className="demo-request-panel">
            <div className="demo-request-head">
              <div>
                <span className="eyebrow">Request inbox</span>
                <h2>New demo requests</h2>
              </div>
              <span className="badge">{requests.length}</span>
            </div>
            <div className="demo-request-grid">
              {requests.map((request) => (
                <article className="demo-request-card" key={request.id}>
                  <div>
                    <h3>{request.company || request.name}</h3>
                    <p>{request.name} - {request.email}</p>
                  </div>
                  <button className="button button-light" onClick={() => convertDemoRequest(request)} type="button">
                    Convert to lead
                  </button>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <div className="sales-board-head">
          <div>
            <span className="eyebrow">Lifecycle board</span>
            <h2>Pipeline movement</h2>
          </div>
          <div className="sales-board-trend">
            <TrendingUp size={18} />
            <span>{clients.length} account cards</span>
          </div>
        </div>

        <div className="pipeline-grid">
          {lifecycleStages.map((stage, index) => (
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
                <div>
                  <span>{stageDetails[stage]?.lane ?? `Stage ${index + 1}`}</span>
                  <h2>{stage}</h2>
                </div>
                <span className="pipeline-count">{groupedClients[stage]?.length ?? 0}</span>
              </div>
              <p className="pipeline-column-summary">{stageDetails[stage]?.summary}</p>
              <div className="pipeline-card-list">
                {(groupedClients[stage] ?? []).length > 0 ? (
                  (groupedClients[stage] ?? []).map((client) => (
                    <article
                      className={`pipeline-card ${draggingClientId === client.id ? "pipeline-card-dragging" : ""}`}
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
                      <div className="pipeline-card-top">
                        <span>
                          <Building2 size={16} />
                        </span>
                        <div>
                          <h3>{client.name}</h3>
                          <p>{client.company_type || "Company account"}</p>
                        </div>
                      </div>
                      <div className="pipeline-contact-lines">
                        <span>
                          <UserRound size={14} />
                          {client.contact_name || "No contact assigned"}
                        </span>
                        {client.email ? (
                          <span>
                            <Mail size={14} />
                            {client.email}
                          </span>
                        ) : client.phone ? (
                          <span>
                            <Phone size={14} />
                            {client.phone}
                          </span>
                        ) : null}
                      </div>
                      <div className="pipeline-card-meta">
                        <span>{client.owner || "Unassigned"}</span>
                        <span>{client.source || "Manual"}</span>
                        <span>
                          <CalendarDays size={13} />
                          {formatDate(client.updated_at)}
                        </span>
                      </div>
                      <Link className="button button-light" href={`/employee/clients/${client.id}`}>
                        Open record <ArrowRight size={16} />
                      </Link>
                    </article>
                  ))
                ) : (
                  <div className="pipeline-empty-state">No cards in this stage</div>
                )}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
