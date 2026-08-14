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
  Video,
  Target,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { SalesMeetingInvitePanel } from "@/components/SalesMeetingInvitePanel";
import {
  defaultClientOnboardingItems,
  lifecycleStages,
  type CompanyClient,
} from "@/lib/company-data";
import {
  liveStages as pipelineLiveStages,
  stageDetails as pipelineStageDetails,
} from "@/lib/pipeline/stages";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/friendly-error";

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
// Widened to string: lifecycle_stage is free text in the database, so the
// lookup has to accept a value that is not a known stage and simply miss.
const liveStages = new Set<string>(pipelineLiveStages);

// `lane` and `summary` used to be a second copy of the stage table maintained
// here. They now come from lib/pipeline/stages so the board and the per-client
// workflow view cannot describe the same stage differently — and so adding a
// stage means editing one file, not three.
const stageDetails = pipelineStageDetails as Record<string, { lane: string; summary: string }>;

export function SalesPipelineManager({ initialClients, demoRequests }: SalesPipelineManagerProps) {
  const [clients, setClients] = useState(initialClients);
  const [requests, setRequests] = useState(demoRequests);
  const [message, setMessage] = useState("");
  const [inviteDraft, setInviteDraft] = useState({
    key: "blank",
    title: "SafetyDocs360 sales presentation",
    recipients: "",
    clientId: null as string | null,
    demoRequestId: null as string | null,
  });
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
    const form = event.currentTarget;
    setMessage("");
    const formData = new FormData(form);
    const supabase = createClient();
    if (!supabase) {
      setMessage("Company data is unavailable right now. Refresh the page, or contact an administrator.");
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
      console.error(error);
      setMessage(friendlyError(error, "Could not create lead."));
      return;
    }

    await seedOnboarding(data.id, payload.owner);
    setClients((current) => [data as CompanyClient, ...current]);
    form.reset();
    setMessage("Company card added to Lead with onboarding checklist.");
  }

  async function convertDemoRequest(request: DemoRequest) {
    setMessage("");
    const supabase = createClient();
    if (!supabase) {
      setMessage("Company data is unavailable right now. Refresh the page, or contact an administrator.");
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
      console.error(error);
      setMessage(friendlyError(error, "Could not convert demo request."));
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
      // stage_changed_at travels with every lifecycle_stage write. Without it
      // the workflow view's "N days on this step" quietly means "days since the
      // last move made through the workflow page", which is not what it says.
      const { error } = await supabase
        .from("company_clients")
        .update({ lifecycle_stage, stage_changed_at: new Date().toISOString() })
        .eq("id", client.id);
      if (error) {
        console.error(error);
        setClients((current) => current.map((item) => (item.id === client.id ? { ...item, lifecycle_stage: previousStage } : item)));
        setMessage(friendlyError(error, "Could not move the card. It was returned to its previous stage."));
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

  function stageMeetingInvite(values: {
    key: string;
    title: string;
    recipients: string;
    clientId?: string | null;
    demoRequestId?: string | null;
  }) {
    setInviteDraft({
      key: values.key,
      title: values.title,
      recipients: values.recipients,
      clientId: values.clientId ?? null,
      demoRequestId: values.demoRequestId ?? null,
    });
    setMessage("Sales meeting invite loaded. Review the recipients and send when ready.");
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
        <SalesMeetingInvitePanel
          key={inviteDraft.key}
          compact
          clientId={inviteDraft.clientId}
          demoRequestId={inviteDraft.demoRequestId}
          defaultRecipients={inviteDraft.recipients}
          defaultTitle={inviteDraft.title}
        />
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
                  <button
                    className="button button-secondary"
                    onClick={() =>
                      stageMeetingInvite({
                        key: `request-${request.id}`,
                        title: `SafetyDocs360 demo for ${request.company || request.name}`,
                        recipients: request.email,
                        demoRequestId: request.id,
                      })
                    }
                    type="button"
                  >
                    <Video size={16} />
                    Invite
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
                      {/* The board answers "where is everything"; the workflow
                          view answers "what happens next to this one", which is
                          where the stage gates and the invoice step live. */}
                      <Link className="button button-light" href={`/employee/clients/${client.id}/workflow`}>
                        Open workflow <ArrowRight size={16} />
                      </Link>
                      <Link className="button button-secondary" href={`/employee/clients/${client.id}`}>
                        Full record
                      </Link>
                      <button
                        className="button button-secondary"
                        onClick={() =>
                          stageMeetingInvite({
                            key: `client-${client.id}`,
                            title: `SafetyDocs360 demo for ${client.name}`,
                            recipients: client.email ?? "",
                            clientId: client.id,
                          })
                        }
                        type="button"
                      >
                        <Video size={16} />
                        Invite
                      </button>
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
