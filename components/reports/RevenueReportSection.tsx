import Link from "next/link";
import type {
  AgingBand,
  PipelineSummary,
  ReceivablesSummary,
  RevenueMonth,
} from "@/lib/reports/revenue";

// The revenue half of Reports, which until now covered only headcount, payroll,
// expenses, hiring and compliance. Every figure here comes from columns the
// platform already maintained — the reporting layer simply never reached for
// the Commercial tables.

interface RevenueReportSectionProps {
  pipeline: PipelineSummary;
  months: RevenueMonth[];
  aging: AgingBand[];
  receivables: ReceivablesSummary;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function monthLabel(month: string): string {
  const [year, index] = month.split("-");
  const date = new Date(Number(year), Number(index) - 1, 1);
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(date);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi-card reports-stat-card">
      <div className="eyebrow">{label}</div>
      <div className="metric">{value}</div>
      {sub ? <div className="reports-stat-sub">{sub}</div> : null}
    </div>
  );
}

export function RevenueReportSection({ pipeline, months, aging, receivables }: RevenueReportSectionProps) {
  const peakMonth = Math.max(1, ...months.map((month) => Math.max(month.wonValue, month.lostValue)));
  const agingTotal = aging.reduce((total, band) => total + band.count, 0);
  const stale = aging[3];

  return (
    <>
      <div className="reports-kpi-row">
        <Stat
          label="Open Pipeline"
          value={pipeline.openValue > 0 ? money(pipeline.openValue) : "—"}
          sub={`${pipeline.openCount} proposal${pipeline.openCount === 1 ? "" : "s"}`}
        />
        <Stat
          label="With the Client"
          value={pipeline.awaitingDecisionValue > 0 ? money(pipeline.awaitingDecisionValue) : "—"}
          sub={`${pipeline.awaitingDecisionCount} awaiting a decision`}
        />
        <Stat
          label="Won"
          value={pipeline.wonValue > 0 ? money(pipeline.wonValue) : "—"}
          sub={
            pipeline.winRate === null
              ? `${pipeline.wonCount} accepted`
              : `${pipeline.wonCount} accepted · ${Math.round(pipeline.winRate * 100)}% win rate`
          }
        />
        <Stat
          label="Outstanding"
          value={
            receivables.expectedValue + receivables.invoicedValue > 0
              ? money(receivables.expectedValue + receivables.invoicedValue)
              : "—"
          }
          sub={receivables.overdueCount > 0 ? `${money(receivables.overdueValue)} overdue` : "nothing overdue"}
        />
      </div>

      <section className="table-card reports-chart-card">
        <div className="eyebrow">Commercial</div>
        <h2>Won and lost by month</h2>
        {months.length === 0 ? (
          <div className="empty-state">
            No proposals have been accepted or declined yet. Outcomes appear here as deals close.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            {months.map((month) => (
              <div key={month.month} style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: 12, alignItems: "center" }}>
                <span style={{ color: "var(--portal-muted)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                  {monthLabel(month.month)}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {month.wonValue > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        aria-hidden
                        style={{
                          background: "var(--portal-gold)",
                          borderRadius: 3,
                          height: 12,
                          width: `${Math.max(2, (month.wonValue / peakMonth) * 100)}%`,
                        }}
                      />
                      <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                        {money(month.wonValue)} won ({month.wonCount})
                      </span>
                    </div>
                  ) : null}
                  {month.lostValue > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        aria-hidden
                        style={{
                          background: "var(--portal-muted)",
                          borderRadius: 3,
                          height: 8,
                          opacity: 0.55,
                          width: `${Math.max(2, (month.lostValue / peakMonth) * 100)}%`,
                        }}
                      />
                      <span style={{ color: "var(--portal-muted)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                        {money(month.lostValue)} lost ({month.lostCount})
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="table-card">
        <div className="eyebrow">Commercial</div>
        <h2>Proposals waiting on a client</h2>
        {agingTotal === 0 ? (
          <div className="empty-state">Nothing is sitting with a client right now.</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {aging.map((band) => (
                <div
                  key={band.label}
                  style={{ display: "flex", justifyContent: "space-between", gap: 12, fontVariantNumeric: "tabular-nums" }}
                >
                  <span style={{ color: "var(--portal-muted)" }}>{band.label}</span>
                  <span>
                    {band.count} · {band.value > 0 ? money(band.value) : "—"}
                  </span>
                </div>
              ))}
            </div>
            {stale && stale.count > 0 ? (
              <p style={{ marginTop: 12 }}>
                {stale.count} proposal{stale.count === 1 ? " has" : "s have"} been out for over 60 days.{" "}
                <Link href="/employee/proposals">Review them</Link>.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="table-card">
        <div className="eyebrow">Finance</div>
        <h2>Receivables</h2>
        {receivables.expectedCount + receivables.invoicedCount + receivables.receivedCount === 0 ? (
          <div className="empty-state">
            No income records yet. Accepting a proposal files its expected payments automatically.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {(
              [
                ["Expected", receivables.expectedValue, receivables.expectedCount],
                ["Invoiced", receivables.invoicedValue, receivables.invoicedCount],
                ["Received", receivables.receivedValue, receivables.receivedCount],
              ] as const
            ).map(([label, value, count]) => (
              <div
                key={label}
                style={{ display: "flex", justifyContent: "space-between", gap: 12, fontVariantNumeric: "tabular-nums" }}
              >
                <span style={{ color: "var(--portal-muted)" }}>{label}</span>
                <span>
                  {count} · {value > 0 ? money(value) : "—"}
                </span>
              </div>
            ))}
            {receivables.overdueCount > 0 ? (
              <p style={{ marginTop: 8 }}>
                <strong>{money(receivables.overdueValue)}</strong> across {receivables.overdueCount} payment
                {receivables.overdueCount === 1 ? " is" : "s are"} past due.{" "}
                <Link href="/employee/finance">Open Finance Center</Link>.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </>
  );
}
