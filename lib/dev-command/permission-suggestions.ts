export interface SuggestedPermissions {
  database_changes_allowed: boolean;
  file_changes_allowed: boolean;
  github_branch_allowed: boolean;
  deployment_allowed: boolean;
}

/**
 * Heuristic used to pre-fill the new-task permission checkboxes. This never
 * grants anything on its own — it only suggests what a human should consider
 * enabling based on the task description and risk level.
 */
export function suggestPermissions(input: { description: string; riskLevel: string }): SuggestedPermissions {
  const text = input.description.toLowerCase();

  const mentionsDatabase = /\b(table|migration|schema|rls|column|database|supabase)\b/.test(text);
  const mentionsFile = /\b(component|page|route|file|form|ui|screen)\b/.test(text);
  const mentionsGithub = /\b(branch|pull request|pr|github|merge)\b/.test(text);
  const mentionsDeploy = /\b(deploy|release|production|ship|launch)\b/.test(text);

  const highRisk = input.riskLevel === "high" || input.riskLevel === "critical";

  return {
    database_changes_allowed: mentionsDatabase,
    file_changes_allowed: mentionsFile,
    github_branch_allowed: mentionsGithub || (highRisk && (mentionsDatabase || mentionsFile)),
    deployment_allowed: mentionsDeploy,
  };
}
