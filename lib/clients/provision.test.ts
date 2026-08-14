import { describe, expect, it } from "vitest";
import { acceptedProposalsFolderName, clientFolderNames, clientFolderTemplate } from "./folder-template";
import { provisionClient, provisionWarning, type ProvisionClientResult } from "./provision";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";

/* -------------------------------------------------------------------------- */
/* Folder template                                                            */
/* -------------------------------------------------------------------------- */

describe("clientFolderTemplate", () => {
  it("seeds the five folders the platform's own workflows use", () => {
    expect(clientFolderNames).toEqual(["Proposals", "Contracts", "Invoices", "Safety Docs", "Onboarding"]);
  });

  // If these ever spelled it differently, an accepted proposal would mint a
  // SECOND folder beside the seeded one and a client's contracts would split
  // across two places that look identical in the tree.
  it("spells the proposals folder exactly as the acceptance filer does", () => {
    expect(clientFolderNames).toContain(acceptedProposalsFolderName);
  });

  it("has no duplicate names, which the sibling-name unique index would reject", () => {
    const lowered = clientFolderNames.map((name) => name.toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
  });

  it("keeps every name inside the File Center's 120-character limit", () => {
    for (const folder of clientFolderTemplate) {
      expect(folder.name.length).toBeGreaterThan(0);
      expect(folder.name.length).toBeLessThanOrEqual(120);
      expect(folder.purpose.length).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Supabase stand-in                                                          */
/* -------------------------------------------------------------------------- */

interface Call {
  table: string;
  op: "insert" | "select";
  payload?: unknown;
}

interface Route {
  data?: unknown;
  error?: unknown;
}

function stubClient(routes: Record<string, Route>) {
  const calls: Call[] = [];

  function builder(table: string) {
    const record: Call = { table, op: "select" };
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const settle = () => {
      const route = routes[table] ?? {};
      return { data: route.data ?? null, error: route.error ?? null };
    };
    const api: any = {
      insert(payload: unknown) {
        record.op = "insert";
        record.payload = payload;
        calls.push(record);
        return api;
      },
      select: () => api,
      maybeSingle: () => Promise.resolve(settle()),
      then: (onFulfilled?: any, onRejected?: any) => Promise.resolve(settle()).then(onFulfilled, onRejected),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return api;
  }

  return {
    calls,
    from: (table: string) => builder(table),
    find: (table: string) => calls.find((call) => call.table === table),
  };
}

/** Every dependent write succeeds. */
function happyRoutes() {
  return {
    company_clients: { data: { id: CLIENT_ID } },
    client_onboarding_items: { data: [{ id: "a" }, { id: "b" }] },
    company_file_folders: { data: [{ id: "f1" }, { id: "f2" }, { id: "f3" }, { id: "f4" }, { id: "f5" }] },
    company_profiles: { data: null },
  };
}

/* -------------------------------------------------------------------------- */
/* provisionClient                                                            */
/* -------------------------------------------------------------------------- */

describe("provisionClient", () => {
  it("creates the company, its checklist, its folders and its profile", async () => {
    const supabase = stubClient(happyRoutes());

    const result = await provisionClient(supabase, USER_ID, { name: "Northbridge Rail" });

    expect(result.ok).toBe(true);
    expect(result.clientId).toBe(CLIENT_ID);
    expect(result.onboarding.ok).toBe(true);
    expect(result.folders.ok).toBe(true);
    expect(result.profile.ok).toBe(true);
    expect(provisionWarning(result)).toBeNull();
  });

  it("starts a new company at Lead unless told otherwise", async () => {
    const supabase = stubClient(happyRoutes());
    await provisionClient(supabase, USER_ID, { name: "Northbridge Rail" });

    expect(supabase.find("company_clients")?.payload).toMatchObject({ lifecycle_stage: "Lead", source: "Manual" });
  });

  it("honours an explicit stage and source", async () => {
    const supabase = stubClient(happyRoutes());
    await provisionClient(supabase, USER_ID, {
      name: "Northbridge Rail",
      lifecycleStage: "Demo Scheduled",
      source: "Demo Request",
    });

    expect(supabase.find("company_clients")?.payload).toMatchObject({
      lifecycle_stage: "Demo Scheduled",
      source: "Demo Request",
    });
  });

  // The insert policy on company_file_folders requires created_by = auth.uid().
  // Satisfying it honestly is the reason this runs as the caller rather than
  // reaching for the service-role key.
  it("attributes every folder to the caller", async () => {
    const supabase = stubClient(happyRoutes());
    await provisionClient(supabase, USER_ID, { name: "Northbridge Rail" });

    const rows = supabase.find("company_file_folders")?.payload as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row).toMatchObject({ scope: "client", client_id: CLIENT_ID, parent_id: null, created_by: USER_ID });
    }
    expect(rows.map((row) => row.name)).toEqual(clientFolderNames);
  });

  it("seeds the profile empty rather than guessing at the numbers", async () => {
    const supabase = stubClient(happyRoutes());
    await provisionClient(supabase, USER_ID, { name: "Northbridge Rail" });

    expect(supabase.find("company_profiles")?.payload).toEqual({ client_id: CLIENT_ID, updated_by: USER_ID });
  });

  it("stamps the checklist with the owner and an increasing sort order", async () => {
    const supabase = stubClient(happyRoutes());
    await provisionClient(supabase, USER_ID, { name: "Northbridge Rail", owner: "Dana" });

    const rows = supabase.find("client_onboarding_items")?.payload as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({ client_id: CLIENT_ID, owner: "Dana", sort_order: 10 });
    expect(rows[1].sort_order).toBe(20);
  });
});

/* -------------------------------------------------------------------------- */
/* Failure handling                                                           */
/* -------------------------------------------------------------------------- */

describe("when the company itself cannot be created", () => {
  it("reports the failure and never attempts the dependent writes", async () => {
    const supabase = stubClient({ company_clients: { error: { message: "permission denied" } } });

    const result = await provisionClient(supabase, USER_ID, { name: "Northbridge Rail" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("permission denied");
    expect(result.clientId).toBeUndefined();
    // Nothing to clean up, because nothing else was attempted.
    expect(supabase.find("client_onboarding_items")).toBeUndefined();
    expect(supabase.find("company_file_folders")).toBeUndefined();
    expect(supabase.find("company_profiles")).toBeUndefined();
  });

  it("refuses a blank or over-long name without querying", async () => {
    const supabase = stubClient(happyRoutes());

    expect((await provisionClient(supabase, USER_ID, { name: "   " })).ok).toBe(false);
    expect((await provisionClient(supabase, USER_ID, { name: "x".repeat(201) })).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });
});

describe("when a dependent write fails", () => {
  // The old seedOnboarding never read its own result, so a client could end up
  // with no checklist — and therefore unable to clear a single stage gate —
  // with nothing anywhere saying why.
  it("still reports the client as created, but flags the checklist", async () => {
    const supabase = stubClient({
      ...happyRoutes(),
      client_onboarding_items: { error: { message: "insert failed" } },
    });

    const result = await provisionClient(supabase, USER_ID, { name: "Northbridge Rail" });

    expect(result.ok).toBe(true);
    expect(result.clientId).toBe(CLIENT_ID);
    expect(result.onboarding.ok).toBe(false);
    expect(provisionWarning(result)).toContain("onboarding checklist");
  });

  it("names every piece that fell over, not just the first", async () => {
    const supabase = stubClient({
      ...happyRoutes(),
      client_onboarding_items: { error: { message: "no" } },
      company_file_folders: { error: { message: "no" } },
      company_profiles: { error: { message: "no" } },
    });

    const warning = provisionWarning(await provisionClient(supabase, USER_ID, { name: "Northbridge Rail" }));

    expect(warning).toContain("onboarding checklist");
    expect(warning).toContain("File Center folders");
    expect(warning).toContain("company profile");
  });

  // A folder of that name already existing means the tree is fine — there is
  // simply nothing to add. That is success, not failure.
  it("treats an existing folder name as nothing to do", async () => {
    const supabase = stubClient({ ...happyRoutes(), company_file_folders: { error: { code: "23505" } } });

    const result = await provisionClient(supabase, USER_ID, { name: "Northbridge Rail" });

    expect(result.folders.ok).toBe(true);
    expect(result.folders.created).toBe(0);
    expect(provisionWarning(result)).toBeNull();
  });

  it("treats an existing profile row the same way", async () => {
    const supabase = stubClient({ ...happyRoutes(), company_profiles: { error: { code: "23505" } } });

    const result = await provisionClient(supabase, USER_ID, { name: "Northbridge Rail" });

    expect(result.profile.ok).toBe(true);
    expect(provisionWarning(result)).toBeNull();
  });
});

describe("provisionWarning", () => {
  function result(over: Partial<ProvisionClientResult> = {}): ProvisionClientResult {
    return {
      ok: true,
      clientId: CLIENT_ID,
      onboarding: { ok: true, created: 17 },
      folders: { ok: true, created: 5 },
      profile: { ok: true, created: 1 },
      ...over,
    };
  }

  it("is silent when everything landed", () => {
    expect(provisionWarning(result())).toBeNull();
  });

  it("reads as one sentence for two failures", () => {
    const warning = provisionWarning(
      result({ folders: { ok: false, created: 0 }, profile: { ok: false, created: 0 } }),
    );

    expect(warning).toContain("File Center folders and the company profile");
  });
});
