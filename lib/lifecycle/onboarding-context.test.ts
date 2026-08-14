import { describe, expect, it } from "vitest";
import { lifecycleStages } from "@/lib/company-data";
import {
  handoffState,
  issuedInvoices,
  loadOnboardingContext,
  onboardingProgress,
  outstandingItems,
  postWinItems,
  postWinStages,
  type OnboardingContext,
  type OnboardingInvoice,
  type OnboardingItem,
} from "./onboarding-context";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";

let seq = 0;
function item(over: Partial<OnboardingItem> = {}): OnboardingItem {
  seq += 1;
  return {
    id: `item-${seq}`,
    title: "Billing setup confirmed",
    section: "Onboarding",
    lifecycle_stage: "Onboarding",
    status: "Not Started",
    owner: null,
    due_date: null,
    completed: false,
    ...over,
  };
}

function invoice(over: Partial<OnboardingInvoice> = {}): OnboardingInvoice {
  return {
    id: "inv-1",
    invoice_number: "RPS-INV-2026-0001",
    status: "draft",
    kind: "deposit",
    total: 24_000,
    currency: "USD",
    issue_date: null,
    due_date: null,
    ...over,
  };
}

function context(over: Partial<OnboardingContext> = {}): OnboardingContext {
  return {
    client: { id: CLIENT_ID, name: "Northbridge Rail", lifecycle_stage: "Onboarding", status: "Active", owner: "Dana" },
    items: [],
    invoices: [],
    ...over,
  };
}

/* -------------------------------------------------------------------------- */
/* postWinStages                                                              */
/* -------------------------------------------------------------------------- */

describe("postWinStages", () => {
  // Derived from lifecycleStages rather than listed, so inserting a stage into
  // the journey — as "Invoicing" was — cannot leave this behind.
  it("runs from Invoicing to the end of the journey", () => {
    expect(postWinStages).toEqual(["Invoicing", "Onboarding", "Pilot / Setup", "Active Company", "Renewal / Expansion"]);
  });

  it("stays in step with lifecycleStages", () => {
    expect(postWinStages[0]).toBe("Invoicing");
    expect(postWinStages.at(-1)).toBe(lifecycleStages.at(-1));
    expect(postWinStages).toHaveLength(lifecycleStages.length - lifecycleStages.indexOf("Invoicing"));
  });

  it("excludes every pre-win stage", () => {
    for (const stage of ["Lead", "First Pitch", "Proposal Sent", "Signed / Won"]) {
      expect(postWinStages).not.toContain(stage);
    }
  });
});

