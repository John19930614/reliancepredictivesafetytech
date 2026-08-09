import { rejectUnauthorizedCron } from "@/lib/cron/auth";
import { runDailyAiDigest } from "@/lib/notifications/digest";

export async function GET(request: Request) {
  const unauthorized = rejectUnauthorizedCron("/api/cron/daily-digest", request);
  if (unauthorized) return unauthorized;

  try {
    const results = await runDailyAiDigest();
    return Response.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daily digest failed.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
