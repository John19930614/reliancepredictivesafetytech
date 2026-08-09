import { describe, expect, it } from "vitest";
import {
  companyDocumentName,
  emptyCompanyProfile,
  formatSellerContactBlock,
  isCompanyProfileBlank,
  missingCompanyProfileFields,
  toCompanyProfile,
  type CompanyProfile,
} from "./profile";

const profile = (overrides: Partial<CompanyProfile> = {}): CompanyProfile => ({
  ...emptyCompanyProfile,
  ...overrides,
});

describe("toCompanyProfile", () => {
  it("trims every field off an untrusted row", () => {
    const result = toCompanyProfile({ legal_name: "  Reliance LLC  ", city: " Sussex ", email: " a@b.test " });
    expect(result.legal_name).toBe("Reliance LLC");
    expect(result.city).toBe("Sussex");
    expect(result.email).toBe("a@b.test");
  });

  it("coerces non-strings and missing keys to empty, never to 'null'", () => {
    const result = toCompanyProfile({ legal_name: null, city: 42, phone: undefined });
    expect(result.legal_name).toBe("");
    expect(result.city).toBe("");
    expect(result.phone).toBe("");
  });

  it("returns a blank profile for a missing row rather than throwing", () => {
    // The editor must open even when the migration has not been applied here.
    expect(toCompanyProfile(null)).toEqual(emptyCompanyProfile);
    expect(toCompanyProfile(undefined)).toEqual(emptyCompanyProfile);
  });

  it("returns a fresh object each time, so a caller cannot mutate the frozen default", () => {
    const first = toCompanyProfile(null);
    first.city = "Somewhere";
    expect(toCompanyProfile(null).city).toBe("");
    expect(emptyCompanyProfile.city).toBe("");
  });
});

describe("companyDocumentName", () => {
  it("prefers the display name and falls back to the legal name", () => {
    expect(companyDocumentName(profile({ display_name: "Reliance", legal_name: "Reliance LLC" }))).toBe("Reliance");
    expect(companyDocumentName(profile({ legal_name: "Reliance LLC" }))).toBe("Reliance LLC");
  });

  it("returns '' rather than inventing a name", () => {
    expect(companyDocumentName(profile())).toBe("");
  });
});

describe("formatSellerContactBlock", () => {
  it("orders the block street, locality, then how to reach us", () => {
    expect(
      formatSellerContactBlock(
        profile({
          address_line1: "1 Main St",
          city: "Sussex",
          state: "Wisconsin",
          postal_code: "53089",
          phone: "262-555-0100",
          email: "hello@example.test",
          website: "example.test",
        }),
      ),
    ).toBe("1 Main St\nSussex, Wisconsin 53089\nPhone: 262-555-0100\nEmail: hello@example.test\nexample.test");
  });

  it("omits blank fields entirely rather than printing labelled placeholders", () => {
    expect(formatSellerContactBlock(profile({ city: "Sussex", state: "Wisconsin" }))).toBe("Sussex, Wisconsin");
    expect(formatSellerContactBlock(profile({ email: "hello@example.test" }))).toBe("Email: hello@example.test");
    expect(formatSellerContactBlock(profile())).toBe("");
  });

  it("drops a domestic country line", () => {
    expect(formatSellerContactBlock(profile({ city: "Sussex", country: "United States" }))).toBe("Sussex");
  });
});

describe("missingCompanyProfileFields", () => {
  it("names the gaps the seeded row deliberately leaves open", () => {
    // The 20260809101000 seed carries no street address or ZIP on purpose:
    // inventing an address for a legal entity is the exact bug being fixed.
    const seeded = profile({
      legal_name: "Reliance Predictive Safety Technologies LLC",
      city: "Sussex",
      state: "Wisconsin",
      email: "john.h.haldemann@gmail.com",
    });
    expect(missingCompanyProfileFields(seeded)).toEqual(["street address", "ZIP code", "phone number"]);
  });

  it("reports nothing once the record is complete", () => {
    expect(
      missingCompanyProfileFields(
        profile({
          legal_name: "Reliance LLC",
          address_line1: "1 Main St",
          city: "Sussex",
          state: "Wisconsin",
          postal_code: "53089",
          email: "hello@example.test",
          phone: "262-555-0100",
        }),
      ),
    ).toEqual([]);
  });
});

describe("isCompanyProfileBlank", () => {
  it("is true only when there is nothing worth putting on a document", () => {
    expect(isCompanyProfileBlank(profile())).toBe(true);
    expect(isCompanyProfileBlank(profile({ legal_name: "Reliance LLC" }))).toBe(false);
    expect(isCompanyProfileBlank(profile({ email: "hello@example.test" }))).toBe(false);
  });
});
