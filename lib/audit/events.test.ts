import { describe, expect, it } from "vitest";
import {
  buildAuthAuditEvent,
  buildDataAuditEvent,
  buildSecurityAuditEvent,
} from "./builders";

describe("buildAuthAuditEvent", () => {
  it("sets correct event_type prefix", () => {
    const e = buildAuthAuditEvent("login", "user-1", "User logged in");
    expect(e.event_type).toBe("auth.login");
    expect(e.event_category).toBe("auth");
    expect(e.actor_id).toBe("user-1");
    expect(e.summary).toBe("User logged in");
  });

  it("handles null actor", () => {
    const e = buildAuthAuditEvent("invite_sent", null, "Invite sent");
    expect(e.actor_id).toBeNull();
  });
});

describe("buildDataAuditEvent", () => {
  it("includes before/after state", () => {
    const before = { status: "draft" };
    const after = { status: "published" };
    const e = buildDataAuditEvent("update", "document", "doc-1", "user-1", "Updated doc", before, after);
    expect(e.event_type).toBe("data.update");
    expect(e.event_category).toBe("data");
    expect(e.resource_type).toBe("document");
    expect(e.resource_id).toBe("doc-1");
    expect(e.before_state).toEqual(before);
    expect(e.after_state).toEqual(after);
  });

  it("handles missing before/after state", () => {
    const e = buildDataAuditEvent("create", "sprint", "sp-1", "user-1", "Created sprint");
    expect(e.before_state).toBeNull();
    expect(e.after_state).toBeNull();
  });
});

describe("buildSecurityAuditEvent", () => {
  it("defaults to warn severity", () => {
    const e = buildSecurityAuditEvent("unauthorized_access", "user-1", "Access denied");
    expect(e.severity).toBe("warn");
    expect(e.event_type).toBe("security.unauthorized_access");
  });

  it("accepts custom severity", () => {
    const e = buildSecurityAuditEvent("breach_attempt", null, "Breach detected", "critical");
    expect(e.severity).toBe("critical");
    expect(e.actor_id).toBeNull();
  });
});
