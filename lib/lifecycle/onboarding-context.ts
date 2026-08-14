import "server-only";

// Step 11 — what happens to a deal once it is won.
//
// The lifecycle stops here on purpose. Onboarding a client is already a
// workflow of its own: company_clients walks the twelve-stage board, and
// client_onboarding_items is the checklist the case view at
// /employee/clients/[id]/workflow runs against, gate by gate. Step 11 is the
// HANDOFF between the two — it shows whether the company record exists, where
// it has got to, and what is still outstanding, and then sends the operator to
// the screen that actually does the work.
//
// Rebuilding the checklist here would give onboarding two front doors with two
// sets of gates, and the gates would disagree within a week.

import { lifecycleStages } from "@/lib/company-data";
import { isMissingSchemaRelationError } from "@/lib/supabase/errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

const itemLimit = 200;
const invoiceLimit = 20;

export interface OnboardingClient {
  id: string;
  name: string;
  lifecycle_stage: string;
  status: string;
  owner: string | null;
}

export interface OnboardingItem {
  id: string;
  title: string;
  section: string;
  lifecycle_stage: string;
  status: string;
  owner: string | null;
  due_date: string | null;
  completed: boolean;
}

export interface OnboardingInvoice {
  id: string;
  invoice_number: string;
  status: string;
  kind: string;
  total: number;
  currency: string;
  issue_date: string | null;
  due_date: string | null;
}

export interface OnboardingContext {
  client: OnboardingClient | null;
  items: OnboardingItem[];
  invoices: OnboardingInvoice[];
}

export const emptyOnboardingContext: OnboardingContext = { client: null, items: [], invoices: [] };

/** Reads one list, normalising a missing relation into an empty result. */
async function readList<T>(query: unknown): Promise<T[]> {
  const result = (await query) as { data?: unknown; error?: unknown };
  const error = (result?.error ?? null) as { code?: string; message?: string } | null;
  if (error) {
    if (isMissingSchemaRelationError(error)) return [];
    throw new Error(error.message ?? "Could not read the onboarding context.");
  }
  return Array.isArray(result?.data) ? (result.data as T[]) : [];
}

/**
 * Loads the handoff state for a won deal.
 *
 * Returns the empty context for a deal with no company attached, which is the
 * honest state: nothing can be onboarded until there is a company record to
 * onboard.
 */
export async function loadOnboardingContext(
  supabase: LooseClient,
  clientId: string | null,
): Promise<OnboardingContext> {
  if (!clientId) return emptyOnboardingContext;

  const [clientResult, items, invoices] = await Promise.all([
    supabase
      .from("company_clients")
      .select("id, name, lifecycle_stage, status, owner")
      .eq("id", clientId)
      .maybeSingle(),
    readList<OnboardingItem>(
      supabase
        .from("client_onboarding_items")
        .select("id, title, section, lifecycle_stage, status, owner, due_date, completed")
        .eq("client_id", clientId)
        .order("sort_order", { ascending: true })
        .limit(itemLimit),
    ),
    readList<OnboardingInvoice>(
      supabase
        .from("client_invoices")
        .select("id, invoice_number, status, kind, total, currency, issue_date, due_date")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(invoiceLimit),
    ),
  ]);

  return {
    client: (clientResult?.data ?? null) as OnboardingClient | null,
    items,
    invoices,
  };
}

/* -------------------------------------------------------------------------- */
/* Derived state                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The stages that come after a deal is won.
 *
 * Derived from lifecycleStages rather than listed, so inserting another stage
 * into the journey — as "Invoicing" was — cannot leave this behind. Everything
 * from Invoicing onwards is post-win work; anything earlier belongs to the deal
 * the lifecycle has just finished.
 */
export const postWinStages: readonly string[] = lifecycleStages.slice(
  (lifecycleStages as readonly string[]).indexOf("Invoicing"),
);

/** Checklist items for the stages that come after the win. */
export function postWinItems(items: readonly OnboardingItem[]): OnboardingItem[] {
  const stages = new Set(postWinStages);
  return items.filter((item) => stages.has(item.lifecycle_stage));
}

export interface OnboardingProgress {
  done: number;
  total: number;
  /** Whole percent, 0 when there is nothing to do rather than NaN. */
  percent: number;
}

export function onboardingProgress(items: readonly OnboardingItem[]): OnboardingProgress {
  const total = items.length;
  const done = items.filter((item) => item.completed).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** Items still outstanding, soonest due first, undated last. */
export function outstandingItems(items: readonly OnboardingItem[]): OnboardingItem[] {
  return items
    .filter((item) => !item.completed)
    .slice()
    .sort((a, b) => {
      if (a.due_date === b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    });
}

/** Invoices that have actually been raised against the client. */
export function issuedInvoices(invoices: readonly OnboardingInvoice[]): OnboardingInvoice[] {
  return invoices.filter((invoice) => invoice.status === "issued" || invoice.status === "paid");
}

export interface HandoffState {
  /** A company record exists for this deal. */
  hasClient: boolean;
  /** The client has reached Invoicing or later on its own board. */
  handedOver: boolean;
  /** At least one invoice has been issued. */
  billed: boolean;
  /** The onboarding checklist is finished. */
  onboarded: boolean;
}

/**
 * What is done and what is not.
 *
 * Every field is read from the client's OWN records — the board stage it sits
 * on, its checklist, its invoices. Step 11 reports that state; it does not keep
 * a second copy of it that could drift.
 */
export function handoffState(context: OnboardingContext): HandoffState {
  const stages = new Set(postWinStages);
  const relevant = postWinItems(context.items);
  const progress = onboardingProgress(relevant);

  return {
    hasClient: context.client !== null,
    handedOver: context.client !== null && stages.has(context.client.lifecycle_stage),
    billed: issuedInvoices(context.invoices).length > 0,
    onboarded: progress.total > 0 && progress.done === progress.total,
  };
}
