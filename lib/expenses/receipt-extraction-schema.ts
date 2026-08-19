import { employeeExpenseCategories } from "@/lib/company-data";

/** What the model is allowed to return. A receipt with no matching field yields null, never a guess. */
export interface ReceiptExtractionResult {
  vendor: string | null;
  amount: number | null;
  expense_date: string | null;
  category: (typeof employeeExpenseCategories)[number] | null;
  payment_method: string | null;
  notes: string | null;
}

/** Strict JSON schema for the Responses API. */
export const receiptExtractionResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["vendor", "amount", "expense_date", "category", "payment_method", "notes"],
  properties: {
    vendor: { type: ["string", "null"], description: "The merchant/business name on the receipt, or null if illegible." },
    amount: { type: ["number", "null"], description: "The total amount charged, or null if it cannot be read." },
    expense_date: {
      type: ["string", "null"],
      description: "The transaction date in YYYY-MM-DD format, or null if it cannot be read.",
    },
    category: {
      type: ["string", "null"],
      enum: [...employeeExpenseCategories, null],
      description: "Best matching expense category from the allowed list, or null if none fit.",
    },
    payment_method: {
      type: ["string", "null"],
      description: "How it was paid if shown (e.g. 'Visa ending 4471', 'Cash'), or null.",
    },
    notes: { type: ["string", "null"], description: "One short clarifying note if useful, otherwise null." },
  },
} as const;

const SYSTEM_RULES = [
  "You are reading a photo of an expense receipt for a company expense report.",
  "Extract only what is legibly printed on the receipt. Never invent or estimate a value you cannot read.",
  `category must be exactly one of: ${employeeExpenseCategories.join(", ")} — or null if none clearly fit.`,
  "amount is the final total charged, not a subtotal or a line item, unless no total is shown.",
  "expense_date must be YYYY-MM-DD. If only a partial date is legible, return null instead of guessing the missing part.",
  "This output pre-fills a form a human will review and edit before anything is submitted — accuracy matters more than completeness.",
].join(" ");

export function buildReceiptExtractionPrompt() {
  return [
    { role: "system" as const, content: SYSTEM_RULES },
    {
      role: "user" as const,
      content: "Read the attached receipt image and return the extraction fields as JSON.",
    },
  ];
}

function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Parses and defensively re-validates the model's JSON — schema strictness alone is not a trust boundary. */
export function parseReceiptExtractionOutput(rawText: string): ReceiptExtractionResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;

  const vendor = typeof record.vendor === "string" && record.vendor.trim() ? record.vendor.trim().slice(0, 200) : null;

  const amountRaw = record.amount;
  const amount =
    typeof amountRaw === "number" && Number.isFinite(amountRaw) && amountRaw > 0 ? Number(amountRaw.toFixed(2)) : null;

  const dateRaw = record.expense_date;
  const expense_date = typeof dateRaw === "string" && isValidIsoDate(dateRaw) ? dateRaw : null;

  const categoryRaw = record.category;
  const category =
    typeof categoryRaw === "string" && (employeeExpenseCategories as readonly string[]).includes(categoryRaw)
      ? (categoryRaw as (typeof employeeExpenseCategories)[number])
      : null;

  const payment_method =
    typeof record.payment_method === "string" && record.payment_method.trim() ? record.payment_method.trim().slice(0, 100) : null;

  const notes = typeof record.notes === "string" && record.notes.trim() ? record.notes.trim().slice(0, 300) : null;

  return { vendor, amount, expense_date, category, payment_method, notes };
}

/** True when the extraction found nothing usable — callers should skip offering a suggestion. */
export function isEmptyExtraction(result: ReceiptExtractionResult) {
  return !result.vendor && !result.amount && !result.expense_date && !result.category;
}
