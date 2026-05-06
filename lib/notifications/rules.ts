import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCommandSnapshot, type CommandPriorityItem } from "@/lib/ai/command-context";
import type { Database, Json } from "@/lib/supabase/types";

type PortalClient = SupabaseClient<Database>;

export type GeneratedNotification = {
  title: string;
  body: string;
  priority: "low" | "medium" | "high" | "critical";
  source_type: string;
  source_id: string;
  action_href: string;
  ai_summary: string;
  dedupe_key: string;
  metadata?: Json;
};

function notificationFromPriorityItem(item: CommandPriorityItem): GeneratedNotification {
  return {
    title: item.label,
    body: item.title,
    priority: item.priority,
    source_type: item.sourceType,
    source_id: item.sourceId,
    action_href: item.href,
    ai_summary: item.detail,
    dedupe_key: `${item.sourceType}:${item.sourceId}:${item.label.toLowerCase().replace(/\s+/g, "-")}`,
    metadata: { generated_from: "command_snapshot" },
  };
}

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
