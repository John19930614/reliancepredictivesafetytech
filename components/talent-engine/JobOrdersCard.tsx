import { ClipboardList } from "lucide-react";
import type { JobOrderWithClient } from "@/lib/talent-engine/types";
import { TalentAiTag, TalentCard, TalentEmpty } from "./TalentCard";
import { JobOrderCreateForm } from "./JobOrderCreateForm";
import { JobOrderManagePanel } from "./JobOrderManagePanel";
import { avatarTintClass, formatRate, initials, joinMeta } from "./format";

/**
 * Open client requisitions. The rate on the right is the BILL rate — what the
 * client pays us — which is the top half of every spread on this page.
 */
export function JobOrdersCard({
  orders,
  openCount,
  canPropose,
  canSetRate,
  clients,
  verticalOptions,
}: {
  orders: JobOrderWithClient[];
  openCount: number;
  canPropose: boolean;
  canSetRate: boolean;
  clients: { id: string; name: string }[];
  /** Configured trade list from talent_settings, for the vertical pickers. */
  verticalOptions?: string[];
}) {
  return (
    <TalentCard
      count={openCount > 0 ? `${openCount} open` : null}
      icon={<ClipboardList size={15} />}
      tag={<TalentAiTag label="AI scouting" />}
      title="Client Job Orders"
    >
      {canPropose ? <JobOrderCreateForm canSetRate={canSetRate} clients={clients} verticalOptions={verticalOptions} /> : null}
      {orders.length === 0 ? (
        <TalentEmpty
          hint="Open requisitions appear here with the client's bill rate, which is what every spread is measured against."
          title="No open job orders yet"
        />
      ) : (
        <ul className="talent-list">
          {orders.map((order) => (
            // The row stays a flex line; the manage panel is a sibling BLOCK
            // beneath it, so opening it pushes the card down rather than
            // squeezing the rate column.
            <li className="talent-row talent-row-managed" key={order.id}>
              <span className="talent-row-line">
              <span aria-hidden="true" className={`talent-avatar ${avatarTintClass(order.client?.name ?? order.id)}`}>
                {initials(order.client?.name ?? order.title)}
              </span>
              <span className="talent-row-main">
                <span className="talent-row-title" title={order.title}>
                  {order.title}
                  {order.openings > 1 ? ` (${order.openings})` : ""}
                </span>
                <span className="talent-row-sub">
                  {joinMeta([order.client?.name ?? "Unassigned client", order.location]) || "No client or location set"}
                </span>
              </span>
                <span className="talent-row-rate">
                  <span className="talent-rate-value">{order.bill_rate === null ? "—" : formatRate(order.bill_rate)}</span>
                  <span className="talent-rate-unit">bill/hr</span>
                </span>
              </span>
              {canPropose ? (
                <JobOrderManagePanel
                  canPropose={canPropose}
                  canSetRate={canSetRate}
                  clients={clients}
                  order={order}
                  verticalOptions={verticalOptions}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </TalentCard>
  );
}
