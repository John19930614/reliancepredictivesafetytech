import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditEventPayload } from "./builders";

export type { AuditEventCategory, AuditEventSeverity, AuditEventPayload } from "./builders";
export { buildAuthAuditEvent, buildDataAuditEvent, buildSecurityAuditEvent } from "./builders";

export async function recordAuditEvent(payload: AuditEventPayload): Promise<void> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return;
    await supabase.from("platform_audit_events").insert({
      event_type: payload.event_type,
      event_category: payload.event_category ?? "general",
      severity: payload.severity ?? "info",
      actor_id: payload.actor_id ?? null,
      actor_role: payload.actor_role ?? null,
      tenant_id: payload.tenant_id ?? null,
      resource_type: payload.resource_type ?? null,
      resource_id: payload.resource_id ?? null,
      summary: payload.summary,
      before_state: (payload.before_state ?? null) as import("@/lib/supabase/types").Json | null,
      after_state: (payload.after_state ?? null) as import("@/lib/supabase/types").Json | null,
      evidence_links: payload.evidence_links ?? [],
      ip_address: payload.ip_address ?? null,
      user_agent: payload.user_agent ?? null,
    });
  } catch {
    // Audit logging must never crash the calling code
  }
}
