import "server-only";

// Gathers everything the stage gates need to judge a client, in one place.
//
// The case view and the advance action both call this, so the button the
// operator sees and the check the write performs are computed from the same
// read. A gate evaluated from two different fact-gathering routines would drift
// the moment one of them learned about a new table.
//
// Every query is bounded and tolerant of a missing relation: client_invoices
// ships behind a migration that has to be rehearsed on staging first, so a
// deploy can legitimately land ahead of it. In that window the workflow view
// should render with an empty invoice list, not throw.

import { isMissingSchemaRelationError } from "@/lib/supabase/errors";
import type {
  ChecklistFact,
  ClientWorkflowFacts,
  DocumentRequirementFact,
  InvoiceFact,
  ProposalFact,
} from "@/lib/pipeline/gates";

/** Same convention as the rest of the repo's cross-table readers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

/** Bounds, so a pathological account cannot turn this into an unbounded read. */
const checklistLimit = 200;
const proposalLimit = 100;
const invoiceLimit = 100;
const documentLimit = 200;
const requirementLimit = 200;

export interface ClientWorkflowRecord {
  id: string;
  name: string;
  lifecycle_stage: string;
  status: string;
  owner: string | null;
  stage_changed_at: string | null;
  company_type: string | null;
  updated_at: string | null;
}

export interface LoadedWorkflowFacts {
  facts: ClientWorkflowFacts;
  /** Invoices in full, for the billing panel — the gate only needs statuses. */
  invoices: WorkflowInvoice[];
  /** True when client_invoices is not in the schema cache yet. */
  invoicesUnavailable: boolean;
}

export interface WorkflowInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  currency: string;
  issue_date: string | null;
  due_date: string | null;
  proposal_id: string | null;
  created_at: string;
  /**
   * The moment the invoice was issued to the client, and who raised it — the
   * two columns lib/invoices/deletion.ts decides on. Selected here so the
   * billing panel can tell, without a second round trip, whether an invoice is
   * a draft nobody has seen or a document a client is holding.
   */
  issued_at: string | null;
  created_by: string | null;
}

/** Reads one list and normalises a missing-relation error into an empty result. */
async function readList<T>(query: unknown): Promise<{ rows: T[]; missing: boolean }> {
  const result = (await query) as { data?: unknown; error?: unknown };
  const error = (result?.error ?? null) as { code?: string; message?: string } | null;
  if (error) {
    if (isMissingSchemaRelationError(error)) return { rows: [], missing: true };
    throw new Error(error.message ?? "Could not read the client workflow.");
  }
  return { rows: Array.isArray(result?.data) ? (result.data as T[]) : [], missing: false };
}

/**
 * Decides whether a required document has actually been filed.
 *
 * Mirrors findClientDocument() in ClientDetailManager: an explicit
 * requirement_id wins, otherwise the (stage, category, title) triple matches
 * case-insensitively on title. Kept identical on purpose — if this were
 * stricter, the workflow would block on a document the client record shows as
 * present, and nobody would be able to tell which surface was lying.
 */
function isRequirementSatisfied(
  requirement: { id: string; title: string; category: string; lifecycle_stage: string },
  documents: Array<{
    requirement_id: string | null;
    title: string | null;
    category: string | null;
    lifecycle_stage: string | null;
  }>,
): boolean {
  return documents.some(
    (document) =>
      document.requirement_id === requirement.id ||
      (document.lifecycle_stage === requirement.lifecycle_stage &&
        document.category === requirement.category &&
        (document.title ?? "").toLowerCase() === requirement.title.toLowerCase()),
  );
}

/**
 * Loads the facts for one client.
 *
 * `client` is passed in rather than re-read, because every caller has already
 * fetched it (the page to render the header, the action to guard the write) and
 * a second read could see a different stage than the one being acted on.
 */
export async function loadClientWorkflowFacts(
  supabase: LooseClient,
  client: Pick<ClientWorkflowRecord, "id" | "lifecycle_stage" | "owner">,
): Promise<LoadedWorkflowFacts> {
  const [checklist, proposals, invoices, requirements, documents, contacts] = await Promise.all([
    readList<{ title: string; lifecycle_stage: string; completed: boolean | null }>(
      supabase
        .from("client_onboarding_items")
        .select("title, lifecycle_stage, completed")
        .eq("client_id", client.id)
        .limit(checklistLimit),
    ),
    readList<{ status: string | null }>(
      supabase.from("client_proposals").select("status").eq("client_id", client.id).limit(proposalLimit),
    ),
    readList<WorkflowInvoice>(
      supabase
        .from("client_invoices")
        .select(
          "id, invoice_number, status, total, currency, issue_date, due_date, proposal_id, created_at, issued_at, created_by",
        )
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(invoiceLimit),
    ),
    readList<{ id: string; title: string; category: string; lifecycle_stage: string; required_for_active: boolean | null }>(
      supabase
        .from("company_document_requirements")
        .select("id, title, category, lifecycle_stage, required_for_active")
        // Ordered so the bound below truncates deterministically rather than
        // dropping an arbitrary requirement — an omitted one reads as satisfied.
        .order("lifecycle_stage", { ascending: true })
        .order("title", { ascending: true })
        .limit(requirementLimit),
    ),
    readList<{ requirement_id: string | null; title: string | null; category: string | null; lifecycle_stage: string | null }>(
      supabase
        .from("company_documents")
        .select("requirement_id, title, category, lifecycle_stage")
        .eq("client_id", client.id)
        .limit(documentLimit),
    ),
    readList<{ is_primary: boolean | null }>(
      supabase.from("company_client_contacts").select("is_primary").eq("client_id", client.id).limit(50),
    ),
  ]);

  const checklistFacts: ChecklistFact[] = checklist.rows.map((row) => ({
    title: row.title,
    lifecycle_stage: row.lifecycle_stage,
    completed: Boolean(row.completed),
  }));

  const proposalFacts: ProposalFact[] = proposals.rows.map((row) => ({ status: row.status ?? "" }));

  const invoiceFacts: InvoiceFact[] = invoices.rows.map((row) => ({ status: row.status }));

  const documentFacts: DocumentRequirementFact[] = requirements.rows.map((requirement) => ({
    title: requirement.title,
    required_for_active: Boolean(requirement.required_for_active),
    satisfied: isRequirementSatisfied(requirement, documents.rows),
  }));

  return {
    facts: {
      stage: client.lifecycle_stage,
      owner: client.owner,
      checklist: checklistFacts,
      proposals: proposalFacts,
      invoices: invoiceFacts,
      requiredDocuments: documentFacts,
      // The seeds define ~25 requirements, so an empty list means the read
      // failed or the seed never ran — not that nothing is required.
      requiredDocumentsKnown: !requirements.missing && requirements.rows.length > 0,
      hasPrimaryContact: contacts.rows.some((contact) => Boolean(contact.is_primary)),
    },
    invoices: invoices.rows,
    invoicesUnavailable: invoices.missing,
  };
}
