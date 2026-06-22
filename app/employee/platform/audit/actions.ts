"use server";

import { requireClient } from "@/lib/supabase/server";

export async function getAuditEvents(limit = 100, category?: string) {
  const supabase = await requireClient();
  let query = supabase
    .from("platform_audit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (category) query = query.eq("event_category", category);
  const { data } = await query;
  return data ?? [];
}
