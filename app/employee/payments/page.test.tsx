// Route tests for the global payments ledger.
//
// CLAUDE.md requires an RBAC test for a new module/page. This page reuses the
// exact gate app/employee/invoices/page.tsx uses — canAccessEmployeePath()
// against the `finance` catalog entry — so what is worth proving here is that
// (a) an account without finance access is denied the ledger, (b) an account
// with access sees payments fetched and rendered with client/invoice/proposal
// labels resolved, and (c) the empty and missing-table edge cases degrade the
// way the Invoices ledger does rather than crashing or lying about the data.
//
// The Supabase stand-in follows the chainable-builder style already used by
// app/employee/users/actions.test.ts and app/employee/proposals/actions.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectError(url);
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import PaymentsLedgerPage from "./page";

/** Stands in for the throw that next/navigation's redirect performs. */
class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const createClientMock = vi.mocked(createClient);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const INVOICE_ID = "33333333-3333-4333-8333-333333333333";
const PROPOSAL_ID = "44444444-4444-4444-8444-444444444444";
const PAYMENT_ID = "55555555-5555-4555-8555-555555555555";

// ---------------------------------------------------------------------------
// Minimal chainable stand-in for the Supabase PostgREST client. Routes are
// keyed by table name; a route may be a function so one table can answer
// differently depending on the filters applied (e.g. .in("id", [...])).
// ---------------------------------------------------------------------------
interface QueryRecord {
  table: string;
  filters: Array<[string, unknown]>;
}

type Route = (query: QueryRecord) => { data: unknown; error?: unknown };

function createSupabaseMock(routes: Record<string, Route>) {
  const calls: QueryRecord[] = [];

  function resolve(record: QueryRecord) {
    const route = routes[record.table];
    const result = route ? route(record) : { data: null };
    return { data: result.data ?? null, error: result.error ?? null };
  }

  function builder(record: QueryRecord) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const api: any = {
      select: () => api,
      eq(column: string, value: unknown) {
        record.filters.push([column, value]);
        return api;
      },
      in(column: string, value: unknown) {
        record.filters.push([column, value]);
        return api;
      },
      order: () => api,
      limit: () => api,
      maybeSingle: () => Promise.resolve(resolve(record)),
      then: (onFulfilled?: any, onRejected?: any) => Promise.resolve(resolve(record)).then(onFulfilled, onRejected),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return api;
  }

  return {
    calls,
    auth: { getUser: () => Promise.resolve({ data: { user: { id: USER_ID } } }) },
    from(table: string) {
      const record: QueryRecord = { table, filters: [] };
      calls.push(record);
      return builder(record);
    },
  };
}

function paymentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PAYMENT_ID,
    invoice_id: INVOICE_ID,
    stripe_payment_intent_id: "pi_123",
    stripe_checkout_session_id: "cs_123",
    amount: "1200.00",
    currency: "usd",
    status: "succeeded",
    payment_method_type: "card",
    failure_reason: null,
    initiated_at: "2026-08-01T12:00:00Z",
    succeeded_at: "2026-08-01T12:05:00Z",
    created_at: "2026-08-01T12:00:00Z",
    ...overrides,
  };
}

interface Scenario {
  role?: string | null;
  accountStatus?: string | null;
  moduleKeys?: string[];
  payments?: unknown[] | null;
  paymentError?: unknown;
  invoices?: unknown[];
  clients?: unknown[];
  proposals?: unknown[];
}

