// The authorization gate every scheduled route shares.
//
// WHY THIS EXISTS
// The same two checks were copy-pasted into all three cron routes, and each one
// answered a failure with the same opaque `401 {"error":"Unauthorized"}`. That
// is correct for the caller — an attacker probing the endpoint should not learn
// which check rejected them — but it left us equally blind. On 2026-08-09 both
// scheduled runs returned 401 and there was no way, from outside, to tell
// whether the secret failed to match or the scheduler header was missing. Two
// very different faults, one indistinguishable symptom.
//
// So the response stays opaque and the *server log* carries the diagnosis.
//
// WHAT IS SAFE TO LOG
// Never the secret, and never the Authorization header. Presence booleans and
// the literal `x-vercel-cron` value (always "1" when genuine) are enough to tell
// the three failure modes apart, and none of them is a credential.

/** Which of the gate's checks rejected the request. */
export type CronAuthFailure =
  /** `CRON_SECRET` is not configured in this environment at all. */
  | "secret-unset"
  /** A secret is configured, but the Authorization header did not match it. */
  | "secret-mismatch"
  /** Running on Vercel, but the request did not come from Vercel's scheduler. */
  | "scheduler-header-missing";

export type CronAuthResult = { ok: true } | { ok: false; reason: CronAuthFailure };

/**
 * Verifies a scheduled request without deciding what to do about it, so the
 * result stays unit-testable and the routes stay uniform.
 */
export function verifyCronRequest(request: Request): CronAuthResult {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return { ok: false, reason: "secret-unset" };
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return { ok: false, reason: "secret-mismatch" };
  }

  // On Vercel, cron jobs include x-vercel-cron: 1. Requiring it in production
  // prevents replaying a leaked Bearer token from outside Vercel's scheduler.
  if (process.env.VERCEL === "1" && request.headers.get("x-vercel-cron") !== "1") {
    return { ok: false, reason: "scheduler-header-missing" };
  }

  return { ok: true };
}

/**
 * The 401 every cron route returns, with the reason recorded server-side.
 *
 * `route` is the path being guarded, so a single log line identifies both which
 * schedule failed and why — the next failed run explains itself.
 */
export function cronUnauthorized(route: string, reason: CronAuthFailure, request: Request): Response {
  console.error(
    `[cron] ${route} rejected: ${reason}` +
      ` | authorization=${request.headers.get("authorization") ? "present" : "absent"}` +
      ` | x-vercel-cron=${request.headers.get("x-vercel-cron") ?? "absent"}` +
      ` | secretConfigured=${Boolean(process.env.CRON_SECRET)}` +
      ` | onVercel=${process.env.VERCEL === "1"}`,
  );

  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Convenience wrapper: returns a 401 Response to hand straight back, or `null`
 * when the request is authorized and the handler should continue.
 */
export function rejectUnauthorizedCron(route: string, request: Request): Response | null {
  const result = verifyCronRequest(request);
  return result.ok ? null : cronUnauthorized(route, result.reason, request);
}
