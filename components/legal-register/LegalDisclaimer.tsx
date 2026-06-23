import { ShieldAlert } from "lucide-react";
import { DEFAULT_LEGAL_DISCLAIMER } from "@/lib/legal/types";

/** Fixed compliance disclaimer required on every AI surface (doc §7). */
export function LegalDisclaimer() {
  return (
    <div
      style={{
        marginTop: 32,
        padding: "12px 16px",
        borderRadius: 8,
        border: "1px solid var(--portal-border)",
        background: "var(--portal-surface)",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        fontSize: "0.78rem",
        color: "var(--portal-muted)",
        lineHeight: 1.5,
      }}
    >
      <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1, color: "#f59e0b" }} />
      <span>{DEFAULT_LEGAL_DISCLAIMER}</span>
    </div>
  );
}
