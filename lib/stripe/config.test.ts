import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configuredSiteUrl, getStripeConfig, getStripeConfigStatus } from "./config";

const ENV_KEYS = [
  "STRIPE_ENABLED",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("getStripeConfigStatus", () => {
  it("is disabled and unconfigured with nothing set", () => {
    expect(getStripeConfigStatus()).toEqual({ enabled: false, configured: false, missing: expect.any(Array) });
  });

  it("lists every missing var when enabled but nothing else is set", () => {
    process.env.STRIPE_ENABLED = "true";
    const status = getStripeConfigStatus();
    expect(status.enabled).toBe(true);
    expect(status.configured).toBe(false);
    expect(status.missing).toEqual(
      expect.arrayContaining(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]),
    );
  });

  it("is configured once every var is set and enabled", () => {
    process.env.STRIPE_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_123";
    expect(getStripeConfigStatus()).toEqual({ enabled: true, configured: true, missing: [] });
  });

  it("is not configured when enabled=false even with every var present", () => {
    process.env.STRIPE_ENABLED = "false";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_123";
    const status = getStripeConfigStatus();
    expect(status.enabled).toBe(false);
    expect(status.configured).toBe(false);
  });
});

describe("getStripeConfig", () => {
  it("throws when Stripe is not enabled", () => {
    expect(() => getStripeConfig()).toThrow(/not enabled/i);
  });

  it("throws naming what is missing when enabled but incomplete", () => {
    process.env.STRIPE_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    expect(() => getStripeConfig()).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it("returns the resolved config when fully configured", () => {
    process.env.STRIPE_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_123";
    expect(getStripeConfig()).toEqual({
      enabled: true,
      secretKey: "sk_test_123",
      webhookSecret: "whsec_123",
      publishableKey: "pk_test_123",
    });
  });
});

describe("configuredSiteUrl", () => {
  it("returns null when unset", () => {
    expect(configuredSiteUrl()).toBeNull();
  });

  it("trims a trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com/";
    expect(configuredSiteUrl()).toBe("https://example.com");
  });
});
