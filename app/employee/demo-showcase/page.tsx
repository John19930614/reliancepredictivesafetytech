"use client";

import { useState } from "react";
import {
  AppWindow,
  Armchair,
  BarChart3,
  BriefcaseBusiness,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  Gauge,
  GraduationCap,
  HardHat,
  MonitorPlay,
  Presentation,
  Scale,
  ShieldAlert,
  Trash2,
  UserRound,
} from "lucide-react";
import { DemoDeckViewer } from "@/components/DemoDeckViewer";
import { InteractiveDemoViewer } from "@/components/InteractiveDemoViewer";
import { SalesMeetingInvitePanel } from "@/components/SalesMeetingInvitePanel";
import { interactiveDemos } from "@/lib/demos/interactive-demos";

const constructionLinks = [
  {
    label: "Field Audits",
    href: "https://safety360docs.com/field-audits",
    description: "Field audit capture and safety observation workflows.",
    icon: FileCheck2,
  },
  {
    label: "CSEP",
    href: "https://safety360docs.com/csep",
    description: "Contractor safety execution plan generation and review.",
    icon: Presentation,
  },
  {
    label: "Safe Predict",
    href: "https://safety360docs.com/safe-predict",
    description: "Predictive safety command center and risk overview.",
    icon: Gauge,
  },
  {
    label: "Workforce",
    href: "https://safety360docs.com/safe-predict/workforce",
    description: "Workforce safety signals and crew risk context.",
    icon: UserRound,
  },
  {
    label: "Safe Predict Analytics",
    href: "https://safety360docs.com/safe-predict/analytics",
    description: "Predictive safety trends, analytics, and risk indicators.",
    icon: BarChart3,
  },
  {
    label: "Permits",
    href: "https://safety360docs.com/safe-predict/permits",
    description: "Permit activity and predictive safety permit review.",
    icon: BriefcaseBusiness,
  },
  {
    label: "Hazards",
    href: "https://safety360docs.com/safe-predict/hazards",
    description: "Hazard tracking and leading risk signals.",
    icon: FileCheck2,
  },
  {
    label: "Jobsites",
    href: "https://safety360docs.com/safe-predict/jobsites",
    description: "Jobsite records, project context, and safety activity.",
    icon: HardHat,
  },
];

const macoLinks = [
  {
    label: "Dashboard",
    href: "https://safetyiq-platform.vercel.app/dashboard",
    description: "Command center overview of safety status, alerts, and tasks.",
    icon: Gauge,
  },
  {
    label: "Legal Register",
    href: "https://safetyiq-platform.vercel.app/legal",
    description: "Applicable legal and standards obligations with evidence.",
    icon: Scale,
  },
  {
    label: "Risk Intelligence",
    href: "https://safetyiq-platform.vercel.app/risk",
    description: "Predictive risk trends, heat maps, and recommended actions.",
    icon: ShieldAlert,
  },
  {
    label: "Corrective Actions / CAPA",
    href: "https://safetyiq-platform.vercel.app/capa",
    description: "Assign, track, verify, and close findings to resolution.",
    icon: ClipboardCheck,
  },
  {
    label: "Training & Competency",
    href: "https://safetyiq-platform.vercel.app/training",
    description: "Role and hazard-based training status, completions, and gaps.",
    icon: GraduationCap,
  },
  {
    label: "Chemical Management",
    href: "https://safetyiq-platform.vercel.app/chemicals",
    description: "Chemical inventory, SDS currency, and hazard class tracking.",
    icon: FlaskConical,
  },
  {
    label: "Waste Management",
    href: "https://safetyiq-platform.vercel.app/waste",
    description: "Waste profiles, accumulation, manifests, and disposal records.",
    icon: Trash2,
  },
  {
    label: "Ergonomics",
    href: "https://safetyiq-platform.vercel.app/ergonomics",
    description: "Ergonomic assessments and musculoskeletal risk reduction.",
    icon: Armchair,
  },
  {
    label: "Reports & Analytics",
    href: "https://safetyiq-platform.vercel.app/reports",
    description: "Executive, compliance, risk, and audit reporting.",
    icon: BarChart3,
  },
];

const interactiveDemoIcons: Record<string, typeof Gauge> = {
  safepredict: Gauge,
  aeris: AppWindow,
};

type DemoTab = "construction" | "maco" | "interactive" | "scheduler";

