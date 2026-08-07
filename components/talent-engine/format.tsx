/**
 * EHS Talent Engine — presentation-only formatting.
 *
 * Nothing here does money MATH; that all lives in lib/talent-engine/pricing.ts
 * so it can be unit-tested without React. These functions only decide how an
 * already-computed number is spelled on screen, and every one of them is
 * total — a null, a NaN, or a numeric column that PostgREST handed back as a
 * string all render as something a human can read rather than "NaN".
 */

/** Coerces a numeric column (number | numeric-string | null) to a finite number. */
export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/** An hourly rate: `$95`, `$95.50`, `-$14`. Whole dollars lose the cents. */
export function formatRate(value: unknown): string {
  const n = toNumber(value);
  const abs = Math.abs(n);
  const body = Number.isInteger(abs) ? String(abs) : abs.toFixed(2);
  return `${n < 0 ? "-" : ""}$${body}`;
}

/** A whole-dollar amount with thousands separators: `$1,000`. */
export function formatCurrency(value: unknown): string {
  const n = toNumber(value);
  const abs = Math.abs(n);
  return `${n < 0 ? "-" : ""}$${Math.round(abs).toLocaleString("en-US")}`;
}

function compactBody(value: number): string {
  const fixed = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
  // 11.20 → 11.2, 2.00 → 2
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

/** Headline money for the KPI tiles: `$11.2K`, `$2.24M`, `$840`. */
export function formatCompactMoney(value: unknown): string {
  const n = toNumber(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${compactBody(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${compactBody(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

/** A count or an hours figure: `560`, `1,240`. */
export function formatNumber(value: unknown): string {
  const n = toNumber(value);
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** A whole percentage: `36%`. */
export function formatPercent(value: unknown): string {
  return `${Math.round(toNumber(value))}%`;
}

/** Clamps a percentage into the 0–100 range a meter or an arc can draw. */
export function clampPercent(value: unknown): number {
  const n = toNumber(value);
  if (n <= 0) return 0;
  if (n >= 100) return 100;
  return Math.round(n * 10) / 10;
}

/** `Maria Rodriguez` → `MR`. Falls back to `?` so an avatar is never blank. */
export function initials(value: string | null | undefined): string {
  const parts = String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : (parts[0]?.[1] ?? "");
  return `${first}${second}`.toUpperCase();
}

/**
 * Picks one of five avatar tint classes from a stable seed (a row id), so the
 * colour never lands in an inline `style` and never changes between renders.
 */
export function avatarTintClass(seed: string | null | undefined): string {
  const value = String(seed ?? "");
  let hash = 7;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100003;
  }
  return `talent-avatar-${(hash % 5) + 1}`;
}

/** `3 min ago`, `1 hr ago`, `2 days ago`, then an absolute date. */
export function formatRelativeTime(value: string | null | undefined, now: number = Date.now()): string {
  if (!value) return "—";
  const stamp = new Date(value).getTime();
  if (Number.isNaN(stamp)) return "—";
  const minutes = Math.floor(Math.max(0, now - stamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDay(value);
}

/** `Aug 6, 2026` — pinned to en-US so server and client agree. */
export function formatDay(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Joins the non-empty parts of a subtitle with the house separator. */
export function joinMeta(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => (typeof part === "number" ? String(part) : (part ?? "").trim()))
    .filter((part) => part.length > 0)
    .join(" · ");
}
