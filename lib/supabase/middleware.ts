import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/types";

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
  }

  return supabaseResponse;
}
