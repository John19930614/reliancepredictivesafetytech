import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Database } from "@/lib/supabase/types";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function createClient() {
  const env = getSupabaseEnv();

  if (!env) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies; middleware refreshes sessions.
        }
      },
    },
  });
}

/**
 * Use in Server Actions and Route Handlers instead of createClient().
 * Redirects to login if Supabase env vars are missing — guarantees the
 * returned client is never null, so callers need no null check.
 */
export async function requireClient() {
  const client = await createClient();
  if (!client) {
    redirect("/employee-login?message=supabase-required");
  }
  return client;
}
