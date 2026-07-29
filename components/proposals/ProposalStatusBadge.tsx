import { Badge } from "@/components/legal-register/badges";
import { proposalStatusColors, proposalStatusLabels, type ProposalStatus } from "@/lib/proposals/types";

export function ProposalStatusBadge({ status }: { status?: ProposalStatus | string | null }) {
  if (!status) return null;
  const key = status as ProposalStatus;
  return <Badge label={proposalStatusLabels[key] ?? String(status)} color={proposalStatusColors[key] ?? "#a7a7a7"} />;
}
