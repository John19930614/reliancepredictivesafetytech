import { ProgramResearchAssistant } from "@/components/legal-register/ProgramResearchAssistant";
import { getLegalAccess } from "@/lib/legal/access";

export default async function ProgramAssistantPage() {
  const { isAdmin } = await getLegalAccess();

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Legal Register</div>
          <h1>Program Research Assistant</h1>
          <p>Pick a safety program and have the AI research its applicable laws, written programs, inspections, training, permits, records, and recommended modules.</p>
        </div>
      </div>
      {isAdmin ? (
        <ProgramResearchAssistant />
      ) : (
        <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--portal-muted)", background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10 }}>
          Running AI research requires an admin role.
        </div>
      )}
    </>
  );
}
