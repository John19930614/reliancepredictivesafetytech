import type { CommandPriorityItem } from "@/lib/ai/command-context";
import type { Json } from "@/lib/supabase/types";

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

export function notificationFromPriorityItem(item: CommandPriorityItem): GeneratedNotification {
  return {
    title: item.label,
    body: item.title,
    priority: item.priority,
    source_type: item.sourceType,
    source_id: item.sourceId,
    action_href: item.actionHref ?? item.href,
    ai_summary: item.detail,
    dedupe_key: `${item.sourceType}:${item.sourceId}:${item.label.toLowerCase().replace(/\s+/g, "-")}`,
    metadata: { generated_from: "command_snapshot", source_label: item.sourceLabel, status: item.status },
  };
}
