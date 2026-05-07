"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole } from "@/lib/user-management";
import { runWebsiteOperationsScan } from "@/lib/website-operations";

async function requireWebsiteOpsAdmin() {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is required for Website Operations.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const { data: role } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .eq("account_status", "active")
    .maybeSingle();

  if (!isPortalAdminRole(role?.role)) {
    throw new Error("Admin access is required for Website Operations.");
  }

  return { supabase, user };
}

async function getRequestBaseUrl() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");

  if (host) {
    return `${protocol}://${host}`;
  }

  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^/, "https://") ||
    "https://reliancepredictivesafety.com"
  );
}

export async function scanWebsiteOperations() {
  const { supabase, user } = await requireWebsiteOpsAdmin();
  const result = await runWebsiteOperationsScan(supabase, {
    baseUrl: await getRequestBaseUrl(),
    actorUserId: user.id,
    notifyAdmins: true,
  });

  revalidatePath("/employee/website-operations");
  revalidatePath("/employee/ai");

  return result;
}
