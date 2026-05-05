import Link from "next/link";
import { BookOpenCheck, FileText, FolderLock, ListChecks, ShieldCheck, UploadCloud } from "lucide-react";
import { requiredDocuments, startupChecklistSeed } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";

const cards = [
  {
    title: "Business Startup Checklist",
    description: "Active launch plan organized by formation, legal, product, data, finance, sales, security, and launch gates.",
    href: "/employee/checklist",
    icon: ListChecks,
  },
  {
    title: "Document Library",
    description: "Upload, classify, review, approve, revise, retire, and link company startup and product documents.",
    href: "/employee/documents",
    icon: UploadCloud,
  },
  {
    title: "Launch Gate Checklist",
    description: "Go/no-go readiness checks from the business launch booklet.",
    href: "/employee/launch-gate",
    icon: BookOpenCheck,
  },
  {
    title: "Required Legal Documents",
    description: "NDA, MSA, SOW, pilot agreement, terms, privacy, DPA, e-sign consent, AI disclaimer, and acceptable use.",
    href: "/employee/required-documents",
    icon: ShieldCheck,
  },
  {
    title: "Required Safety Product Documents",
    description: "CSEP demo, review checklist, SOR templates, scoring guides, incident intake, and corrective action trackers.",
    href: "/employee/required-documents",
    icon: FileText,
  },
  {
    title: "Required Sales/Marketing Documents",
    description: "Deck, flyer, demo script, proposal, buyer FAQ, website copy, email templates, and business card copy.",
    href: "/employee/required-documents",
    icon: FolderLock,
  },
  {
    title: "Required Technology/Security Documents",
    description: "Backup, access control, separation SOP, incident response, vendor register, retention, change log, and audit trail.",
    href: "/employee/required-documents",
    icon: ShieldCheck,
  },
];

export default async function EmployeeDashboardPage() {
  const supabase = await createClient();
  const [{ count: checklistCount }, { count: documentCount }] = supabase
    ? await Promise.all([
        supabase.from("company_checklist_items").select("*", { count: "exact", head: true }),
        supabase.from("company_documents").select("*", { count: "exact", head: true }),
      ])
    : [{ count: startupChecklistSeed.length }, { count: 0 }];

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Internal Employee Portal</div>
          <h1>Company launch dashboard</h1>
          <p>Startup readiness, document control, and launch gate tracking.</p>
        </div>
        <span className="badge">{supabase ? "Supabase connected" : "Supabase setup required"}</span>
      </div>

      <div className="portal-grid">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link className="portal-card" href={card.href} key={card.title}>
              <Icon color="#c9932b" size={26} />
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </Link>
          );
        })}
      </div>

      <div className="portal-grid" style={{ marginTop: 18 }}>
        <div className="portal-card">
          <h3>Checklist items</h3>
          <div className="metric">{checklistCount ?? startupChecklistSeed.length}</div>
        </div>
        <div className="portal-card">
          <h3>Uploaded documents</h3>
          <div className="metric">{documentCount ?? 0}</div>
        </div>
        <div className="portal-card">
          <h3>Required document groups</h3>
          <div className="metric">{requiredDocuments.length}</div>
        </div>
      </div>
    </>
  );
}
