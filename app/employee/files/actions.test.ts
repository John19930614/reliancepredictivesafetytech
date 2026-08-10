import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/files/access", () => ({ getFileCenterAccess: vi.fn() }));
vi.mock("@/lib/audit/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/events")>();
  return { ...actual, recordAuditEvent: vi.fn(async () => {}) };
});

import { getFileCenterAccess } from "@/lib/files/access";
import { maxFileSizeBytes } from "@/lib/files/validation";
import { createUploadTicket, finalizeUpload } from "./actions";

const getAccessMock = vi.mocked(getFileCenterAccess);

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const FOLDER_ID = "44444444-4444-4444-8444-444444444444";
const FILE_ID = "33333333-3333-4333-8333-333333333333";

// ---------------------------------------------------------------------------
// Minimal chainable stand-in for the Supabase client, following the pattern in
// app/employee/proposals/actions.test.ts, extended with the storage surface
// the upload actions use (createSignedUploadUrl / info / remove).
// ---------------------------------------------------------------------------
interface QueryRecord {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}

interface QueryResult {
  data?: unknown;
  error?: unknown;
}

type Route = QueryResult | ((query: QueryRecord) => QueryResult);

interface StorageBehavior {
  createSignedUploadUrl?: (path: string) => { data?: { signedUrl?: string } | null; error?: { message: string } | null };
  info?: (path: string) => { data?: Record<string, unknown> | null; error?: { message: string } | null };
  remove?: (paths: string[]) => { data?: unknown; error?: unknown };
}

function createSupabaseMock(routes: Record<string, Route>, storage: StorageBehavior = {}) {
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
          async createSignedUploadUrl(path: string) {
            storageCalls.push({ op: "createSignedUploadUrl", bucket, args: [path] });
            return (
              storage.createSignedUploadUrl?.(path) ?? {
                data: { signedUrl: `https://storage.test/object/upload/sign/${bucket}/${path}?token=tok` },
                error: null,
              }
            );
          },
          async info(path: string) {
            storageCalls.push({ op: "info", bucket, args: [path] });
            return storage.info?.(path) ?? { data: { size: 1024, contentType: "application/pdf" }, error: null };
          },
          async remove(paths: string[]) {
            storageCalls.push({ op: "remove", bucket, args: [paths] });
            return storage.remove?.(paths) ?? { data: null, error: null };
          },
        };
      },
    },
  };
}

type SupabaseMock = ReturnType<typeof createSupabaseMock>;

