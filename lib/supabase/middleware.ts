import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/types";
import { canAccessEmployeePath, isPortalAdminRole } from "@/lib/user-management";

async function hasPendingRequiredOnboarding(
  supabase: ReturnType<typeof createServerClient<Database>>,
  userId: string,
) {
  const { data: pendingAssignments } = await supabase
    .from("employee_document_assignments")
    .select("template_id")
    .eq("user_id", userId)
    .eq("status", "pending");
  const pendingTemplateIds = [...new Set((pendingAssignments ?? []).map((assignment) => assignment.template_id))];

  if (pendingTemplateIds.length === 0) {
    return false;
  }

  const { count } = await supabase
    .from("hr_document_templates")
    .select("id", { count: "exact", head: true })
    .in("id", pendingTemplateIds)
    .eq("active", true)
    .eq("required", true);

  return (count ?? 0) > 0;
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isEmployeeRoute =
    request.nextUrl.pathname === "/employee" || request.nextUrl.pathname.startsWith("/employee/");

  if (!url || !key) {
    if (isEmployeeRoute) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/employee-login";
      loginUrl.searchParams.set("message", "supabase-required");
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isEmployeeRoute && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/employee-login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isEmployeeRoute && user) {
    const { data: role } = await supabase
      .from("user_roles")
      .select("role, account_status")
      .eq("user_id", user.id)
      .eq("account_status", "active")
      .in("role", [
        "platform_admin",
        "super_admin",
        "admin",
        "company_admin",
        "employee",
        "internal_reviewer",
        "marketing",
      ])
      .maybeSingle();

    if (!role) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/employee-login";
      loginUrl.searchParams.set("message", "employee-role-required");
      return NextResponse.redirect(loginUrl);
    }

    const isAdminRole = isPortalAdminRole(role.role);
    const isHrOnboardingRoute = request.nextUrl.pathname === "/employee/hr-onboarding";

    if (!isAdminRole) {
      const onboardingLocked = await hasPendingRequiredOnboarding(supabase, user.id);

      if (onboardingLocked && !isHrOnboardingRoute) {
        const onboardingUrl = request.nextUrl.clone();
        onboardingUrl.pathname = "/employee/hr-onboarding";
        onboardingUrl.searchParams.set(
          "next",
          `${request.nextUrl.pathname}${request.nextUrl.search}`,
        );
        return NextResponse.redirect(onboardingUrl);
      }
    }

    if (!canAccessEmployeePath(role.role, role.account_status, request.nextUrl.pathname)) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = "/employee";
      dashboardUrl.searchParams.set("message", "role-access-required");
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return supabaseResponse;
}
