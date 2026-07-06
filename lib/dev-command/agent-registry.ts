export type AgentGroup =
  | "Team Lead"
  | "Planning & Build"
  | "Quality, Security, Performance"
  | "Experience & Clarity"
  | "Ship & Support";

export interface AgentProfile {
  key: string;
  name: string;
  group: AgentGroup;
  description: string;
  forbiddenActions: string[];
}

/**
 * Static mirror of the `dev_agents` seed data (migration 20260623020000) so
 * roster copy can render without a DB round-trip. Keep in sync with the seed.
 */
export const AGENT_REGISTRY: AgentProfile[] = [
  { key: "dev-manager", name: "Dev Manager", group: "Team Lead", description: "Orchestrates the workflow, assigns work to the right specialist agents, and decides when a stage needs human approval.", forbiddenActions: ["Cannot apply changes", "Cannot skip approval gates"] },

  { key: "product-requirements", name: "Product Requirements", group: "Planning & Build", description: "Turns a rough idea into clear requirements and acceptance criteria.", forbiddenActions: ["Cannot write code", "Cannot apply changes"] },
  { key: "platform-architect", name: "Platform Architect", group: "Planning & Build", description: "Recommends technical design, impacted files, and risk areas.", forbiddenActions: ["Cannot write code", "Cannot apply changes"] },
  { key: "ui-ux", name: "UI/UX", group: "Planning & Build", description: "Proposes UI layouts, flows, and component structure.", forbiddenActions: ["Cannot write code", "Cannot apply changes"] },
  { key: "frontend", name: "Frontend", group: "Planning & Build", description: "Generates React/Next.js/Tailwind code drafts (never applied automatically).", forbiddenActions: ["Cannot apply changes", "Cannot push to GitHub"] },
  { key: "backend-api", name: "Backend/API", group: "Planning & Build", description: "Generates server-side code drafts (routes, server actions, lib functions).", forbiddenActions: ["Cannot apply changes", "Cannot push to GitHub"] },

  { key: "database-supabase", name: "Database/Supabase", group: "Quality, Security, Performance", description: "Drafts SQL migrations — never runs them.", forbiddenActions: ["Cannot run migrations", "Cannot apply changes"] },
  { key: "qa-test", name: "QA/Test", group: "Quality, Security, Performance", description: "Writes test plans and records test results.", forbiddenActions: ["Cannot apply changes"] },
  { key: "security-permissions", name: "Security/Permissions", group: "Quality, Security, Performance", description: "Reviews for auth, RLS, secrets, and injection risks.", forbiddenActions: ["Cannot apply changes", "Cannot waive its own findings"] },

  { key: "human-experience", name: "Human Experience", group: "Experience & Clarity", description: "Reviews the change from a real user's perspective.", forbiddenActions: ["Cannot apply changes"] },
  { key: "plain-english", name: "Plain English", group: "Experience & Clarity", description: "Rewrites copy into plain, non-technical language.", forbiddenActions: ["Cannot apply changes"] },
  { key: "workflow-simplification", name: "Workflow Simplification", group: "Experience & Clarity", description: "Finds ways to reduce steps in a workflow.", forbiddenActions: ["Cannot apply changes"] },
  { key: "onboarding", name: "Onboarding", group: "Experience & Clarity", description: "Designs onboarding, empty states, and first-run guidance.", forbiddenActions: ["Cannot apply changes"] },
  { key: "accessibility", name: "Accessibility", group: "Experience & Clarity", description: "Reviews for WCAG/accessibility compliance.", forbiddenActions: ["Cannot apply changes"] },

  { key: "devops-release", name: "DevOps/Release", group: "Ship & Support", description: "Prepares branch/PR/preview/release plans — everything gated by approval.", forbiddenActions: ["Cannot push to GitHub", "Cannot deploy", "Cannot apply changes"] },
  { key: "documentation", name: "Documentation", group: "Ship & Support", description: "Drafts documentation and SOP updates.", forbiddenActions: ["Cannot apply changes"] },
  { key: "ai-integration", name: "AI Integration", group: "Ship & Support", description: "Designs how a feature uses the AI engine/gateway.", forbiddenActions: ["Cannot apply changes"] },
  { key: "admin-support", name: "Admin Support", group: "Ship & Support", description: "Helps operators use the Command Center itself.", forbiddenActions: ["Cannot apply changes"] },
  { key: "performance", name: "Performance", group: "Ship & Support", description: "Reviews for query, bundle size, and render-cost risk.", forbiddenActions: ["Cannot apply changes"] },
];

export function getAgentProfile(key: string) {
  return AGENT_REGISTRY.find((agent) => agent.key === key) ?? null;
}
