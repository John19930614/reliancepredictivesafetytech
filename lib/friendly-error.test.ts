import { describe, expect, it } from "vitest";
import { friendlyError } from "./friendly-error";

describe("friendlyError", () => {
  it("returns the fallback for unknown errors — never the raw database string", () => {
    expect(friendlyError({ code: "XX000", message: "deadlock detected" }, "Could not save the record.")).toBe(
      "Could not save the record.",
    );
    expect(friendlyError(null, "Could not save.")).toBe("Could not save.");
    expect(friendlyError(undefined, "Could not save.")).toBe("Could not save.");
  });

  it("translates the recognised Postgres codes", () => {
    expect(friendlyError({ code: "23505", message: "duplicate key value violates unique constraint \"x\"" }, "f")).toBe(
      "That record already exists.",
    );
    expect(friendlyError({ code: "42501", message: "permission denied" }, "f")).toBe(
      "You do not have permission to do that.",
    );
    expect(friendlyError({ code: "23503", message: "…" }, "f")).toContain("linked record");
    expect(friendlyError({ code: "23514", message: "…" }, "f")).toContain("not accepted");
  });

  it("recognises RLS and duplicate-key failures by message when the code is missing", () => {
    expect(friendlyError({ message: 'new row violates row-level security policy for table "t"' }, "f")).toBe(
      "You do not have permission to do that.",
    );
    expect(friendlyError({ message: "duplicate key value violates unique constraint" }, "f")).toBe(
      "That record already exists.",
    );
  });
});
