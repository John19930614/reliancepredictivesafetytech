export type AuditEventCategory = "auth" | "data" | "ai" | "release" | "billing" | "admin" | "security" | "general";
export type AuditEventSeverity = "info" | "warn" | "error" | "critical";

export interface AuditEventPayload {
  event_type: string;
  event_category?: AuditEventCategory;
  severity?: AuditEventSeverity;
  actor_id?: string | null;
  actor_role?: string | null;
  tenant_id?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  summary: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  evidence_links?: string[];
  ip_address?: string | null;
  user_agent?: string | null;
}

export function buildAuthAuditEvent(
  type: "login" | "logout" | "password_reset" | "invite_sent" | "account_activated",
  actorId: string | null,
  summary: string,
): AuditEventPayload {
  return {
    event_type: `auth.${type}`,
    event_category: "auth",
    severity: "info",
    actor_id: actorId,
    resource_type: "user",
    resource_id: actorId ?? undefined,
    summary,
  };
}

export function buildDataAuditEvent(
  action: "create" | "update" | "delete",
  resourceType: string,
  resourceId: string,
  actorId: string | null,
  summary: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
): AuditEventPayload {
  return {
    event_type: `data.${action}`,
    event_category: "data",
    severity: "info",
    actor_id: actorId,
    resource_type: resourceType,
    resource_id: resourceId,
    summary,
    before_state: before ?? null,
    after_state: after ?? null,
  };
}

export function buildSecurityAuditEvent(
  type: string,
  actorId: string | null,
  summary: string,
  severity: AuditEventSeverity = "warn",
): AuditEventPayload {
  return {
    event_type: `security.${type}`,
    event_category: "security",
    severity,
    actor_id: actorId,
    summary,
  };
}
