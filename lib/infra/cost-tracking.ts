export interface CostEntry {
  service: string;
  category: string;
  amount_cents: number;
  period_month: string;
  notes?: string | null;
}

export interface CostSummary {
  totalCents: number;
  byCategory: Record<string, number>;
  byService: Record<string, number>;
  period: string;
}

export function summarizeCosts(entries: CostEntry[]): CostSummary {
  const byCategory: Record<string, number> = {};
  const byService: Record<string, number> = {};
  let totalCents = 0;

  for (const entry of entries) {
    totalCents += entry.amount_cents;
    byCategory[entry.category] = (byCategory[entry.category] ?? 0) + entry.amount_cents;
    byService[entry.service] = (byService[entry.service] ?? 0) + entry.amount_cents;
  }

  return {
    totalCents,
    byCategory,
    byService,
    period: entries[0]?.period_month ?? "",
  };
}

export function formatCostCents(cents: number): string {
  if (cents === 0) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

export function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getMonthLabel(period: string): string {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
