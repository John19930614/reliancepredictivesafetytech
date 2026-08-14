// The pieces every lifecycle step screen shares: the KPI strip, the panel
// shell, the footer indicator strip and the record tab bar.
//
// Server-safe and presentational. Kept together because they are one visual
// language — a step screen is a header, a rail, four tiles, a grid of panels, a
// strip of indicators and the tabs, in that order, on all eleven steps.

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  BadgeCheck,
  ClipboardList,
  FileText,
  FolderOpen,
  History,
  LayoutGrid,
  Receipt,
  StickyNote,
  Swords,
  Users,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/* KPI tiles                                                                  */
/* -------------------------------------------------------------------------- */

export interface KpiTile {
  label: string;
  value: string;
  /** Small line under the value — context, not decoration. */
  detail?: string;
  /** Set when the tile is reporting something that needs attention. */
  tone?: "default" | "warn" | "good";
  icon?: ReactNode;
}

export function LifecycleKpis({ tiles }: { tiles: KpiTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <div className="lc-kpis">
      {tiles.map((tile) => (
        <article className={`lc-kpi lc-kpi-${tile.tone ?? "default"}`} key={tile.label}>
          {tile.icon ? (
            <span aria-hidden="true" className="lc-kpi-icon">
              {tile.icon}
            </span>
          ) : null}
          <div className="lc-kpi-body">
            <p className="lc-kpi-label">{tile.label}</p>
            <strong className="lc-kpi-value">{tile.value}</strong>
            {tile.detail ? <p className="lc-kpi-detail">{tile.detail}</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

interface LifecyclePanelProps {
  title: string;
  /** Small right-aligned label — a status, a count, a link. */
  aside?: ReactNode;
  /** Spans two columns in the grid. */
  wide?: boolean;
  children: ReactNode;
}

export function LifecyclePanel({ title, aside, wide, children }: LifecyclePanelProps) {
  return (
    <section className={`lc-panel${wide ? " lc-panel-wide" : ""}`}>
      <div className="lc-panel-head">
        <h2>{title}</h2>
        {aside ? <div className="lc-panel-aside">{aside}</div> : null}
      </div>
      <div className="lc-panel-body">{children}</div>
    </section>
  );
}

/** A label/value row, the shape most panels in the concept are made of. */
export function LifecycleFacts({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="lc-facts">
      {rows.map((row) => (
        <div className="lc-fact" key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* -------------------------------------------------------------------------- */
/* Footer indicator strip                                                     */
/* -------------------------------------------------------------------------- */

export interface Indicator {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}

export function LifecycleIndicators({ title, items }: { title: string; items: Indicator[] }) {
  return (
    <div className="lc-strip">
      <p className="lc-strip-title">{title}</p>
      <div className="lc-strip-items">
        {items.map((item) => (
          <div className="lc-strip-item" key={item.label}>
            <span className="lc-strip-label">{item.label}</span>
            <span className={`lc-pill lc-pill-${item.tone ?? "neutral"}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Record tabs                                                                */
/* -------------------------------------------------------------------------- */

export type RecordTabKey =
  | "overview"
  | "activities"
  | "notes"
  | "files"
  | "contacts"
  | "competitors"
  | "ai"
  | "timeline"
  | "invoicing";

interface RecordTab {
  key: RecordTabKey;
  label: string;
  icon: ReactNode;
  /** Absent while the tab has no screen behind it yet. */
  href?: string;
  badge?: string;
}

/**
 * The record tab bar.
 *
 * A tab with no `href` renders disabled rather than hidden, so the shape of the
 * record is visible from day one and nobody hunts for a tab that exists in the
 * design but not yet in the build.
 */
export function LifecycleRecordTabs({
  active,
  opportunityId,
  clientId,
}: {
  active: RecordTabKey;
  opportunityId: string;
  clientId: string | null;
}) {
  const base = `/employee/lifecycle/${opportunityId}`;

  const tabs: RecordTab[] = [
    { key: "overview", label: "Overview", icon: <LayoutGrid size={15} />, href: base },
    // Activities and Notes already have a home on the company record; a second
    // copy scoped to the deal would be a third place to look for the same note.
    {
      key: "activities",
      label: "Activities",
      icon: <Activity size={15} />,
      href: clientId ? `/employee/clients/${clientId}` : undefined,
    },
    {
      key: "notes",
      label: "Notes",
      icon: <StickyNote size={15} />,
      href: clientId ? `/employee/clients/${clientId}` : undefined,
    },
    // These three already have real homes elsewhere in the platform, so they
    // point at them rather than pretending to be new screens.
    { key: "files", label: "Files", icon: <FolderOpen size={15} />, href: "/employee/files" },
    {
      key: "contacts",
      label: "Contacts",
      icon: <Users size={15} />,
      href: clientId ? `/employee/clients/${clientId}` : undefined,
    },
    { key: "competitors", label: "Competitors", icon: <Swords size={15} />, href: `${base}/competitors` },
    { key: "ai", label: "AI Insights", icon: <BadgeCheck size={15} />, href: `${base}/insights` },
    { key: "timeline", label: "Timeline", icon: <History size={15} />, href: `${base}/timeline` },
    {
      key: "invoicing",
      label: "Invoicing",
      icon: <Receipt size={15} />,
      href: clientId ? `/employee/clients/${clientId}/workflow` : undefined,
      badge: "New",
    },
    // No Audit Trail tab. /employee/platform/audit is platform-admin-only, and
    // RLS returning zero rows there renders as "No audit events recorded yet" —
    // a Commercial user would be told nothing had happened, which is false. A
    // tab that lands on a falsehood is worse than no tab, and Timeline already
    // answers the question a deal's audit tab was there to answer.
  ];

  return (
    <nav aria-label="Opportunity record" className="lc-tabs">
      {tabs.map((tab) => {
        const className = `lc-tab${tab.key === active ? " lc-tab-on" : ""}${tab.href ? "" : " lc-tab-off"}`;
        const inner = (
          <>
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
            {tab.badge ? <span className="lc-tab-badge">{tab.badge}</span> : null}
          </>
        );

        return tab.href ? (
          <Link className={className} href={tab.href} key={tab.key}>
            {inner}
          </Link>
        ) : (
          <span aria-disabled="true" className={className} key={tab.key} title="Not built yet">
            {inner}
          </span>
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Step activities                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What this step is for, from the lifecycle map.
 *
 * Rendered on every step, and on steps whose bespoke panels are not built yet
 * it is the screen's honest content: here is what happens here, rather than an
 * empty grid that looks broken.
 */
export function StepActivities({ activities }: { activities: readonly string[] }) {
  return (
    <LifecyclePanel title="What happens at this step">
      <ul className="lc-list">
        {activities.map((activity) => (
          <li key={activity}>
            <ClipboardList aria-hidden="true" size={14} />
            {activity}
          </li>
        ))}
      </ul>
    </LifecyclePanel>
  );
}

/** Placeholder for a panel whose data source is not built yet. */
export function LifecycleComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <LifecyclePanel aside={<span className="lc-pill lc-pill-neutral">Not built</span>} title={title}>
      <p className="lc-empty">
        <FileText aria-hidden="true" size={14} /> {note}
      </p>
    </LifecyclePanel>
  );
}
