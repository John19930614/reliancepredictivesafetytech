import { ResearchSourcesManager, type Source } from "@/components/legal-register/ResearchSourcesManager";
import { PromptTemplateEditor, type PromptTemplate } from "@/components/legal-register/PromptTemplateEditor";
import { getLegalAccess } from "@/lib/legal/access";

export default async function SourcesPage() {
  const { supabase, isAdmin } = await getLegalAccess();

  let sources: Source[] = [];
  let templates: PromptTemplate[] = [];
  if (supabase) {
    const [sourcesRes, templatesRes] = await Promise.all([
      supabase.from("legal_register_sources").select("*").order("name", { ascending: true }),
      supabase.from("legal_prompt_templates").select("*").order("name", { ascending: true }),
    ]);
    sources = sourcesRes.data ?? [];
    templates = templatesRes.data ?? [];
  }

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Legal Register</div>
          <h1>Research Sources</h1>
          <p>Manage the source library the AI prioritizes — federal, state, local, and consensus standards — and edit the AI prompt templates used for research, gap analysis, and audits.</p>
        </div>
      </div>

      <ResearchSourcesManager sources={sources} isAdmin={isAdmin} />

      <h2 style={{ fontSize: "1rem", margin: "32px 0 12px" }}>AI Prompt Templates</h2>
      <PromptTemplateEditor templates={templates} isAdmin={isAdmin} />
    </>
  );
}
