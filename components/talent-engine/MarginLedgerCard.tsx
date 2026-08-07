import { DollarSign } from "lucide-react";
import type { LedgerRow } from "@/lib/talent-engine/types";
import { TalentCard, TalentEmpty } from "./TalentCard";
import { formatCurrency, formatNumber, formatRate } from "./format";

export interface MarginLedgerTotals {
  placements: number;
  hours: number;
  /** Hours-weighted, not the mean of the row spreads — see summariseLedger(). */
  avgSpread: number;
  weeklyMargin: number;
}

/**
 * The placements past the display cap, rolled into one line. Without it the
 * footer would not add up to the rows above it, which on a money table is worse
 * than showing nothing.
 */
export interface MarginLedgerOverflow extends MarginLedgerTotals {
  clients: number;
}

/**
 * What the active book is actually earning this week: one row per placement,
 * bill and pay side by side, and a totals footer that has to agree with the
 * Weekly Gross Margin tile at the top of the page (both come from
 * summariseLedger()).
 */
export function MarginLedgerCard({
  rows,
  totals,
  overflow = null,
  weekLabel,
}: {
  rows: LedgerRow[];
  totals: MarginLedgerTotals;
  /** Everything past the display cap, as one summary row. Null when nothing is hidden. */
  overflow?: MarginLedgerOverflow | null;
  /** e.g. "week of Aug 3" — what period the numbers cover. */
  weekLabel: string;
}) {
  return (
    <TalentCard count={weekLabel} flush={rows.length > 0} icon={<DollarSign size={15} />} title="Margin Ledger — Active Placements">
      {rows.length === 0 ? (
        <TalentEmpty
          hint="Once a placement is approved and its timesheet lands, the bill rate, the pay rate and the margin you kept show up here."
          title="No active placements billing this week"
        />
      ) : (
        <div className="talent-ledger-wrapper">
          <table className="talent-ledger">
            <caption className="talent-visually-hidden">
              Active placements for the current week, with bill rate, pay rate, spread, hours and weekly margin.
            </caption>
            <thead>
              <tr>
                <th className="talent-ledger-lead" scope="col">
                  Placement
                </th>
                <th scope="col">Bill</th>
                <th scope="col">Pay</th>
                <th scope="col">Spread</th>
                <th scope="col">Hrs</th>
                <th scope="col">Wk Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.placement_id}>
                  <td className="talent-ledger-lead">
                    <div className="talent-ledger-name">{row.candidate_name}</div>
                    <div className="talent-ledger-client">{row.client_name}</div>
                  </td>
                  <td>{formatRate(row.bill_rate)}</td>
                  <td>{formatRate(row.pay_rate)}</td>
                  <td className="talent-ledger-spread">{formatRate(row.spread)}</td>
                  <td>{formatNumber(row.hours)}</td>
                  <td className="talent-ledger-spread">{formatCurrency(row.weekly_margin)}</td>
                </tr>
              ))}
              {overflow ? (
                <tr>
                  <td className="talent-ledger-lead">
                    <div className="talent-ledger-name">+{overflow.placements} more</div>
                    <div className="talent-ledger-client">
                      across {overflow.clients} {overflow.clients === 1 ? "client" : "clients"}
                    </div>
                  </td>
                  <td>—</td>
                  <td>—</td>
                  <td className="talent-ledger-spread">{formatRate(overflow.avgSpread)} avg</td>
                  <td>{formatNumber(overflow.hours)}</td>
                  <td className="talent-ledger-spread">{formatCurrency(overflow.weeklyMargin)}</td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr>
                <td className="talent-ledger-lead">
                  {totals.placements} {totals.placements === 1 ? "placement" : "placements"}
                </td>
                <td>—</td>
                <td>—</td>
                <td className="talent-ledger-spread">{formatRate(totals.avgSpread)} avg</td>
                <td>{formatNumber(totals.hours)}</td>
                <td className="talent-ledger-spread">{formatCurrency(totals.weeklyMargin)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </TalentCard>
  );
}
