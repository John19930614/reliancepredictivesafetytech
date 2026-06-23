import { NewResearchRunForm } from "@/components/legal-register/NewResearchRunForm";
import { getLegalAccess } from "@/lib/legal/access";

export default async function NewResearchPage() {
  const { isAdmin } = await getLegalAccess();

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Legal Register</div>
          <h1>New Research Run</h1>
          <p>
            Enter an industry, program, jurisdiction, and scope. The AI will research applicable federal, state, and
            local requirements and return structured findings for your review.
          </p>
        </div>
      </div>

      {isAdmin ? (
        <NewResearchRunForm />
      ) : (
        <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--portal-muted)", background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 10 }}>
          Running AI research requires an admin role. You can view approved entries in the Register.
        </div>
      )}
    </>
  );
}
