import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/types";
import { canAccessEmployeePath, hasFullPortalVisibility } from "@/lib/user-management";

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

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (isEmployeeRoute && !userId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/employee-login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isEmployeeRoute && userId) {
    const { data: role } = await supabase
      .from("user_roles")
      .select("role, account_status")
      .eq("user_id", userId)
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

    const { data: moduleAccess } = hasFullPortalVisibility(role.role, role.account_status)
      ? { data: [] }
      : await supabase
          .from("portal_user_module_access")
          .select("module_key")
          .eq("user_id", userId);

    const moduleKeys = (moduleAccess ?? []).map((access) => access.module_key);

    if (!canAccessEmployeePath(role.role, role.account_status, request.nextUrl.pathname, moduleKeys)) {
      if (!canAccessEmployeePath(role.role, role.account_status, "/employee", moduleKeys)) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/employee-login";
        loginUrl.searchParams.set("message", "portal-module-required");
        return NextResponse.redirect(loginUrl);
      }

      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = "/employee";
      dashboardUrl.searchParams.set("message", "role-access-required");
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return supabaseResponse;
}