function signIn(supabase: unknown, flags = { canRead: true, canManage: true, canDelete: false }) {
  getAccessMock.mockResolvedValue({
    supabase,
    userId: "user-1",
    role: "employee",
    isActive: true,
    flags,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function signOut() {
  getAccessMock.mockResolvedValue({
    supabase: null,
    userId: null,
    role: null,
    isActive: false,
    flags: { canRead: false, canManage: false, canDelete: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function removeCalls(supabase: SupabaseMock) {
  return supabase.storageCalls.filter((call) => call.op === "remove");
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------
describe("upload RBAC", () => {
  it("rejects both actions when signed out", async () => {
    signOut();
    expect(await createUploadTicket({ scope: "company", fileName: "a.pdf", sizeBytes: 10, mimeType: "application/pdf" })).toEqual({
      ok: false,
      error: "You must be signed in.",
    });
    signOut();
    expect(await finalizeUpload({ fileId: FILE_ID, scope: "company", fileName: "a.pdf" })).toEqual({
      ok: false,
      error: "You must be signed in.",
    });
  });

  it("rejects both actions without the manage capability and never queries", async () => {
    const supabase = createSupabaseMock({});
    signIn(supabase, { canRead: true, canManage: false, canDelete: false });

    expect((await createUploadTicket({ scope: "company", fileName: "a.pdf", sizeBytes: 10, mimeType: "application/pdf" })).ok).toBe(false);
    expect((await finalizeUpload({ fileId: FILE_ID, scope: "company", fileName: "a.pdf" })).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
    expect(supabase.storageCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createUploadTicket
// ---------------------------------------------------------------------------
describe("createUploadTicket", () => {
  it("rejects an oversized file before touching storage", async () => {
    const supabase = createSupabaseMock({});
    signIn(supabase);

    const result = await createUploadTicket({
      scope: "company",
      fileName: "big.pdf",
      sizeBytes: maxFileSizeBytes + 1,
      mimeType: "application/pdf",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("too large");
    expect(supabase.storageCalls).toHaveLength(0);
  });

  it("rejects a disallowed mime type", async () => {
    const supabase = createSupabaseMock({});
    signIn(supabase);

    const result = await createUploadTicket({
      scope: "company",
      fileName: "tool.exe",
      sizeBytes: 10,
      mimeType: "application/x-msdownload",
    });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.file).toBe("This file type is not allowed.");
  });

  it("rejects a name with no usable characters", async () => {
    const supabase = createSupabaseMock({});
    signIn(supabase);

    const result = await createUploadTicket({ scope: "company", fileName: "///", sizeBytes: 10, mimeType: "application/pdf" });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.file).toContain("no usable characters");
  });

  it("requires a client for client-scope uploads", async () => {
    const supabase = createSupabaseMock({});
    signIn(supabase);

    const result = await createUploadTicket({ scope: "client", fileName: "a.pdf", sizeBytes: 10, mimeType: "application/pdf" });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Pick a client for client files.");
  });

  it("issues a ticket whose storage path embeds the minted id (company scope)", async () => {
    const supabase = createSupabaseMock({});
    signIn(supabase);

    const result = await createUploadTicket({
      scope: "company",
      fileName: "Q3 Report.pdf",
      sizeBytes: 5 * 1024 * 1024,
      mimeType: "application/pdf",
    });

    expect(result.ok).toBe(true);
    expect(result.ticket).toBeTruthy();
    expect(result.ticket?.storagePath).toBe(`company/${result.ticket?.fileId}-Q3-Report.pdf`);
    expect(result.ticket?.signedUrl).toContain("token=");
    expect(supabase.storageCalls).toEqual([
      { op: "createSignedUploadUrl", bucket: "file-center", args: [result.ticket?.storagePath] },
    ]);
  });

  it("issues a ticket under the client prefix after validating client and folder", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: { id: CLIENT_ID } },
      "company_file_folders:select": { data: { id: FOLDER_ID, scope: "client", client_id: CLIENT_ID } },
    });
    signIn(supabase);

    const result = await createUploadTicket({
      scope: "client",
      clientId: CLIENT_ID,
      folderId: FOLDER_ID,
      fileName: "site-audit.pdf",
      sizeBytes: 10,
      mimeType: "application/pdf",
    });

    expect(result.ok).toBe(true);
    expect(result.ticket?.storagePath.startsWith(`client/${CLIENT_ID}/`)).toBe(true);
  });

  it("rejects a folder that belongs to a different location", async () => {
    const supabase = createSupabaseMock({
      "company_file_folders:select": { data: { id: FOLDER_ID, scope: "client", client_id: CLIENT_ID } },
    });
    signIn(supabase);

    const result = await createUploadTicket({
      scope: "company",
      folderId: FOLDER_ID,
      fileName: "a.pdf",
      sizeBytes: 10,
      mimeType: "application/pdf",
    });

    expect(result).toEqual({ ok: false, error: "That folder is not in this file area." });
    expect(supabase.storageCalls).toHaveLength(0);
  });

  it("surfaces a storage refusal", async () => {
    const supabase = createSupabaseMock(
      {},
      { createSignedUploadUrl: () => ({ data: null, error: { message: "storage down" } }) },
    );
    signIn(supabase);

    const result = await createUploadTicket({ scope: "company", fileName: "a.pdf", sizeBytes: 10, mimeType: "application/pdf" });

    expect(result).toEqual({ ok: false, error: "storage down" });
  });
});

// ---------------------------------------------------------------------------
// finalizeUpload
// ---------------------------------------------------------------------------
describe("finalizeUpload", () => {
  const path = `company/${FILE_ID}-Report.pdf`;
  const baseInput = { fileId: FILE_ID, scope: "company" as const, fileName: "Report.pdf" };

  it("rejects a malformed upload reference before any query", async () => {
    const supabase = createSupabaseMock({});
    signIn(supabase);

    const result = await finalizeUpload({ ...baseInput, fileId: "not-a-uuid" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Malformed upload reference");
    expect(supabase.calls).toHaveLength(0);
  });

  it("fails when the object never landed in storage, and writes no row", async () => {
    const supabase = createSupabaseMock(
      { "company_files:insert": { data: { id: FILE_ID } } },
      { info: () => ({ data: null, error: { message: "not found" } }) },
    );
    signIn(supabase);

    const result = await finalizeUpload(baseInput);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("never reached storage");
    expect(supabase.calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("records the size and type storage reports, never what the caller claims", async () => {
    const supabase = createSupabaseMock(
      { "company_files:insert": { data: { id: FILE_ID } } },
      { info: () => ({ data: { size: 2048, contentType: "text/csv" }, error: null }) },
    );
    signIn(supabase);

    const result = await finalizeUpload({ ...baseInput, description: " keep " });

    expect(result).toEqual({ ok: true, fileId: FILE_ID });
    const insert = supabase.calls.find((c) => c.op === "insert");
    expect(insert?.payload).toMatchObject({
      id: FILE_ID,
      scope: "company",
      client_id: null,
      folder_id: null,
      name: "Report.pdf",
      storage_bucket: "file-center",
      storage_path: path,
      mime_type: "text/csv",
      size_bytes: 2048,
      description: "keep",
      uploaded_by: "user-1",
    });
  });

  it("reads snake_case info fields from older storage clients", async () => {
    const supabase = createSupabaseMock(
      { "company_files:insert": { data: { id: FILE_ID } } },
      { info: () => ({ data: { size: 10, content_type: "application/pdf" }, error: null }) },
    );
    signIn(supabase);

    expect((await finalizeUpload(baseInput)).ok).toBe(true);
    expect(supabase.calls.find((c) => c.op === "insert")?.payload?.mime_type).toBe("application/pdf");
  });

  it("removes the object and fails when the stored object exceeds the size limit", async () => {
    const supabase = createSupabaseMock(
      {},
      { info: () => ({ data: { size: maxFileSizeBytes + 1, contentType: "application/pdf" }, error: null }) },
    );
    signIn(supabase);

    const result = await finalizeUpload(baseInput);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("too large");
    expect(removeCalls(supabase)).toEqual([{ op: "remove", bucket: "file-center", args: [[path]] }]);
    expect(supabase.calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("removes the object and fails when the stored type is not allowed", async () => {
    const supabase = createSupabaseMock(
      {},
      { info: () => ({ data: { size: 5, contentType: "application/x-sh" }, error: null }) },
    );
    signIn(supabase);

    const result = await finalizeUpload(baseInput);

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.file).toBe("This file type is not allowed.");
    expect(removeCalls(supabase)).toHaveLength(1);
  });

  it("treats a unique violation as an already-filed retry and keeps the object", async () => {
    const supabase = createSupabaseMock({
      "company_files:insert": { error: { code: "23505", message: "duplicate key value" } },
    });
    signIn(supabase);

    const result = await finalizeUpload(baseInput);

    expect(result).toEqual({ ok: true, fileId: FILE_ID });
    expect(removeCalls(supabase)).toHaveLength(0);
  });

  it("cleans up the object when the insert fails for any other reason", async () => {
    const supabase = createSupabaseMock({
      "company_files:insert": { error: { code: "42501", message: "permission denied" } },
    });
    signIn(supabase);

    const result = await finalizeUpload(baseInput);

    expect(result).toEqual({ ok: false, error: "permission denied" });
    expect(removeCalls(supabase)).toEqual([{ op: "remove", bucket: "file-center", args: [[path]] }]);
  });

  it("re-validates the folder against the location on finalize", async () => {
    const supabase = createSupabaseMock({
      "company_file_folders:select": { data: { id: FOLDER_ID, scope: "client", client_id: CLIENT_ID } },
    });
    signIn(supabase);

    const result = await finalizeUpload({ ...baseInput, folderId: FOLDER_ID });

    expect(result).toEqual({ ok: false, error: "That folder is not in this file area." });
    expect(supabase.calls.some((c) => c.op === "insert")).toBe(false);
  });
});