export default function DemoShowcasePage() {
  const [activeTab, setActiveTab] = useState<DemoTab>("construction");
  const [activeInteractiveKey, setActiveInteractiveKey] = useState<string>(interactiveDemos[0].key);

  const activeInteractiveDemo =
    interactiveDemos.find((demo) => demo.key === activeInteractiveKey) ?? interactiveDemos[0];

  const isDeckTab = activeTab === "construction" || activeTab === "maco";
  const isConstruction = activeTab === "construction";

  const links = isConstruction ? constructionLinks : macoLinks;
  const deckTitle = isConstruction ? "Reliance demo deck" : "MACO demo deck";
  const deckPdfPath = isConstruction ? "/demo-deck.pdf" : "/maco-demo-deck.pdf";
  const slidePath = isConstruction ? "/demo-deck-slides" : "/maco-demo-deck-slides";
  const totalPages = isConstruction ? 29 : 17;
  const platformLabel = isConstruction ? "SafetyDocs360 demo links" : "MACO demo links";

  return (
    <div className="demo-showcase">
      <div className="portal-topline command-hero">
        <div>
          <div className="eyebrow">Demo Showcase</div>
          <h1>Presentation and platform links</h1>
          <p>Use this page during sales calls to keep the deck and live platform pages in one protected workspace.</p>
        </div>
        {isDeckTab && (
          <a className="button button-light" href={deckPdfPath} target="_blank" rel="noreferrer">
            Open Deck <ExternalLink size={17} />
          </a>
        )}
      </div>

      <div className="demo-showcase-tabs" role="tablist" aria-label="Demo section">
        <button
          role="tab"
          aria-selected={activeTab === "construction"}
          className={`demo-tab${activeTab === "construction" ? " demo-tab-active" : ""}`}
          onClick={() => setActiveTab("construction")}
          type="button"
        >
          Construction
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "maco"}
          className={`demo-tab${activeTab === "maco" ? " demo-tab-active" : ""}`}
          onClick={() => setActiveTab("maco")}
          type="button"
        >
          MACO
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "interactive"}
          className={`demo-tab${activeTab === "interactive" ? " demo-tab-active" : ""}`}
          onClick={() => setActiveTab("interactive")}
          type="button"
        >
          Interactive
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "scheduler"}
          className={`demo-tab${activeTab === "scheduler" ? " demo-tab-active" : ""}`}
          onClick={() => setActiveTab("scheduler")}
          type="button"
        >
          Scheduler
        </button>
      </div>

      {isDeckTab && (
        <div className="demo-showcase-layout">
          <section className="command-panel demo-presentation-panel" aria-labelledby="demo-presentation-title">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Presentation</span>
                <h2 id="demo-presentation-title">{deckTitle}</h2>
              </div>
              <span className="badge">{deckPdfPath}</span>
            </div>
            <DemoDeckViewer
              key={activeTab}
              slidePath={slidePath}
              totalPages={totalPages}
              altPrefix={deckTitle}
            />
          </section>

          <section className="command-panel" aria-labelledby="platform-links-title">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Platform</span>
                <h2 id="platform-links-title">{platformLabel}</h2>
              </div>
              <span className="badge">{links.length} links</span>
            </div>

            <div className="demo-link-grid">
              {links.map((link) => {
                const Icon = link.icon;
                return (
                  <a className="demo-link-card" href={link.href} target="_blank" rel="noreferrer" key={link.href}>
                    <span className="demo-link-icon">
                      <Icon size={19} />
                    </span>
                    <span className="demo-link-meta">
                      <strong>{link.label}</strong>
                      <span>{link.description}</span>
                    </span>
                    <ExternalLink size={16} />
                  </a>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {activeTab === "interactive" && (
        <div className="demo-showcase-layout">
          <section className="command-panel demo-presentation-panel" aria-labelledby="interactive-demo-title">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Interactive</span>
                <h2 id="interactive-demo-title">{activeInteractiveDemo.label}</h2>
              </div>
              <span className="badge">{activeInteractiveDemo.href}</span>
            </div>
            <InteractiveDemoViewer src={activeInteractiveDemo.href} title={activeInteractiveDemo.label} />
          </section>

          <section className="command-panel" aria-labelledby="interactive-demo-links-title">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Demos</span>
                <h2 id="interactive-demo-links-title">Clickable product demos</h2>
              </div>
              <span className="badge">{interactiveDemos.length} demos</span>
            </div>

            <div className="demo-link-grid">
              {interactiveDemos.map((demo) => {
                const Icon = interactiveDemoIcons[demo.key] ?? MonitorPlay;
                const isActive = demo.key === activeInteractiveDemo.key;
                return (
                  <button
                    className={`demo-link-card demo-link-button${isActive ? " demo-link-card-active" : ""}`}
                    onClick={() => setActiveInteractiveKey(demo.key)}
                    type="button"
                    aria-pressed={isActive}
                    key={demo.key}
                  >
                    <span className="demo-link-icon">
                      <Icon size={19} />
                    </span>
                    <span className="demo-link-meta">
                      <strong>{demo.label}</strong>
                      <span>{demo.description}</span>
                    </span>
                    <MonitorPlay size={16} />
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {activeTab === "scheduler" && (
        <div className="demo-scheduler-tab">
          <SalesMeetingInvitePanel defaultTitle="SafetyDocs360 demo presentation" />
        </div>
      )}
    </div>
  );
}
