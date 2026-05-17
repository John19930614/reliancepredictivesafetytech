import { BarChart3, BriefcaseBusiness, ExternalLink, FileCheck2, Gauge, HardHat, Presentation, UserRound } from "lucide-react";
import { DemoDeckViewer } from "@/components/DemoDeckViewer";

const safetyDocsLinks = [
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

export default function DemoShowcasePage() {
  return (
    <div className="demo-showcase">
      <div className="portal-topline command-hero">
        <div>
          <div className="eyebrow">SafetyDocs360 Demo</div>
          <h1>Presentation and platform links</h1>
          <p>Use this page during sales calls to keep the deck and live SafetyDocs360 pages in one protected workspace.</p>
        </div>
        <a className="button button-light" href="/demo-deck.pdf" target="_blank" rel="noreferrer">
          Open Deck <ExternalLink size={17} />
        </a>
      </div>

      <div className="demo-showcase-layout">
        <section className="command-panel demo-presentation-panel" aria-labelledby="demo-presentation-title">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Presentation</span>
              <h2 id="demo-presentation-title">Reliance demo deck</h2>
            </div>
            <span className="badge">/demo-deck.pdf</span>
          </div>
          <DemoDeckViewer />
        </section>

        <section className="command-panel" aria-labelledby="safetydocs-links-title">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Platform</span>
              <h2 id="safetydocs-links-title">SafetyDocs360 demo links</h2>
            </div>
            <span className="badge">{safetyDocsLinks.length} links</span>
          </div>

          <div className="demo-link-grid">
            {safetyDocsLinks.map((link) => {
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
