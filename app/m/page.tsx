import { ArrowUpRight, Bell, Lightbulb, MessageCircle, Plus, Target, TrendingUp } from "lucide-react";
import Link from "next/link";
import { MobileAvatar } from "@/components/mobile/MobileAvatar";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { MobileInstallPrompt } from "@/components/mobile/MobileInstallPrompt";
import { canAccessMobileTab, formatRelativeTimestamp, mobileAppTabs } from "@/lib/mobile-app";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import { loadMobileSession } from "./session";

export const dynamic = "force-dynamic";

const EARLY_PIPELINE_STAGES = ["Lead", "First Pitch", "Demo Scheduled", "Demo Completed", "Proposal Sent"];

function getGreeting(now: Date) {
  const hour = now.getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 18) {
    return "Good afternoon";
  }

  return "Good evening";
}

export default async function MobileHomePage() {
  const session = await loadMobileSession();
  const { supabase } = session;

  const canSeeIdeas = canAccessMobileTab(
    mobileAppTabs.find((tab) => tab.key === "ideas")!,
    session.role,
    session.accountStatus,
    session.moduleKeys,
  );
  const canSeeLeads = canAccessMobileTab(
    mobileAppTabs.find((tab) => tab.key === "leads")!,
    session.role,
    session.accountStatus,
    session.moduleKeys,
  );

  const [{ data: profile }, { count: unreadCount }, ideasResult, leadsResult, activityResult] = await Promise.all([
    supabase.from("employee_chat_profiles").select("display_name").eq("user_id", session.userId).maybeSingle(),
    supabase
      .from("portal_notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_user_id", session.userId)
      .eq("status", "unread")
      .eq("source_type", "employee_chat_message"),
    canSeeIdeas
      ? supabase
          .from("brainstorming_parking_lot_cards")
          .select("id, title, lane, priority, created_at", { count: "exact" })
          .eq("created_by_user_id", session.userId)
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [], count: 0, error: null }),
    canSeeLeads
      ? supabase
          .from("company_clients")
          .select("id, name, lifecycle_stage, updated_at", { count: "exact" })
          .in("lifecycle_stage", EARLY_PIPELINE_STAGES)
          .order("updated_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [], count: 0, error: null }),
    canSeeLeads
      ? supabase
          .from("company_sales_activities")
          .select("id, title, activity_type, created_at, client_id")
          .order("created_at", { ascending: false })
          .limit(4)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const result of [ideasResult, leadsResult, activityResult]) {
    if (result.error && !isMissingSchemaRelationError(result.error)) {
      console.error("Could not load mobile home data.", result.error);
    }
  }

  const displayName = profile?.display_name || session.email?.split("@")[0] || "there";
  const firstName = displayName.split(/[\s.]+/)[0];
  const ideas = ideasResult.data ?? [];
  const leads = leadsResult.data ?? [];
  const activities = activityResult.data ?? [];
  const now = new Date();

  return (
    <>
      <MobileHeader
        eyebrow={getGreeting(now)}
        subtitle="Here is what needs you today."
        title={firstName}
        action={<MobileAvatar name={displayName} seed={session.userId} size="lg" />}
      />

      <MobileInstallPrompt />

      <section className="m-stat-grid">
        <Link className="m-stat-card" href="/m/chat">
          <span className="m-stat-icon tone-blue">
            <MessageCircle aria-hidden="true" size={18} strokeWidth={2.2} />
          </span>
          <span className="m-stat-value">{unreadCount ?? 0}</span>
          <span className="m-stat-label">Unread messages</span>
        </Link>

        {canSeeIdeas ? (
          <Link className="m-stat-card" href="/m/ideas">
            <span className="m-stat-icon tone-gold">
              <Lightbulb aria-hidden="true" size={18} strokeWidth={2.2} />
            </span>
            <span className="m-stat-value">{ideasResult.count ?? 0}</span>
            <span className="m-stat-label">Ideas you submitted</span>
          </Link>
        ) : null}

        {canSeeLeads ? (
          <Link className="m-stat-card" href="/m/leads">
            <span className="m-stat-icon tone-green">
              <Target aria-hidden="true" size={18} strokeWidth={2.2} />
            </span>
            <span className="m-stat-value">{leadsResult.count ?? 0}</span>
            <span className="m-stat-label">Leads in early stages</span>
          </Link>
        ) : null}
      </section>

      <section className="m-section">
        <h2 className="m-section-title">
          <Plus aria-hidden="true" size={15} strokeWidth={2.4} />
          Quick actions
        </h2>
        <div className="m-quick-actions">
          <Link className="m-quick-action" href="/m/chat">
            <span className="m-quick-icon tone-blue">
              <MessageCircle aria-hidden="true" size={19} strokeWidth={2.1} />
            </span>
            <span className="m-quick-text">
              <strong>Message the team</strong>
              <small>Company thread or a direct message</small>
            </span>
            <ArrowUpRight aria-hidden="true" className="m-quick-arrow" size={17} strokeWidth={2.1} />
          </Link>

          {canSeeIdeas ? (
            <Link className="m-quick-action" href="/m/ideas?compose=1">
              <span className="m-quick-icon tone-gold">
                <Lightbulb aria-hidden="true" size={19} strokeWidth={2.1} />
              </span>
              <span className="m-quick-text">
                <strong>Submit an idea</strong>
                <small>Goes straight to the parking lot board</small>
              </span>
              <ArrowUpRight aria-hidden="true" className="m-quick-arrow" size={17} strokeWidth={2.1} />
            </Link>
          ) : null}

          {canSeeLeads ? (
            <Link className="m-quick-action" href="/m/leads">
              <span className="m-quick-icon tone-green">
                <TrendingUp aria-hidden="true" size={19} strokeWidth={2.1} />
              </span>
              <span className="m-quick-text">
                <strong>Update a lead</strong>
                <small>Move a stage or log a call</small>
              </span>
              <ArrowUpRight aria-hidden="true" className="m-quick-arrow" size={17} strokeWidth={2.1} />
            </Link>
          ) : null}
        </div>
      </section>

      {canSeeLeads && leads.length > 0 ? (
        <section className="m-section">
          <div className="m-section-head">
            <h2 className="m-section-title">
              <Target aria-hidden="true" size={15} strokeWidth={2.4} />
              Needs a nudge
            </h2>
            <Link className="m-section-link" href="/m/leads">
              All leads
            </Link>
          </div>
          <ul className="m-list">
            {leads.map((lead) => (
              <li key={lead.id}>
                <Link className="m-list-row" href={`/m/leads/${lead.id}`}>
                  <MobileAvatar name={lead.name} seed={lead.id} />
                  <span className="m-list-body">
                    <strong>{lead.name}</strong>
                    <small>
                      <span className="m-stage-dot" />
                      {lead.lifecycle_stage} · {formatRelativeTimestamp(lead.updated_at, now)}
                    </small>
                  </span>
                  <ArrowUpRight aria-hidden="true" className="m-list-arrow" size={16} strokeWidth={2.1} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canSeeIdeas && ideas.length > 0 ? (
        <section className="m-section">
          <div className="m-section-head">
            <h2 className="m-section-title">
              <Lightbulb aria-hidden="true" size={15} strokeWidth={2.4} />
              Your recent ideas
            </h2>
            <Link className="m-section-link" href="/m/ideas">
              All ideas
            </Link>
          </div>
          <ul className="m-list">
            {ideas.map((idea) => (
              <li key={idea.id}>
                <div className="m-list-row is-static">
                  <span className="m-list-icon tone-gold">
                    <Lightbulb aria-hidden="true" size={16} strokeWidth={2.1} />
                  </span>
                  <span className="m-list-body">
                    <strong>{idea.title}</strong>
                    <small>
                      {idea.priority} priority · {formatRelativeTimestamp(idea.created_at, now)}
                    </small>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canSeeLeads && activities.length > 0 ? (
        <section className="m-section">
          <h2 className="m-section-title">
            <Bell aria-hidden="true" size={15} strokeWidth={2.4} />
            Latest pipeline activity
          </h2>
          <ul className="m-timeline">
            {activities.map((activity) => (
              <li className="m-timeline-item" key={activity.id}>
                <span className="m-timeline-marker" />
                <div className="m-timeline-body">
                  <strong>{activity.title}</strong>
                  <small>
                    {activity.activity_type} · {formatRelativeTimestamp(activity.created_at, now)}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
