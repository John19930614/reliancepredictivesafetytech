import { runDailyAiDigest } from "@/lib/notifications/digest";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // On Vercel, cron jobs include x-vercel-cron: 1. Requiring it in production
  // prevents replaying a leaked Bearer token from outside Vercel's scheduler.
  if (process.env.VERCEL === "1" && request.headers.get("x-vercel-cron") !== "1") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runDailyAiDigest();
    return Response.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daily digest failed.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
