import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";

export function createAdminClient() {
  const env = getSupabaseAdminEnv();

  if (!env) {
    return null;
  }

  return createSupabaseClient<Database>(env.url, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
