import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ConfirmType = "invite" | "recovery" | "magiclink" | "email";

const allowedTypes = new Set<ConfirmType>(["invite", "recovery", "magiclink", "email"]);

function isConfirmType(value: string): value is ConfirmType {
  return allowedTypes.has(value as ConfirmType);
}

function getSafeNext(value: string | null, type: ConfirmType) {
  const fallback = type === "recovery" ? "/auth/update-password" : "/employee";

  if (!value || value.startsWith("/employee-login")) {
    return fallback;
  }

  if (value.startsWith("/employee") || value.startsWith("/auth/update-password")) {
    return value;
  }

  return fallback;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const requestedType = requestUrl.searchParams.get("type") ?? "invite";

  if (!tokenHash || !isConfirmType(requestedType)) {
    redirect(`/employee-login?message=${encodeURIComponent("Invalid or expired employee access link.")}`);
  }

  const next = getSafeNext(requestUrl.searchParams.get("next"), requestedType);

  const supabase = await createClient();

  if (!supabase) {
    redirect("/employee-login?message=supabase-required");
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: requestedType,
  });

  if (error) {
    redirect(`/employee-login?message=${encodeURIComponent("Invalid or expired employee access link.")}`);
  }

  redirect(next);
}