describe("postWinItems", () => {
  // A checklist item for "Proposal sent" is the deal the lifecycle has just
  // finished, not onboarding work — counting it would make a fresh win read as
  // half onboarded.
  it("keeps only the items for post-win stages", () => {
    const items = [
      item({ lifecycle_stage: "Proposal Sent" }),
      item({ lifecycle_stage: "Invoicing" }),
      item({ lifecycle_stage: "Onboarding" }),
      item({ lifecycle_stage: "Lead" }),
    ];

    expect(postWinItems(items).map((row) => row.lifecycle_stage)).toEqual(["Invoicing", "Onboarding"]);
  });

  it("drops an unrecognised stage rather than counting it as onboarding", () => {
    expect(postWinItems([item({ lifecycle_stage: "Something Else" })])).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

describe("onboardingProgress", () => {
  it("counts completed items and rounds the percent", () => {
    const items = [item({ completed: true }), item({ completed: true }), item(), item()];

    expect(onboardingProgress(items)).toEqual({ done: 2, total: 4, percent: 50 });
  });

  it("reports zero rather than NaN when there is nothing to do", () => {
    expect(onboardingProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("reaches 100 only when every item is done", () => {
    expect(onboardingProgress([item({ completed: true })]).percent).toBe(100);
    expect(onboardingProgress([item({ completed: true }), item()]).percent).toBe(50);
  });
});

describe("outstandingItems", () => {
  it("keeps only what is unfinished, soonest due first", () => {
    const items = [
      item({ id: "a", due_date: "2026-09-10" }),
      item({ id: "b", completed: true }),
      item({ id: "c", due_date: "2026-09-01" }),
    ];

    expect(outstandingItems(items).map((row) => row.id)).toEqual(["c", "a"]);
  });

  // An undated item is not urgent-by-default; sorting it first would bury the
  // ones with a real deadline.
  it("puts undated items last", () => {
    const items = [item({ id: "a" }), item({ id: "b", due_date: "2026-09-01" })];

    expect(outstandingItems(items).map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("does not mutate the array it was given", () => {
    const items = [item({ id: "a", due_date: "2026-09-10" }), item({ id: "b", due_date: "2026-09-01" })];
    outstandingItems(items);

    expect(items.map((row) => row.id)).toEqual(["a", "b"]);
  });
});

describe("issuedInvoices", () => {
  it("counts issued and paid, not a draft or a void", () => {
    const invoices = [
      invoice({ id: "a", status: "draft" }),
      invoice({ id: "b", status: "issued" }),
      invoice({ id: "c", status: "paid" }),
      invoice({ id: "d", status: "void" }),
    ];

    expect(issuedInvoices(invoices).map((row) => row.id)).toEqual(["b", "c"]);
  });
});

/* -------------------------------------------------------------------------- */
/* handoffState                                                               */
/* -------------------------------------------------------------------------- */

describe("handoffState", () => {
  it("reads nothing done for a deal with no company", () => {
    expect(handoffState(context({ client: null }))).toEqual({
      hasClient: false,
      handedOver: false,
      billed: false,
      onboarded: false,
    });
  });

  // The company can be won on the lifecycle while its own board still says
  // Contract Sent. Saying "handed over" then would be a claim nobody made.
  it("is not handed over while the company is still pre-Invoicing on its board", () => {
    expect(handoffState(context({ client: { ...context().client!, lifecycle_stage: "Signed / Won" } })).handedOver).toBe(
      false,
    );
  });

  it("is handed over once the company reaches Invoicing or later", () => {
    for (const stage of postWinStages) {
      expect(handoffState(context({ client: { ...context().client!, lifecycle_stage: stage } })).handedOver).toBe(true);
    }
  });

  it("is billed only once an invoice has actually been issued", () => {
    expect(handoffState(context({ invoices: [invoice({ status: "draft" })] })).billed).toBe(false);
    expect(handoffState(context({ invoices: [invoice({ status: "issued" })] })).billed).toBe(true);
  });

  // An empty checklist is not a finished one — it usually means the seed never
  // ran. Reporting "onboarding complete" there would be the worst kind of wrong.
  it("is not onboarded when there are no items at all", () => {
    expect(handoffState(context({ items: [] })).onboarded).toBe(false);
  });

  it("is onboarded when every post-win item is complete, ignoring pre-win ones", () => {
    const state = handoffState(
      context({
        items: [
          item({ lifecycle_stage: "Proposal Sent", completed: false }),
          item({ lifecycle_stage: "Onboarding", completed: true }),
          item({ lifecycle_stage: "Invoicing", completed: true }),
        ],
      }),
    );

    expect(state.onboarded).toBe(true);
  });

  it("is not onboarded while one post-win item remains", () => {
    const state = handoffState(
      context({ items: [item({ lifecycle_stage: "Onboarding", completed: true }), item({ lifecycle_stage: "Pilot / Setup" })] }),
    );

    expect(state.onboarded).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* loadOnboardingContext                                                      */
/* -------------------------------------------------------------------------- */

interface StubResult {
  data?: unknown;
  error?: unknown;
}

function stubClient(routes: Record<string, StubResult>) {
  const tables: string[] = [];

  function builder(table: string) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const settle = () => {
      const route = routes[table] ?? {};
      return { data: route.data ?? null, error: route.error ?? null };
    };
    const api: any = {
      select: () => api,
      eq: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: () => Promise.resolve(settle()),
      then: (onFulfilled?: any, onRejected?: any) => Promise.resolve(settle()).then(onFulfilled, onRejected),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return api;
  }

  return {
    tables,
    from(table: string) {
      tables.push(table);
      return builder(table);
    },
  };
}

describe("loadOnboardingContext", () => {
  it("reads nothing at all for a deal with no company", async () => {
    const supabase = stubClient({});

    expect(await loadOnboardingContext(supabase, null)).toEqual({ client: null, items: [], invoices: [] });
    expect(supabase.tables).toEqual([]);
  });

  it("gathers the company, its checklist and its invoices", async () => {
    const supabase = stubClient({
      company_clients: { data: { id: CLIENT_ID, name: "Northbridge Rail", lifecycle_stage: "Onboarding", status: "Active", owner: "Dana" } },
      client_onboarding_items: { data: [item()] },
      client_invoices: { data: [invoice()] },
    });

    const result = await loadOnboardingContext(supabase, CLIENT_ID);

    expect(result.client?.name).toBe("Northbridge Rail");
    expect(result.items).toHaveLength(1);
    expect(result.invoices).toHaveLength(1);
  });

  // client_invoices ships in a migration of its own, so a deploy can land ahead
  // of it. A missing table must not take step 11 down.
  it("degrades to an empty list when a relation is missing", async () => {
    const supabase = stubClient({
      company_clients: { data: { id: CLIENT_ID, name: "Northbridge Rail", lifecycle_stage: "Onboarding", status: "Active", owner: null } },
      client_onboarding_items: { data: [item()] },
      // PGRST205 is what PostgREST returns for a table it cannot find, which is
      // the shape isMissingSchemaRelationError is written against.
      client_invoices: {
        error: { code: "PGRST205", message: "Could not find the table 'public.client_invoices' in the schema cache" },
      },
    });

    const result = await loadOnboardingContext(supabase, CLIENT_ID);

    expect(result.invoices).toEqual([]);
    expect(result.items).toHaveLength(1);
  });

  it("raises anything that is not a missing relation", async () => {
    const supabase = stubClient({
      company_clients: { data: null },
      client_onboarding_items: { error: { code: "42501", message: "permission denied" } },
      client_invoices: { data: [] },
    });

    await expect(loadOnboardingContext(supabase, CLIENT_ID)).rejects.toThrow("permission denied");
  });
});
