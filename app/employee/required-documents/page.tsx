import { CheckCircle2 } from "lucide-react";
import { requiredDocuments } from "@/lib/company-data";

export default function RequiredDocumentsPage() {
  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Required Document Checklist</div>
          <h1>Master document register</h1>
          <p>Required company, legal, product, compliance, finance, sales, and technology documents.</p>
        </div>
      </div>

      <div className="portal-grid">
        {requiredDocuments.map((group) => {
          const Icon = group.icon;
          return (
            <section className="doc-card" key={group.section}>
              <Icon color="#c9932b" size={26} />
              <h3>{group.section}</h3>
              <div className="checklist-list" style={{ marginTop: 14 }}>
                {group.items.map((item) => (
                  <div key={item} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <CheckCircle2 color="#c9932b" size={18} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
