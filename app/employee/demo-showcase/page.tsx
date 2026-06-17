"use client";

import { useState } from "react";
import {
  AlertCircle,
  BarChart3,
  BriefcaseBusiness,
  Calendar,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  FileText,
  FlaskConical,
  Gauge,
  GraduationCap,
  HardHat,
  Presentation,
  ShieldAlert,
  Siren,
  UserRound,
} from "lucide-react";
import { DemoDeckViewer } from "@/components/DemoDeckViewer";
import { SalesMeetingInvitePanel } from "@/components/SalesMeetingInvitePanel";

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

const biotechLinks = [
  {
    label: "Predictive Engine",
    href: "https://predictsafe-bio.vercel.app/predictive-engine",
    description: "AI risk forecasting and composite safety score.",
    icon: Gauge,
  },
  {
    label: "Risk Command Center",
    href: "https://predictsafe-bio.vercel.app/risk-command-center",
    description: "Live compliance score and escalation overview.",
    icon: ShieldAlert,
  },
  {
    label: "Compliance Calendar",
    href: "https://predictsafe-bio.vercel.app/compliance-calendar",
    description: "Scheduled audits, inspections, and compliance deadlines.",
    icon: Calendar,
  },
  {
    label: "Assessments",
    href: "https://predictsafe-bio.vercel.app/assessments",
    description: "Risk assessments and control verification workflows.",
    icon: ClipboardCheck,
  },
  {
    label: "Incidents",
    href: "https://predictsafe-bio.vercel.app/incidents",
    description: "Incident reporting, CAPAs, and trend tracking.",
    icon: AlertCircle,
  },
  {
    label: "Documents",
    href: "https://predictsafe-bio.vercel.app/documents",
    description: "SOPs, policies, and audit-ready document control.",
    icon: FileText,
  },
  {
    label: "Training Matrix",
    href: "https://predictsafe-bio.vercel.app/training-matrix",
    description: "Staff training status, completions, and gaps.",
    icon: GraduationCap,
  },
  {
    label: "Chemical Inventory",
    href: "https://predictsafe-bio.vercel.app/chemical-inventory",
    description: "Chemical inventory, SDS currency, and hazard class tracking.",
    icon: FlaskConical,
  },
  {
    label: "Emergency Response",
    href: "https://predictsafe-bio.vercel.app/emergency-response",
    description: "Drills, equipment checks, and emergency readiness.",
    icon: Siren,
  },
];

type DemoTab = "construction" | "biotech";

export default function DemoShowcasePage() {
  const [activeTab, setActiveTab] = useState<DemoTab>("construction");

  const isConstruction = activeTab === "construction";

  const links = isConstruction ? constructionLinks : biotechLinks;
  const deckTitle = isConstruction ? "Reliance demo deck" : "PredictSafeBIO demo deck";
  const deckPdfPath = isConstruction ? "/demo-deck.pdf" : "/bio-demo-deck.pdf";
  const slidePath = isConstruction ? "/demo-deck-slides" : "/bio-demo-deck-slides";
  const totalPages = isConstruction ? 29 : 23;
  const platformLabel = isConstruction ? "SafetyDocs360 demo links" : "PredictSafeBIO demo links";
  const eyebrowLabel = isConstruction ? "SafetyDocs360 Demo" : "PredictSafeBIO Demo";
  const meetingTitle = isConstruction ? "SafetyDocs360 demo presentation" : "PredictSafeBIO demo presentation";

  return (
    <div className="demo-showcase">
      <div className="portal-topline command-hero">
        <div>
          <div className="eyebrow">{eyebrowLabel}</div>
          <h1>Presentation and platform links</h1>
          <p>Use this page during sales calls to keep the deck and live platform pages in one protected workspace.</p>
        </div>
        <a className="button button-light" href={deckPdfPath} target="_blank" rel="noreferrer">
          Open Deck <ExternalLink size={17} />
        </a>
      </div>

      <div className="demo-showcase-tabs" role="tablist" aria-label="Sales deck selection">
        <button
          role="tab"
          aria-selected={isConstruction}
          className={`demo-tab${isConstruction ? " demo-tab-active" : ""}`}
          onClick={() => setActiveTab("construction")}
          type="button"
        >
          Construction
        </button>
        <button
          role="tab"
          aria-selected={!isConstruction}
          className={`demo-tab${!isConstruction ? " demo-tab-active" : ""}`}
          onClick={() => setActiveTab("biotech")}
          type="button"
        >
          BioTech
        </button>
      </div>

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

        <SalesMeetingInvitePanel compact defaultTitle={meetingTitle} />

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
    </div>
  );
}
