import { describe, expect, it } from "vitest";
import {
  clientCodePattern,
  formatClientDocumentNumber,
  formatClientInvoiceNumber,
  isValidClientCode,
  normalizeClientCode,
  suggestClientCode,
} from "./client-codes";

describe("normalizeClientCode / isValidClientCode", () => {
  // Case is preserved deliberately: "Wondfo" is the point, and upper-casing it
  // would make every document reference shout.
  it("trims without changing case", () => {
    expect(normalizeClientCode("  Wondfo ")).toBe("Wondfo");
    expect(normalizeClientCode("wondfo")).toBe("wondfo");
    expect(isValidClientCode("Wondfo")).toBe(true);
    expect(isValidClientCode(" SE ")).toBe(true);
  });

  it("accepts 2-24 letters or digits, starting with a letter", () => {
    for (const good of ["SE", "Wondfo", "JMBrennan", "Acme2", "A".repeat(24)]) {
      expect(isValidClientCode(good)).toBe(true);
    }
  });

  // The code is embedded in a reference that gets typed into emails,
  // spreadsheets and bank memos; anything needing escaping causes trouble
  // somewhere downstream.
  it("rejects anything with a space, punctuation, a leading digit or the wrong length", () => {
    for (const bad of ["", "H", "2Fast", "H-N", "H N", "Wondfo USA", "A".repeat(25), 12, null, undefined]) {
      expect(isValidClientCode(bad)).toBe(false);
    }
  });

  it("the pattern matches the migration's CHECK constraint", () => {
    expect(clientCodePattern.source).toBe("^[A-Za-z][A-Za-z0-9]{1,23}$");
  });
});

describe("formatClientDocumentNumber", () => {
  it("reads Code-Year-NNN", () => {
    expect(formatClientDocumentNumber("Wondfo", 2026, 1)).toBe("Wondfo-2026-001");
    expect(formatClientDocumentNumber("Wondfo", 2026, 42)).toBe("Wondfo-2026-042");
  });

  it("preserves the code's case rather than shouting it", () => {
    expect(formatClientDocumentNumber("Wondfo", 2026, 1)).toContain("Wondfo");
    expect(formatClientDocumentNumber("Wondfo", 2026, 1)).not.toContain("WONDFO");
  });

  // A fixed-width pad that TRUNCATED would mint a duplicate reference, which on
  // a financial document is the worst failure available.
  it("grows past 999 instead of truncating", () => {
    expect(formatClientDocumentNumber("Wondfo", 2026, 1000)).toBe("Wondfo-2026-1000");
  });

  it("floors a zero or negative sequence at 1", () => {
    expect(formatClientDocumentNumber("Wondfo", 2026, 0)).toBe("Wondfo-2026-001");
    expect(formatClientDocumentNumber("Wondfo", 2026, -3)).toBe("Wondfo-2026-001");
  });
});

describe("formatClientInvoiceNumber", () => {
  it("carries an INV marker so a quote cannot be mistaken for a demand", () => {
    expect(formatClientInvoiceNumber("Wondfo", 2026, 1)).toBe("Wondfo-INV-2026-001");
  });

  // Proposals and invoices keep separate sequences, so the marker is the only
  // thing preventing one string from naming two different documents.
  it("never collides with a proposal number at the same sequence", () => {
    expect(formatClientInvoiceNumber("Wondfo", 2026, 1)).not.toBe(formatClientDocumentNumber("Wondfo", 2026, 1));
  });
});

describe("suggestClientCode", () => {
  // The moniker is what people actually call the company, and it is now printed
  // in full on every document — "Wondfo USA" is Wondfo, not WFU.
  it("prefers the readable first word", () => {
    expect(suggestClientCode("Wondfo USA")).toBe("Wondfo");
    expect(suggestClientCode("Hunzinger")).toBe("Hunzinger");
    expect(suggestClientCode("Staff Electric")).toBe("Staff");
  });

  it("title-cases whatever the name's own casing was", () => {
    expect(suggestClientCode("hunzinger construction, inc.")).toBe("Hunzinger");
    expect(suggestClientCode("WONDFO USA")).toBe("Wondfo");
  });

  it("walks to a compound, then to initials, when the first word is taken", () => {
    expect(suggestClientCode("Staff Electric", ["Staff"])).toBe("StaffElectric");
    expect(suggestClientCode("Staff Electric", ["Staff", "StaffElectric"])).toBe("SE");
    expect(suggestClientCode("Staff Electric Company", ["Staff", "StaffElectric", "SE"])).toBe("SEC");
  });

  // The database index is case-insensitive, so a suggestion differing only in
  // case would be rejected on save — offering it would waste the assigner's time.
  it("never suggests a taken code regardless of its casing", () => {
    expect(suggestClientCode("Wondfo USA", ["wondfo"])).toBe("WondfoUsa");
  });

  it("returns empty when nothing valid remains", () => {
    expect(suggestClientCode("")).toBe("");
    expect(suggestClientCode("42")).toBe("");
    expect(suggestClientCode(undefined)).toBe("");
  });
});
