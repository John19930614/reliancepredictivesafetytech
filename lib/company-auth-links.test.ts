import { describe, expect, it } from "vitest";
import { buildCompanyAuthLink, getSafeCompanyAuthNext } from "./company-auth-links";

describe("company auth links", () => {
  it("builds invite links that require password creation", () => {
    const link = new URL(buildCompanyAuthLink("https://example.com", "token-123", "invite"));

    expect(link.pathname).toBe("/auth/confirm");
    expect(link.searchParams.get("token_hash")).toBe("token-123");
    expect(link.searchParams.get("type")).toBe("invite");
    expect(link.searchParams.get("next")).toBe("/auth/update-password?mode=invite");
  });

  it("does not let invite confirmations bypass password creation", () => {
    expect(getSafeCompanyAuthNext("/employee", "invite")).toBe("/auth/update-password?mode=invite");
    expect(getSafeCompanyAuthNext("/employee/users", "invite")).toBe("/auth/update-password?mode=invite");
    expect(getSafeCompanyAuthNext("/auth/update-password?mode=invite", "invite")).toBe("/auth/update-password?mode=invite");
  });

  it("keeps recovery confirmations on the password update page", () => {
    expect(getSafeCompanyAuthNext("/employee", "recovery")).toBe("/auth/update-password");
    expect(getSafeCompanyAuthNext("/auth/update-password", "recovery")).toBe("/auth/update-password");
  });

  it("allows normal email links to continue to employee routes only", () => {
    expect(getSafeCompanyAuthNext("/employee/settings", "email")).toBe("/employee/settings");
    expect(getSafeCompanyAuthNext("https://example.org/employee", "email")).toBe("/employee");
    expect(getSafeCompanyAuthNext("/employee-login", "email")).toBe("/employee");
  });
});
