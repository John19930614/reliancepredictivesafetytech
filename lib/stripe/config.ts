import "server-only";

// Config shape mirrors lib/docusign/config.ts exactly: a status check that
// never throws (for "is this feature usable right now" reads, e.g. a 503 from
// a route), and a strict getter that throws a clear error (for code paths that
// have already confirmed configured === true and want the resolved values
// without re-checking).

export interface StripeConfig {
  enabled: boolean;
  secretKey: string;
  webhookSecret: string;
  publishableKey: string;
}

export interface StripeConfigStatus {
  enabled: boolean;
  configured: boolean;
  missing: string[];
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function getStripeConfigStatus(): StripeConfigStatus {
  const enabled = clean(process.env.STRIPE_ENABLED).toLowerCase() === "true";
  const missing = [
    ["STRIPE_SECRET_KEY", clean(process.env.STRIPE_SECRET_KEY)],
    ["STRIPE_WEBHOOK_SECRET", clean(process.env.STRIPE_WEBHOOK_SECRET)],
    ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", clean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return { enabled, configured: enabled && missing.length === 0, missing };
}

export function getStripeConfig(): StripeConfig {
  const status = getStripeConfigStatus();
  if (!status.enabled) {
    throw new Error("Stripe is not enabled for this environment.");
  }
  if (!status.configured) {
    throw new Error(`Stripe is missing required settings: ${status.missing.join(", ")}.`);
  }

  return {
    enabled: status.enabled,
    secretKey: clean(process.env.STRIPE_SECRET_KEY),
    webhookSecret: clean(process.env.STRIPE_WEBHOOK_SECRET),
    publishableKey: clean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
  };
}

/** Same helper as lib/docusign/config.ts — trimmed, trailing-slash-free site origin, or null if unset. */
export function configuredSiteUrl(): string | null {
  const siteUrl = clean(process.env.NEXT_PUBLIC_SITE_URL);
  return siteUrl ? siteUrl.replace(/\/+$/, "") : null;
}
