import { redirect } from "next/navigation";
import { getSafeCompanyAuthNext, type CompanyAuthConfirmType } from "@/lib/company-auth-links";
import { createClient } from "@/lib/supabase/server";

const allowedTypes = new Set<CompanyAuthConfirmType>(["invite", "recovery", "magiclink", "email"]);

function isConfirmType(value: string): value is CompanyAuthConfirmType {
  return allowedTypes.has(value as CompanyAuthConfirmType);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const requestedType = requestUrl.searchParams.get("type") ?? "invite";

  if (!tokenHash || !isConfirmType(requestedType)) {
    redirect(`/employee-login?message=${encodeURIComponent("Invalid or expired employee access link.")}`);
  }

  const next = getSafeCompanyAuthNext(requestUrl.searchParams.get("next"), requestedType);

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
