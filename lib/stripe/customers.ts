import "server-only";

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// company_clients.stripe_customer_id was added by
// supabase/migrations/20260819100000_stripe_payments.sql and is not yet in
// lib/supabase/types.ts (that file is regenerated from the live project via
// `npm run types:generate` after a migration is applied there — see the
// generation-lag note on client_invoices in app/employee/invoices/actions.ts's
// sibling modules). Read through an untyped handle for this one column rather
// than hand-editing the generated file, matching the LooseClient pattern
// lib/proposals/docusign.ts already uses for the same reason.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

/**
 * Resolves the Stripe Customer id for a client, creating and persisting one on
 * company_clients.stripe_customer_id if this is the first payment for them.
 *
 * Runs through the ADMIN client, not the caller's session client: writing
 * company_clients.stripe_customer_id is not something the per-employee RLS
 * surface needs to allow (no policy grants it), and this write is triggered by
 * a payment attempt an employee is already authorised to start, not a direct
 * edit of the client record.
 */
export async function getOrCreateStripeCustomerId(
  stripe: Stripe,
  clientId: string,
  clientEmail: string | null,
): Promise<string> {
  const admin: LooseClient | null = createAdminClient();
  if (!admin) {
    throw new Error("Supabase admin client is not configured (SUPABASE_SERVICE_ROLE_KEY missing).");
  }

  const { data: client, error } = await admin
    .from("company_clients")
    .select("id, name, stripe_customer_id")
    .eq("id", clientId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not read client ${clientId} for Stripe customer lookup: ${error.message}`);
  }
  if (!client) {
    throw new Error(`Client ${clientId} was not found.`);
  }

  const existing = (client as { stripe_customer_id?: string | null }).stripe_customer_id;
  if (existing) return existing;

  const clientName = (client as { name?: string | null }).name ?? undefined;
  const customer = await stripe.customers.create({
    email: clientEmail ?? undefined,
    name: clientName,
    metadata: { client_id: clientId },
  });

  const { error: updateError } = await admin
    .from("company_clients")
    .update({ stripe_customer_id: customer.id })
    .eq("id", clientId);

  if (updateError) {
    // The customer exists at Stripe either way; failing to cache the id just
    // means the next payment creates (and this time successfully saves)
    // another one. Not fatal to the payment in progress.
    console.error("stripe customers: could not save stripe_customer_id", updateError.message);
  }

  return customer.id;
}
