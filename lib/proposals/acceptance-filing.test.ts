import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/proposals/pdf", () => ({ renderProposalPdf: vi.fn(async () => new Uint8Array([1, 2, 3, 4])) }));
vi.mock("@/lib/proposals/team-server", () => ({
  resolveDocumentExtras: vi.fn(async () => ({ team: [], signature: null })),
}));
vi.mock("@/lib/audit/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/events")>();
  return { ...actual, recordAuditEvent: vi.fn(async () => {}) };
});

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/audit/events";
import { maxFileNameLength } from "@/lib/files/validation";
import type { GeneratorState } from "@/lib/proposals/generator-state";
import {
  acceptedProposalsFolderName,
  buildAcceptedProposalFileName,
  fileAcceptedProposalPdf,
} from "./acceptance-filing";

const adminMock = vi.mocked(createAdminClient);
const auditMock = vi.mocked(recordAuditEvent);
const revalidateMock = vi.mocked(revalidatePath);

const PROPOSAL_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const FOLDER_ID = "55555555-5555-4555-8555-555555555555";
const REVISION_ID = "66666666-6666-4666-8666-666666666666";

const validState: GeneratorState = { v: 1, fields: { clientCompany: "Acme" }, phases: [], services: [] };

// ---------------------------------------------------------------------------
// Chainable stand-in for the service-role client, following the pattern in
// app/employee/proposals/actions.test.ts, plus the storage upload/remove
// surface the filing helper uses.
// ---------------------------------------------------------------------------
interface QueryRecord {
  table: string;
  op: "select" | "insert";
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}

interface QueryResult {
  data?: unknown;
  error?: unknown;
}

type Route = QueryResult | ((query: QueryRecord) => QueryResult);

function createDbMock(routes: Record<string, Route>, storage: { upload?: () => QueryResult } = {}) {
  const calls: QueryRecord[] = [];
  const storageCalls: Array<{ op: string; bucket: string; args: unknown[] }> = [];

  function resolve(record: QueryRecord): { data: unknown; error: unknown } {
    const route = routes[`${record.table}:${record.op}`];
    const result = typeof route === "function" ? route(record) : route;
    return { data: result?.data ?? null, error: result?.error ?? null };
  }

  function builder(record: QueryRecord) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const api: any = {
      select: () => api,
      insert(payload: Record<string, unknown>) {
        record.op = "insert";
        record.payload = payload;
        return api;
      },
      eq(column: string, value: unknown) {
        record.filters.push([column, value]);
        return api;
      },
      is(column: string, value: unknown) {
        record.filters.push([`is:${column}`, value]);
        return api;
      },
      ilike(column: string, value: unknown) {
        record.filters.push([`ilike:${column}`, value]);
        return api;
      },
      limit: () => api,
      maybeSingle: () => Promise.resolve(resolve(record)),
      single: () => Promise.resolve(resolve(record)),
      then: (onFulfilled?: any, onRejected?: any) => Promise.resolve(resolve(record)).then(onFulfilled, onRejected),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return api;
  }

  return {
    calls,
    storageCalls,
    from(table: string) {
      const record: QueryRecord = { table, op: "select", filters: [] };
      calls.push(record);
      return builder(record);
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, body: unknown, options: unknown) {
            storageCalls.push({ op: "upload", bucket, args: [path, body, options] });
            return storage.upload?.() ?? { data: { path }, error: null };
          },
          async remove(paths: string[]) {
            storageCalls.push({ op: "remove", bucket, args: [paths] });
            return { data: null, error: null };
          },
        };
      },
    },
  };
}

type DbMock = ReturnType<typeof createDbMock>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useDb = (db: DbMock | null) => adminMock.mockReturnValue(db as any);

function proposalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROPOSAL_ID,
    title: "Acme Rollout",
    proposal_number: "SE-2026-01",
    client_id: CLIENT_ID,
    status: "accepted",
    current_revision: 3,
    valid_until: null,
    form_data: validState,
    accepted_at: "2026-08-09T12:00:00Z",
    accepted_revision_id: null,
    ...overrides,
  };
}

