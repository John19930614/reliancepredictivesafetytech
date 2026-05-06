import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCommandSnapshot } from "@/lib/ai/command-context";
import { notificationFromPriorityItem } from "@/lib/notifications/rule-format";
import type { Database } from "@/lib/supabase/types";

type PortalClient = SupabaseClient<Database>;

export async function generateWorkflowNotificationsForUser(supabase: PortalClient, recipientUserId: string) {
  const snapshot = await getCommandSnapshot(supabase, recipientUserId);
  const candidates = snapshot.priorityItems.map(notificationFromPriorityItem);

  if (candidates.length === 0) {
    return [];
  }

  const dedupeKeys = candidates.map((item) => item.dedupe_key);
  const { data: existing } = await supabase
    .from("portal_notifications")
    .select("dedupe_key")
    .eq("recipient_user_id", recipientUserId)
    .in("dedupe_key", dedupeKeys)
    .neq("status", "archived");

  const existingKeys = new Set((existing ?? []).map((item) => item.dedupe_key));
  const nextNotifications = candidates.filter((item) => !existingKeys.has(item.dedupe_key));

  if (nextNotifications.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("portal_notifications")
    .insert(
      nextNotifications.map((item) => ({
        ...item,
        recipient_user_id: recipientUserId,
        created_by_ai: true,
      })),
    )
    .select("*");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
