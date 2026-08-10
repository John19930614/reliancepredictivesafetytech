import "server-only";

export interface DocusignConfig {
  enabled: boolean;
  integrationKey: string;
  userId: string;
  accountId: string;
  privateKey: string;
  oauthBaseUrl: string;
  basePath: string;
  webhookSecret: string;
  defaultEmailSubject: string;
}

export interface DocusignConfigStatus {
  enabled: boolean;
  configured: boolean;
  missing: string[];
}

const defaults = Object.freeze({
  oauthBaseUrl: "https://account-d.docusign.com",
  basePath: "https://demo.docusign.net",
  defaultEmailSubject: "Please review and sign your Reliance proposal",
});

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function cleanPrivateKey(value: string | undefined): string {
  return clean(value).replace(/\\n/g, "\n");
}

export function getDocusignConfigStatus(): DocusignConfigStatus {
  const enabled = clean(process.env.DOCUSIGN_ENABLED).toLowerCase() === "true";
  const missing = [
    ["DOCUSIGN_INTEGRATION_KEY", clean(process.env.DOCUSIGN_INTEGRATION_KEY)],
    ["DOCUSIGN_USER_ID", clean(process.env.DOCUSIGN_USER_ID)],
    ["DOCUSIGN_ACCOUNT_ID", clean(process.env.DOCUSIGN_ACCOUNT_ID)],
    ["DOCUSIGN_PRIVATE_KEY", clean(process.env.DOCUSIGN_PRIVATE_KEY)],
    ["DOCUSIGN_WEBHOOK_SECRET", clean(process.env.DOCUSIGN_WEBHOOK_SECRET)],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return { enabled, configured: enabled && missing.length === 0, missing };
}

export function getDocusignConfig(): DocusignConfig {
  const status = getDocusignConfigStatus();
  if (!status.enabled) {
    throw new Error("DocuSign is not enabled for this environment.");
  }
  if (!status.configured) {
    throw new Error(`DocuSign is missing required settings: ${status.missing.join(", ")}.`);
  }

  return {
    enabled: status.enabled,
    integrationKey: clean(process.env.DOCUSIGN_INTEGRATION_KEY),
    userId: clean(process.env.DOCUSIGN_USER_ID),
    accountId: clean(process.env.DOCUSIGN_ACCOUNT_ID),
    privateKey: cleanPrivateKey(process.env.DOCUSIGN_PRIVATE_KEY),
    oauthBaseUrl: clean(process.env.DOCUSIGN_OAUTH_BASE_URL) || defaults.oauthBaseUrl,
    basePath: clean(process.env.DOCUSIGN_BASE_PATH) || defaults.basePath,
    webhookSecret: clean(process.env.DOCUSIGN_WEBHOOK_SECRET),
    defaultEmailSubject: clean(process.env.DOCUSIGN_DEFAULT_EMAIL_SUBJECT) || defaults.defaultEmailSubject,
  };
}

export function configuredSiteUrl(): string | null {
  const siteUrl = clean(process.env.NEXT_PUBLIC_SITE_URL);
  return siteUrl ? siteUrl.replace(/\/+$/, "") : null;
}