function signIn(scenario: Scenario = {}) {
  const supabase = createSupabaseMock({
    user_roles: () => ({
      data: { role: scenario.role ?? "employee", account_status: scenario.accountStatus ?? "active" },
    }),
    portal_user_module_access: () => ({ data: (scenario.moduleKeys ?? ["finance"]).map((key) => ({ module_key: key })) }),
    client_invoice_payments: () => ({
      data: scenario.payments === undefined ? [paymentRow()] : scenario.payments,
      error: scenario.paymentError,
    }),
    client_invoices: () => ({
      data:
        scenario.invoices ?? [{ id: INVOICE_ID, invoice_number: "WOND-2026-INV-01", client_id: CLIENT_ID, proposal_id: PROPOSAL_ID }],
    }),
    company_clients: () => ({ data: scenario.clients ?? [{ id: CLIENT_ID, name: "Northwind Construction" }] }),
    client_proposals: () => ({ data: scenario.proposals ?? [{ id: PROPOSAL_ID, title: "Platform Proposal", proposal_number: "WOND-P-01" }] }),
  });

  createClientMock.mockResolvedValue(supabase as never);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PaymentsLedgerPage — access", () => {
  it("denies the ledger to an account with no finance access", async () => {
    signIn({ moduleKeys: [] });
    render(await PaymentsLedgerPage());
    expect(screen.getByText(/Finance Center access is required/)).toBeInTheDocument();
    expect(screen.queryByText("Payments ledger")).toBeNull();
  });

  it("denies the ledger to an inactive account even with the finance key granted", async () => {
    signIn({ accountStatus: "suspended" });
    render(await PaymentsLedgerPage());
    expect(screen.getByText(/Finance Center access is required/)).toBeInTheDocument();
  });

  it("redirects a signed-out visitor to login", async () => {
    const supabase = createSupabaseMock({});
    supabase.auth.getUser = () => Promise.resolve({ data: { user: null } }) as never;
    createClientMock.mockResolvedValue(supabase as never);

    await expect(PaymentsLedgerPage()).rejects.toThrow("NEXT_REDIRECT:/employee-login");
  });
});

describe("PaymentsLedgerPage — with finance access", () => {
  it("renders the payments list with client, invoice and proposal resolved", async () => {
    signIn();
    render(await PaymentsLedgerPage());

    expect(screen.getByText("Payments ledger")).toBeInTheDocument();
    expect(screen.getByText("Northwind Construction")).toBeInTheDocument();
    expect(screen.getByText("WOND-2026-INV-01")).toBeInTheDocument();
    expect(screen.getByText("WOND-P-01")).toBeInTheDocument();
    expect(screen.getByText("succeeded")).toBeInTheDocument();
    // $1,200.00 appears twice: once in the "Collected" KPI tile and once in
    // the table row itself, so the count is asserted rather than a single
    // getByText (which requires exactly one match).
    expect(screen.getAllByText("$1,200.00")).toHaveLength(2);
  });

  it("sums the KPI strip from succeeded/pending/failed/refunded rows", async () => {
    signIn({
      payments: [
        paymentRow({ id: "p1", status: "succeeded", amount: "500.00" }),
        paymentRow({ id: "p2", status: "pending", amount: "100.00" }),
        paymentRow({ id: "p3", status: "failed", amount: "50.00", failure_reason: "Card declined" }),
      ],
    });
    render(await PaymentsLedgerPage());

    // Each amount appears once in its KPI tile and once in its table row.
    expect(screen.getAllByText("$500.00")).toHaveLength(2);
    expect(screen.getAllByText("$100.00")).toHaveLength(2);
    expect(screen.getByText("Card declined")).toBeInTheDocument();
  });

  it("shows the empty state instead of a table when no payments exist", async () => {
    signIn({ payments: [] });
    render(await PaymentsLedgerPage());
    expect(screen.getByText("No payments have been collected yet.")).toBeInTheDocument();
  });

  it("degrades gracefully when client_invoice_payments is not migrated yet", async () => {
    signIn({ payments: null, paymentError: { code: "PGRST205", message: "Could not find the table in the schema cache" } });
    render(await PaymentsLedgerPage());
    expect(screen.getByText(/not set up in Supabase yet/)).toBeInTheDocument();
  });

  it("reports a read failure instead of rendering an empty ledger", async () => {
    signIn({ payments: null, paymentError: { code: "500", message: "connection reset" } });
    render(await PaymentsLedgerPage());
    expect(screen.getByText(/could not be read just now/)).toBeInTheDocument();
  });

  it("labels a payment whose invoice was not found rather than crashing", async () => {
    signIn({ invoices: [] });
    render(await PaymentsLedgerPage());
    expect(screen.getByText("Unknown invoice")).toBeInTheDocument();
    expect(screen.getByText("Unknown client")).toBeInTheDocument();
  });

  it("full portal visibility (owner role) bypasses the module-access grant entirely", async () => {
    signIn({ role: "super_admin", moduleKeys: [] });
    render(await PaymentsLedgerPage());
    expect(screen.getByText("Payments ledger")).toBeInTheDocument();
  });
});
