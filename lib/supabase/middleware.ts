import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/types";
import { canAccessEmployeePath, hasFullPortalVisibility } from "@/lib/user-management";

function withPortalSecurityHeaders(response: NextResponse) {
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()");
  return response;
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const isEmployeeRoute =
    request.nextUrl.pathname === "/employee" || request.nextUrl.pathname.startsWith("/employee/");
  // The installable mobile app lives outside /employee so it can render its own
  // full-screen shell, but it is the same portal and needs the same gate.
  const isMobileRoute = request.nextUrl.pathname === "/m" || request.nextUrl.pathname.startsWith("/m/");
  const isPortalRoute = isEmployeeRoute || isMobileRoute;

  if (!url || !key) {
    if (isPortalRoute) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/employee-login";
      loginUrl.searchParams.set("message", "supabase-required");
      return withPortalSecurityHeaders(NextResponse.redirect(loginUrl));
    }

    return withPortalSecurityHeaders(NextResponse.next({ request }));
  }

  let supabaseResponse = withPortalSecurityHeaders(NextResponse.next({ request }));

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        withPortalSecurityHeaders(supabaseResponse);
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (isPortalRoute && !userId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/employee-login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return withPortalSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  if (isPortalRoute && userId) {
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
      return withPortalSecurityHeaders(NextResponse.redirect(loginUrl));
    }

    const { data: moduleAccess } = hasFullPortalVisibility(role.role, role.account_status)
      ? { data: [] }
      : await supabase
          .from("portal_user_module_access")
          .select("module_key")
          .eq("user_id", userId);

    const moduleKeys = (moduleAccess ?? []).map((access) => access.module_key);

    if (!canAccessEmployeePath(role.role, role.account_status, request.nextUrl.pathname, moduleKeys)) {
      // The mobile app has no desktop shell to fall back to — bouncing a phone
      // user to /employee would just strand them, so send them back to sign-in.
      if (isMobileRoute || !canAccessEmployeePath(role.role, role.account_status, "/employee", moduleKeys)) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/employee-login";
        loginUrl.searchParams.set("message", "portal-module-required");
        return withPortalSecurityHeaders(NextResponse.redirect(loginUrl));
      }

      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = "/employee";
      dashboardUrl.searchParams.set("message", "role-access-required");
      return withPortalSecurityHeaders(NextResponse.redirect(dashboardUrl));
    }
  }

  return withPortalSecurityHeaders(supabaseResponse);
}
