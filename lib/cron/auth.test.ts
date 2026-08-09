import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cronUnauthorized, rejectUnauthorizedCron, verifyCronRequest } from "./auth";

const CRON_SECRET = "test-cron-secret";
const ROUTE = "/api/cron/example";

function request(headers: Record<string, string> = {}) {
  return new Request("https://example.com/api/cron/example", { headers });
}

function authorized(extra: Record<string, string> = {}) {
  return request({ authorization: `Bearer ${CRON_SECRET}`, ...extra });
}

const originalSecret = process.env.CRON_SECRET;
const originalVercel = process.env.VERCEL;

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  delete process.env.VERCEL;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalSecret;
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
  vi.restoreAllMocks();
});

// ===========================================================================
// The gate itself
// ===========================================================================

describe("verifyCronRequest", () => {
  it("accepts a correctly signed request off Vercel", () => {
    expect(verifyCronRequest(authorized())).toEqual({ ok: true });
  });

  it("accepts a correctly signed request from Vercel's scheduler", () => {
    process.env.VERCEL = "1";
    expect(verifyCronRequest(authorized({ "x-vercel-cron": "1" }))).toEqual({ ok: true });
  });

  it("distinguishes an unset secret from a mismatched one", () => {
    delete process.env.CRON_SECRET;
    // Even a request that would otherwise match is refused, and the reason says
    // the environment is misconfigured rather than blaming the caller.
    expect(verifyCronRequest(authorized())).toEqual({ ok: false, reason: "secret-unset" });
  });

  it("reports a mismatch for a wrong secret, a bare token, and no header at all", () => {
    const cases: Record<string, string>[] = [
      { authorization: "Bearer nope" },
      { authorization: CRON_SECRET },
      {},
    ];

    for (const headers of cases) {
      expect(verifyCronRequest(request(headers))).toEqual({ ok: false, reason: "secret-mismatch" });
    }
  });

  it("reports the scheduler header separately, so a replayed token is not mistaken for a bad secret", () => {
    process.env.VERCEL = "1";
    expect(verifyCronRequest(authorized())).toEqual({ ok: false, reason: "scheduler-header-missing" });
    expect(verifyCronRequest(authorized({ "x-vercel-cron": "0" }))).toEqual({
      ok: false,
      reason: "scheduler-header-missing",
    });
  });

  it("does not require the scheduler header off Vercel, so local runs work", () => {
    expect(verifyCronRequest(authorized())).toEqual({ ok: true });
  });
});

// ===========================================================================
// The response, and what it is allowed to reveal
// ===========================================================================

describe("cronUnauthorized", () => {
  it("stays opaque to the caller — the body never names the failing check", async () => {
    const response = cronUnauthorized(ROUTE, "secret-mismatch", request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("records the failing check and the header shape server-side", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    cronUnauthorized(ROUTE, "scheduler-header-missing", authorized());

    const logged = String(spy.mock.calls[0]?.[0]);
    expect(logged).toContain(ROUTE);
    expect(logged).toContain("scheduler-header-missing");
    expect(logged).toContain("authorization=present");
    expect(logged).toContain("x-vercel-cron=absent");
  });

  it("never writes the secret or the Authorization value into the log", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    cronUnauthorized(ROUTE, "secret-mismatch", authorized());

    const logged = String(spy.mock.calls[0]?.[0]);
    expect(logged).not.toContain(CRON_SECRET);
    expect(logged).not.toContain("Bearer");
  });
});

describe("rejectUnauthorizedCron", () => {
  it("returns null when the request is authorized, so the handler continues", () => {
    expect(rejectUnauthorizedCron(ROUTE, authorized())).toBeNull();
  });

  it("returns a 401 Response when the request is not authorized", async () => {
    const response = rejectUnauthorizedCron(ROUTE, request());

    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ error: "Unauthorized" });
  });
});
