import { ShieldCheck } from "lucide-react";
import { launchGateItems } from "@/lib/company-data";

export default function LaunchGatePage() {
  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Final Launch Gate Checklist</div>
          <h1>Go / no-go launch gate</h1>
          <p>Use this before accepting a paying customer or launching a pilot with real data.</p>
        </div>
        <span className="badge">Must be yes</span>
      </div>

      <div className="table-card">
        <section className="checklist-section">
          <div className="checklist-list">
            {launchGateItems.map((item) => (
              <article className="checklist-row" key={item}>
                <input aria-label={`Launch gate item: ${item}`} type="checkbox" />
                <div>
                  <h3>{item}</h3>
                  <p>Owner: John / Steven - Cost / notes: Must be yes</p>
                </div>
                <ShieldCheck color="#c9932b" size={22} />
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
