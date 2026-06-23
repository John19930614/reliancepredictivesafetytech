import {
  confidenceColors,
  confidenceLabels,
  gapStatusColors,
  gapStatusLabels,
  requirementTypeLabels,
  reviewStatusColors,
  reviewStatusLabels,
  riskColors,
  riskLabels,
  type ConfidenceLevel,
  type GapStatus,
  type RequirementType,
  type ReviewStatus,
  type RiskLevel,
} from "@/lib/legal/types";

/** Shared pill/badge primitive used across the Legal Register module (doc §11/§12). */
export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "0.7rem",
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        padding: "2px 8px",
        borderRadius: 4,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export function RiskBadge({ level }: { level?: RiskLevel | string | null }) {
  if (!level) return null;
  const key = level as RiskLevel;
  return <Badge label={riskLabels[key] ?? String(level)} color={riskColors[key] ?? "#a7a7a7"} />;
}

export function ReviewStatusBadge({ status }: { status?: ReviewStatus | string | null }) {
  if (!status) return null;
  const key = status as ReviewStatus;
  return <Badge label={reviewStatusLabels[key] ?? String(status)} color={reviewStatusColors[key] ?? "#a7a7a7"} />;
}

export function ConfidenceBadge({ level }: { level?: ConfidenceLevel | string | null }) {
  if (!level) return null;
  const key = level as ConfidenceLevel;
  return <Badge label={confidenceLabels[key] ?? String(level)} color={confidenceColors[key] ?? "#a7a7a7"} />;
}

export function RequirementTypeBadge({ type }: { type?: RequirementType | string | null }) {
  if (!type) return null;
  const key = type as RequirementType;
  return <Badge label={requirementTypeLabels[key] ?? String(type)} color="#a7a7a7" />;
}

export function SourceTypeBadge({ type }: { type?: string | null }) {
  if (!type) return null;
  return <Badge label={type} color="#c9932b" />;
}

export function GapStatusBadge({ status }: { status?: GapStatus | string | null }) {
  if (!status) return null;
  const key = status as GapStatus;
  return <Badge label={gapStatusLabels[key] ?? String(status)} color={gapStatusColors[key] ?? "#a7a7a7"} />;
}

export function HumanReviewBadge({ required }: { required?: boolean | null }) {
  if (!required) return null;
  return <Badge label="Human Review" color="#f59e0b" />;
}
