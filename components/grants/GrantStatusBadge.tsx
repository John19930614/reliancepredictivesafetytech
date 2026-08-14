import { Badge } from "@/components/legal-register/badges";
import { grantStatusColor, grantStatusLabel } from "@/lib/grants/statuses";

/**
 * Server-safe status pill for a .data-table cell, the same shape as
 * components/proposals/ProposalStatusBadge.tsx.
 *
 * Uses the Badge primitive rather than .record-badge because that class has only
 * three variants (-gold / -danger / -neutral) and the grant workflow has nine
 * statuses — three of them would have had to lie.
 */
export function GrantStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;

  return <Badge label={grantStatusLabel(status)} color={grantStatusColor(status)} />;
}