function uploads(db: DbMock) {
  return db.storageCalls.filter((call) => call.op === "upload");
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// File naming
// ---------------------------------------------------------------------------
describe("buildAcceptedProposalFileName", () => {
  it("joins the proposal number and title with the revision suffix", () => {
    expect(buildAcceptedProposalFileName("SE-2026-01", "Acme Rollout", 3)).toBe(
      "SE-2026-01 Acme Rollout (accepted v3).pdf",
    );
  });

  it("works without a proposal number", () => {
    expect(buildAcceptedProposalFileName(null, "Acme Rollout", 2)).toBe("Acme Rollout (accepted v2).pdf");
  });

  it("caps at the File Center name limit without ever truncating the suffix", () => {
    const name = buildAcceptedProposalFileName("SE-2026-01", "x".repeat(300), 12);
    expect(name.length).toBeLessThanOrEqual(maxFileNameLength);
    expect(name.endsWith(" (accepted v12).pdf")).toBe(true);
  });

  it("falls back to a generic base when the title sanitises to nothing", () => {
    expect(buildAcceptedProposalFileName(null, "///", 1)).toBe("Proposal (accepted v1).pdf");
  });

  it("defaults a non-finite revision to v1", () => {
    expect(buildAcceptedProposalFileName(null, "T", Number.NaN)).toBe("T (accepted v1).pdf");
  });
});

// ---------------------------------------------------------------------------
// Filing
// ---------------------------------------------------------------------------
describe("fileAcceptedProposalPdf", () => {
  it("returns an error rather than throwing when service credentials are missing", async () => {
    useDb(null);

    const result = await fileAcceptedProposalPdf({ proposalId: PROPOSAL_ID });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("credentials");
  });

  it("files the accepted PDF into the client's existing Proposals folder", async () => {
    const db = createDbMock({
      "client_proposals:select": { data: proposalRow() },
      "company_file_folders:select": { data: { id: FOLDER_ID } },
      "company_files:select": { data: [] },
      "company_files:insert": {},
    });
    useDb(db);

    const result = await fileAcceptedProposalPdf({ proposalId: PROPOSAL_ID, actorUserId: null });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBeFalsy();
    expect(result.fileId).toBeTruthy();

    const [upload] = uploads(db);
    expect(upload.bucket).toBe("file-center");
    expect(String(upload.args[0]).startsWith(`client/${CLIENT_ID}/`)).toBe(true);
    expect(upload.args[2]).toMatchObject({ contentType: "application/pdf", upsert: false });

    const insert = db.calls.find((c) => c.table === "company_files" && c.op === "insert");
    expect(insert?.payload).toMatchObject({
      scope: "client",
      client_id: CLIENT_ID,
      folder_id: FOLDER_ID,
      name: "SE-2026-01 Acme Rollout (accepted v3).pdf",
      storage_bucket: "file-center",
      mime_type: "application/pdf",
      size_bytes: 4,
      uploaded_by: null,
    });

    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(revalidateMock).toHaveBeenCalledWith("/employee/files");
  });

  it("creates the Proposals folder when the client has none", async () => {
    const db = createDbMock({
      "client_proposals:select": { data: proposalRow() },
      "company_file_folders:select": { data: null },
      "company_file_folders:insert": { data: { id: FOLDER_ID } },
      "company_files:select": { data: [] },
      "company_files:insert": {},
    });
    useDb(db);

    const result = await fileAcceptedProposalPdf({ proposalId: PROPOSAL_ID, actorUserId: "user-9" });

    expect(result.ok).toBe(true);
    const folderInsert = db.calls.find((c) => c.table === "company_file_folders" && c.op === "insert");
    expect(folderInsert?.payload).toEqual({
      scope: "client",
      client_id: CLIENT_ID,
      parent_id: null,
      name: acceptedProposalsFolderName,
      created_by: "user-9",
    });
    const fileInsert = db.calls.find((c) => c.table === "company_files" && c.op === "insert");
    expect(fileInsert?.payload).toMatchObject({ folder_id: FOLDER_ID, uploaded_by: "user-9" });
  });

  it("skips without writing when an identically named copy is already filed", async () => {
    const db = createDbMock({
      "client_proposals:select": { data: proposalRow() },
      "company_file_folders:select": { data: { id: FOLDER_ID } },
      "company_files:select": { data: [{ id: "existing-1" }] },
    });
    useDb(db);

    const result = await fileAcceptedProposalPdf({ proposalId: PROPOSAL_ID });

    expect(result).toEqual({ ok: true, skipped: true, fileId: "existing-1" });
    expect(uploads(db)).toHaveLength(0);
    expect(db.calls.some((c) => c.op === "insert")).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("files under the company scope when the proposal has no client", async () => {
    const db = createDbMock({
      "client_proposals:select": { data: proposalRow({ client_id: null }) },
      "company_file_folders:select": { data: { id: FOLDER_ID } },
      "company_files:select": { data: [] },
      "company_files:insert": {},
    });
    useDb(db);

    const result = await fileAcceptedProposalPdf({ proposalId: PROPOSAL_ID });

    expect(result.ok).toBe(true);
    expect(String(uploads(db)[0].args[0]).startsWith("company/")).toBe(true);
    const insert = db.calls.find((c) => c.table === "company_files" && c.op === "insert");
    expect(insert?.payload).toMatchObject({ scope: "company", client_id: null });
  });

  it("renders the accepted revision when the caller names one", async () => {
    const db = createDbMock({
      // The working copy is deliberately unusable: only the revision's state
      // can make this succeed, proving the revision is what got rendered.
      "client_proposals:select": { data: proposalRow({ form_data: null }) },
      "client_proposal_revisions:select": { data: { revision_number: 2, form_data: validState } },
      "company_file_folders:select": { data: { id: FOLDER_ID } },
      "company_files:select": { data: [] },
      "company_files:insert": {},
    });
    useDb(db);

    const result = await fileAcceptedProposalPdf({ proposalId: PROPOSAL_ID, revisionId: REVISION_ID });

    expect(result.ok).toBe(true);
    const revisionQuery = db.calls.find((c) => c.table === "client_proposal_revisions");
    expect(revisionQuery?.filters).toEqual([
      ["id", REVISION_ID],
      ["proposal_id", PROPOSAL_ID],
    ]);
    const insert = db.calls.find((c) => c.table === "company_files" && c.op === "insert");
    expect(insert?.payload?.name).toBe("SE-2026-01 Acme Rollout (accepted v2).pdf");
  });

  it("fails cleanly when the proposal has no usable document content", async () => {
    const db = createDbMock({
      "client_proposals:select": { data: proposalRow({ form_data: null }) },
    });
    useDb(db);

    const result = await fileAcceptedProposalPdf({ proposalId: PROPOSAL_ID });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("no saved document content");
    expect(uploads(db)).toHaveLength(0);
  });

  it("cleans up the storage object when the row insert fails", async () => {
    const db = createDbMock({
      "client_proposals:select": { data: proposalRow() },
      "company_file_folders:select": { data: { id: FOLDER_ID } },
      "company_files:select": { data: [] },
      "company_files:insert": { error: { message: "boom" } },
    });
    useDb(db);

    const result = await fileAcceptedProposalPdf({ proposalId: PROPOSAL_ID });

    expect(result).toEqual({ ok: false, error: "boom" });
    const remove = db.storageCalls.find((call) => call.op === "remove");
    expect(remove?.args[0]).toEqual([uploads(db)[0].args[0]]);
    expect(auditMock).not.toHaveBeenCalled();
  });
});
