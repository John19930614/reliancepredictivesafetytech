import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getProposalAccess } from "@/lib/proposals/access";
import { templateLeakFieldIds } from "@/lib/proposals/templates";
import { ProposalTemplateManager, type ManagedTemplate } from "./TemplateManager";

/**
 * MODULE SPECIFICATION CONTRACT (CLAUDE.md)
 *
 * MODULE_ID: client_proposal_templates
 * PURPOSE: Save a proven proposal's generator state as a reusable, client-scrubbed
 *          starting point so a seller never retypes the same scope.
 * ROLES_ALLOWED: platform_admin, super_admin, company_admin, admin,
 *                internal_reviewer, marketing, employee  (= portalUserRoles;
 *                delete is restricted to portalAdminRoles)
 * GROUP: Commercial
 * PATH_PREFIX: /employee/proposals/templates
 * DATA_OBJECTS: client_proposal_templates (rw), client_proposals (r + w on
 *               create-from-template), client_proposal_revisions (w),
 *               company_clients (r)
 * WORKFLOW_STATES: active -> archived (reversible); hard delete is admin-only.
 * ACCEPTANCE_CRITERIA:
 *   - [x] A template stores a complete, valid GeneratorState in form_data.
 *   - [x] Applying a template never carries the captured client's company,
 *         contact, title, email or address into another client's proposal.
 *   - [x] proposalNo / proposalDate / preparedBy do not carry across.
 *   - [x] Any active portal employee may read/create/update; only admins delete.
 *   - [x] Archived templates are hidden from the "start from template" picker.
 *   - [x] Every update/delete asks for the affected ids back, so a zero-row
 *         write surfaces as a failure instead of a silent success.
 *
 * Access is granted by the EXISTING `client_proposals` module catalog entry,
 * whose `/employee/proposals` path prefix already covers this route. That is
 * intentional: a separate module key would have to be granted per user, so
 * everyone who can reach Proposals today would lose this page.
 */

/** Bounds the capture picker; the newest proposals are the ones worth templating. */
const capturePickerLimit = 100;
const templateListLimit = 200;

interface ProposalOption {
  id: string;
  title: string;
  form_data: unknown;
}

export default async function ProposalTemplatesPage() {
  const { supabase, canRead, canManage, isAdmin } = await getProposalAccess();
  if (!supabase || !canRead) notFound();

  const [{ data: templateRows }, { data: proposalRows }] = await Promise.all([
    supabase
      .from("client_proposal_templates")
      .select("id, name, description, is_archived, created_at, updated_at, form_data")
      .order("is_archived")
      .order("name")
      .limit(templateListLimit),
    supabase
      .from("client_proposals")
      .select("id, title, form_data")
      .order("updated_at", { ascending: false })
      .limit(capturePickerLimit),
  ]);

  const templates: ManagedTemplate[] = ((templateRows ?? []) as Array<ManagedTemplate & { form_data: unknown }>).map(
    (row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      is_archived: row.is_archived,
      updated_at: row.updated_at,
      // Surfaced so a template written by an older build (or straight at the
      // server action) is visible as a leak risk rather than silently applied.
      leakFieldIds: templateLeakFieldIds(row.form_data),
    }),
  );

  // Only proposals with usable saved state can be captured — the action refuses
  // the rest, so do not offer them.
  const capturable = ((proposalRows ?? []) as ProposalOption[])
    .filter((row) => row.form_data && typeof row.form_data === "object")
    .map((row) => ({ id: row.id, title: row.title }));

  const activeCount = templates.filter((t) => !t.is_archived).length;

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Proposals</div>
          <h1>Proposal templates</h1>
          <p>
            Save a proposal you are happy with as a reusable starting point. The company, contact, title, email and
            address of the proposal you captured it from are stripped out — a template only carries scope, pricing and
            terms.
          </p>
        </div>
        <span className="badge">{activeCount} active</span>
      </div>

      <p style={{ marginBottom: 16 }}>
        <Link className="button button-light" href="/employee/proposals">
          <ChevronLeft size={16} /> Back to proposals
        </Link>
      </p>

      <ProposalTemplateManager
        templates={templates}
        proposals={capturable}
        canManage={canManage}
        isAdmin={isAdmin}
      />
    </>
  );
}
