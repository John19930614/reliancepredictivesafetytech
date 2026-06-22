import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  const checks: Array<{ name: string; status: "pass" | "warn" | "fail"; ms: number; detail?: string }> = [];

  // Database connectivity check
  try {
    const dbStart = Date.now();
    const supabase = await createClient();
    if (!supabase) {
      checks.push({ name: "database", status: "fail", ms: 0, detail: "Supabase client unavailable (missing env vars)" });
    } else {
    const { error } = await supabase.from("user_roles").select("user_id").limit(1);
    checks.push({
      name: "database",
      status: error ? "fail" : "pass",
      ms: Date.now() - dbStart,
      detail: error?.message,
    });
    }
  } catch (e) {
    checks.push({ name: "database", status: "fail", ms: Date.now() - start, detail: String(e) });
  }

  // Environment variable checks
  const requiredEnvVars = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  for (const envVar of requiredEnvVars) {
    checks.push({
      name: `env:${envVar}`,
      status: process.env[envVar] ? "pass" : "fail",
      ms: 0,
    });
  }

  // AI Gateway check
  checks.push({
    name: "env:AI_GATEWAY_API_KEY",
    status: process.env.AI_GATEWAY_API_KEY ? "pass" : "warn",
    ms: 0,
    detail: process.env.AI_GATEWAY_API_KEY ? undefined : "AI features will be unavailable",
  });

  const overallStatus = checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "warn")
    ? "warn"
    : "pass";

  return NextResponse.json(
    {
      status: overallStatus,
      version: process.env.npm_package_version ?? "unknown",
      timestamp: new Date().toISOString(),
      totalMs: Date.now() - start,
      checks,
    },
    { status: overallStatus === "fail" ? 503 : 200 }
  );
}
