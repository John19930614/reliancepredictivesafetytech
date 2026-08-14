import { describe, expect, it } from "vitest";
import {
  companySlugPattern,
  companySlugRule,
  formatInvoiceNumber,
  formatProposalNumber,
  isValidCompanySlug,
  normalizeCompanySlug,
  parseInvoiceNumber,
  parseProposalNumber,
  suggestCompanySlug,
} from "./company-slug";

/** Everything a form, a server action or a hostile caller might hand these functions. */
const hostileValues: unknown[] = [
  null,
  undefined,
  0,
  42,
  NaN,
  Infinity,
  true,
  false,
  {},
  { slug: "WONDFOUSA" },
  [],
  ["WONDFOUSA"],
  () => "WONDFOUSA",
];

const longName = "Q".repeat(500);
const sqlish = "Robert'); DROP TABLE company_clients;--";
const htmlish = "<script>alert('xss')</script>";
const emoji = "🏗️🚧";

describe("companySlugPattern / normalizeCompanySlug / isValidCompanySlug", () => {
  it("the pattern matches the migration's CHECK constraint", () => {
    // company_clients_company_slug_format in
    // 20260815140000_company_slug_document_numbering.sql.
    expect(companySlugPattern.source).toBe("^[A-Z0-9]{2,40}$");
  });

  it("uppercases and strips everything that is not A-Z0-9", () => {
    expect(normalizeCompanySlug("Wondfo USA, Inc.")).toBe("WONDFOUSAINC");
    expect(normalizeCompanySlug("  staff electric  ")).toBe("STAFFELECTRIC");
    expect(normalizeCompanySlug("3M")).toBe("3M");
    expect(normalizeCompanySlug("A-B_C/D")).toBe("ABCD");
  });

  it("returns empty for anything that is not a string", () => {
    for (const bad of hostileValues) {
      expect(normalizeCompanySlug(bad)).toBe("");
    }
  });

  it("is idempotent — normalizing a normalized slug changes nothing", () => {
    const inputs = ["Wondfo USA, Inc.", "WONDFOUSA", "", emoji, sqlish, htmlish, longName, "3M Co."];
    for (const input of inputs) {
      const once = normalizeCompanySlug(input);
      expect(normalizeCompanySlug(once)).toBe(once);
      expect(normalizeCompanySlug(normalizeCompanySlug(once))).toBe(once);
    }
  });

  it("does NOT validate — it will happily return an unusable slug", () => {
    // Too short and too long both survive normalization; that is what
    // isValidCompanySlug is for.
    expect(normalizeCompanySlug("A!")).toBe("A");
    expect(normalizeCompanySlug(longName)).toHaveLength(500);
    expect(isValidCompanySlug(normalizeCompanySlug("A!"))).toBe(false);
    expect(isValidCompanySlug(normalizeCompanySlug(longName))).toBe(false);
  });

  it("strips every character that could carry SQL or HTML meaning", () => {
    for (const value of [sqlish, htmlish, "'; --", '"><img src=x onerror=1>']) {
      expect(normalizeCompanySlug(value)).toMatch(/^[A-Z0-9]*$/);
    }
    expect(normalizeCompanySlug(sqlish)).toBe("ROBERTDROPTABLECOMPANYCLIENTS");
    expect(normalizeCompanySlug(htmlish)).toBe("SCRIPTALERTXSSSCRIPT");
  });

  it("accepts a normalized slug of 2 to 40 characters", () => {
    for (const good of ["AB", "3M", "42", "WONDFOUSA", "HUNZINGERCONSTRUCTION", "Z".repeat(40)]) {
      expect(isValidCompanySlug(good)).toBe(true);
    }
  });

  it("rejects anything the CHECK constraint would reject", () => {
    for (const bad of ["", "W", "Z".repeat(41), "wondfousa", "WONDFO USA", "WONDFO-USA", "WONDFO.", emoji]) {
      expect(isValidCompanySlug(bad)).toBe(false);
    }
  });

  it("rejects non-strings rather than normalizing them into validity", () => {
    // Deliberately stricter than isValidClientCode: normalizing here DELETES
    // characters, so a lenient check would bless a value the column refuses.
    for (const bad of hostileValues) {
      expect(isValidCompanySlug(bad)).toBe(false);
    }
    expect(isValidCompanySlug(" WONDFOUSA ")).toBe(false);
    expect(isValidCompanySlug(normalizeCompanySlug(" WONDFOUSA "))).toBe(true);
  });

  it("states the rule in a form a human can be shown", () => {
    expect(companySlugRule).toContain("WONDFOUSA");
    expect(companySlugRule.length).toBeGreaterThan(20);
  });
});

describe("suggestCompanySlug", () => {
  it("handles the three names the 2026-08-14 call worked through", () => {
    expect(suggestCompanySlug("Wondfo USA, Inc.")).toBe("WONDFOUSA");
    expect(suggestCompanySlug("Hunzinger Construction Company")).toBe("HUNZINGERCONSTRUCTION");
    expect(suggestCompanySlug("Staff Electric Company Incorporated")).toBe("STAFFELECTRIC");
  });

  it("strips each recognised legal form, punctuated or not", () => {
    for (const suffix of [
      "Inc",
      "Inc.",
      "Incorporated",
      "LLC",
      "L.L.C.",
      "LLP",
      "PLLC",
      "LP",
      "Ltd",
      "Ltd.",
      "Limited",
      "Corp",
      "Corp.",
      "Corporation",
      "Co",
      "Co.",
      "Company",
    ]) {
      expect(suggestCompanySlug(`Wondfo USA ${suffix}`)).toBe("WONDFOUSA");
      expect(suggestCompanySlug(`Wondfo USA, ${suffix}`)).toBe("WONDFOUSA");
    }
  });

  it("strips trailing legal forms repeatedly", () => {
    expect(suggestCompanySlug("Staff Electric Co Inc")).toBe("STAFFELECTRIC");
    expect(suggestCompanySlug("Staff Electric Company, LLC, Inc.")).toBe("STAFFELECTRIC");
  });

  it("keeps trade words, which are what tell two clients apart", () => {
    // "Construction" and "Electric" are not legal forms and never get stripped.
    expect(suggestCompanySlug("Hunzinger Construction")).toBe("HUNZINGERCONSTRUCTION");
    expect(suggestCompanySlug("Staff Electric")).toBe("STAFFELECTRIC");
    expect(suggestCompanySlug("Acme Services Group Holdings")).toBe("ACMESERVICESGROUPHOLDINGS");
  });

  it("matches whole words only", () => {
    expect(suggestCompanySlug("Costco")).toBe("COSTCO");
    expect(suggestCompanySlug("Incline Village Electric")).toBe("INCLINEVILLAGEELECTRIC");
    expect(suggestCompanySlug("Corporate Interiors")).toBe("CORPORATEINTERIORS");
  });

  it("yields nothing for a name that is only a legal form", () => {
    // LLC is not an identity. Minting it would give one client a prefix every
    // other unnamed client would also land on.
    for (const nothing of ["LLC", "Inc.", "Company", "Inc, LLC", "🏗️ LLC"]) {
      expect(suggestCompanySlug(nothing)).toBe("");
    }
  });

  it("keeps digits", () => {
    expect(suggestCompanySlug("3M Company")).toBe("3M");
    expect(suggestCompanySlug("J2 Global, Inc.")).toBe("J2GLOBAL");
  });

  it("caps at the pattern's 40-character ceiling", () => {
    const suggestion = suggestCompanySlug(`${"Q".repeat(45)} Incorporated`);
    expect(suggestion).toHaveLength(40);
    expect(isValidCompanySlug(suggestion)).toBe(true);

    const fromLongName = suggestCompanySlug(longName);
    expect(fromLongName).toHaveLength(40);
    expect(isValidCompanySlug(fromLongName)).toBe(true);
  });

  it("returns empty rather than inventing or padding a slug", () => {
    for (const nothing of ["", " ", "A", "A Inc.", "!!!", "-", ".", emoji, "🏗️ LLC"]) {
      expect(suggestCompanySlug(nothing)).toBe("");
    }
  });

  it("returns empty for anything that is not a string", () => {
    for (const bad of hostileValues) {
      expect(suggestCompanySlug(bad as string)).toBe("");
    }
  });

  it("only ever returns a storable slug or nothing", () => {
    const names = [
      "Wondfo USA, Inc.",
      "Hunzinger Construction Company",
      "Staff Electric Company Incorporated",
      sqlish,
      htmlish,
      longName,
      emoji,
      "",
      "A",
      "3M Company",
      "Smith & Sons, L.L.C.",
      "Café Ltd",
    ];
    for (const name of names) {
      const suggestion = suggestCompanySlug(name);
      expect(suggestion === "" || isValidCompanySlug(suggestion)).toBe(true);
    }
  });

  it("cannot be talked into emitting SQL or HTML metacharacters", () => {
    expect(suggestCompanySlug(sqlish)).toBe("ROBERTDROPTABLECOMPANYCLIENTS");
    expect(suggestCompanySlug(htmlish)).toBe("SCRIPTALERTXSSSCRIPT");
  });
});

describe("formatProposalNumber", () => {
  it("zero-pads the sequence to three digits", () => {
    expect(formatProposalNumber("WONDFOUSA", 2026, 1)).toBe("WONDFOUSA-2026-001");
    expect(formatProposalNumber("WONDFOUSA", 2026, 12)).toBe("WONDFOUSA-2026-012");
    expect(formatProposalNumber("STAFFELECTRIC", 2027, 7)).toBe("STAFFELECTRIC-2027-007");
  });

  it("grows past 999 instead of truncating", () => {
    // The failure mode this guards, and the reason the SQL says
    // greatest(3, length(v_seq::text)): a bare three-char pad turns 1000 into
    // "100", which is already a live proposal number.
    expect(formatProposalNumber("WONDFOUSA", 2026, 999)).toBe("WONDFOUSA-2026-999");
    expect(formatProposalNumber("WONDFOUSA", 2026, 1000)).toBe("WONDFOUSA-2026-1000");
    expect(formatProposalNumber("WONDFOUSA", 2026, 10000)).toBe("WONDFOUSA-2026-10000");
    expect(formatProposalNumber("WONDFOUSA", 2026, 1000)).not.toBe(
      formatProposalNumber("WONDFOUSA", 2026, 100),
    );
  });

  it("normalizes the slug it is given", () => {
    expect(formatProposalNumber("wondfo usa", 2026, 1)).toBe("WONDFOUSA-2026-001");
    expect(formatProposalNumber(" Wondfo-USA ", 2026, 1)).toBe("WONDFOUSA-2026-001");
  });

  it("never emits a zero, negative or non-numeric sequence", () => {
    expect(formatProposalNumber("WONDFOUSA", 2026, 0)).toBe("WONDFOUSA-2026-001");
    expect(formatProposalNumber("WONDFOUSA", 2026, -3)).toBe("WONDFOUSA-2026-001");
    expect(formatProposalNumber("WONDFOUSA", 2026, 2.9)).toBe("WONDFOUSA-2026-002");
    expect(formatProposalNumber("WONDFOUSA", 2026, NaN)).toBe("WONDFOUSA-2026-001");
    expect(formatProposalNumber("WONDFOUSA", 2026, Infinity)).toBe("WONDFOUSA-2026-001");
    expect(formatProposalNumber("WONDFOUSA", 2026, undefined as unknown as number)).toBe(
      "WONDFOUSA-2026-001",
    );
  });

  it("emits an unparseable year rather than a plausible wrong one", () => {
    for (const badYear of [NaN, undefined as unknown as number, 0, -2026]) {
      const number = formatProposalNumber("WONDFOUSA", badYear, 1);
      expect(number).toBe("WONDFOUSA-0000-001");
      expect(parseProposalNumber(number)).toBeNull();
    }
  });

  it("produces a number the parser refuses when the slug was never valid", () => {
    for (const badSlug of ["", "A", emoji, "!!"]) {
      expect(parseProposalNumber(formatProposalNumber(badSlug, 2026, 1))).toBeNull();
    }
  });
});

describe("formatInvoiceNumber", () => {
  it("zero-pads the sequence to two digits", () => {
    expect(formatInvoiceNumber("WONDFOUSA-2026-001", 1)).toBe("WONDFOUSA-2026-001-01");
    expect(formatInvoiceNumber("WONDFOUSA-2026-001", 9)).toBe("WONDFOUSA-2026-001-09");
  });

  it("grows past 99 instead of truncating", () => {
    // greatest(2, length(v_seq::text)) in the SQL. A bare two-char pad turns
    // 100 into "10" — a second invoice claiming an issued invoice's number.
    expect(formatInvoiceNumber("WONDFOUSA-2026-001", 99)).toBe("WONDFOUSA-2026-001-99");
    expect(formatInvoiceNumber("WONDFOUSA-2026-001", 100)).toBe("WONDFOUSA-2026-001-100");
    expect(formatInvoiceNumber("WONDFOUSA-2026-001", 1000)).toBe("WONDFOUSA-2026-001-1000");
    expect(formatInvoiceNumber("WONDFOUSA-2026-001", 100)).not.toBe(
      formatInvoiceNumber("WONDFOUSA-2026-001", 10),
    );
  });

  it("keeps the parent's hyphens and only trims and uppercases it", () => {
    expect(formatInvoiceNumber("  wondfousa-2026-001  ", 1)).toBe("WONDFOUSA-2026-001-01");
  });

  it("never emits a zero, negative or non-numeric sequence", () => {
    expect(formatInvoiceNumber("WONDFOUSA-2026-001", 0)).toBe("WONDFOUSA-2026-001-01");
    expect(formatInvoiceNumber("WONDFOUSA-2026-001", -1)).toBe("WONDFOUSA-2026-001-01");
    expect(formatInvoiceNumber("WONDFOUSA-2026-001", NaN)).toBe("WONDFOUSA-2026-001-01");
  });

  it("produces a number the parser refuses when the parent was never valid", () => {
    for (const badParent of ["", "HUN-01", "RPS-2026-0007", emoji]) {
      expect(parseInvoiceNumber(formatInvoiceNumber(badParent, 1))).toBeNull();
    }
    expect(parseInvoiceNumber(formatInvoiceNumber(null as unknown as string, 1))).toBeNull();
  });
});

describe("parseProposalNumber", () => {
  it("reads back what formatProposalNumber wrote", () => {
    const cases: Array<[string, number, number]> = [
      ["WONDFOUSA", 2026, 1],
      ["WONDFOUSA", 2026, 99],
      ["HUNZINGERCONSTRUCTION", 2026, 999],
      ["HUNZINGERCONSTRUCTION", 2026, 1000],
      ["STAFFELECTRIC", 2027, 10000],
      ["3M", 2026, 1],
      ["Z".repeat(40), 9999, 7],
    ];
    for (const [slug, year, seq] of cases) {
      expect(parseProposalNumber(formatProposalNumber(slug, year, seq))).toEqual({ slug, year, seq });
    }
  });

  it("accepts the grown sequence band without a leading zero", () => {
    expect(parseProposalNumber("WONDFOUSA-2026-1000")).toEqual({
      slug: "WONDFOUSA",
      year: 2026,
      seq: 1000,
    });
  });

  it("refuses the legacy schemes so the two can never be confused", () => {
    // HUN-01 — the 2026-08-07 per-client code. No year field at all.
    expect(parseProposalNumber("HUN-01")).toBeNull();
    expect(parseProposalNumber("SEC-12")).toBeNull();
    // RPS-2026-0007 — the global scheme. Four sequence digits with a leading
    // zero is the shape this scheme never emits, and that is the discriminator.
    expect(parseProposalNumber("RPS-2026-0007")).toBeNull();
    expect(parseProposalNumber("RPS-2026-0001")).toBeNull();
    expect(parseProposalNumber("WONDFOUSA-2026-0007")).toBeNull();
    // RPS-INV-2026-0001 — a legacy invoice. Second field is not a year.
    expect(parseProposalNumber("RPS-INV-2026-0001")).toBeNull();
    // And an invoice number in this scheme is not a proposal number either.
    expect(parseProposalNumber("WONDFOUSA-2026-001-01")).toBeNull();
  });

  it("refuses a zeroth document and an impossible year", () => {
    expect(parseProposalNumber("WONDFOUSA-2026-000")).toBeNull();
    expect(parseProposalNumber("WONDFOUSA-0000-001")).toBeNull();
    expect(parseProposalNumber("WONDFOUSA-026-001")).toBeNull();
    expect(parseProposalNumber("WONDFOUSA-20260-001")).toBeNull();
  });

  it("refuses malformed and out-of-range slugs", () => {
    for (const bad of [
      "W-2026-001",
      `${"Z".repeat(41)}-2026-001`,
      "WONDFO USA-2026-001",
      "WONDFO_USA-2026-001",
      "-2026-001",
      "WONDFOUSA-2026-",
      "WONDFOUSA-2026",
      "WONDFOUSA",
      "WONDFOUSA-2026-001-",
      "WONDFOUSA-2026-1.5",
      "WONDFOUSA-2026-00A",
    ]) {
      expect(parseProposalNumber(bad)).toBeNull();
    }
  });

  it("tolerates surrounding whitespace and casing from a pasted reference", () => {
    expect(parseProposalNumber("  wondfousa-2026-001 ")).toEqual({
      slug: "WONDFOUSA",
      year: 2026,
      seq: 1,
    });
  });

  it("returns null for hostile input rather than throwing", () => {
    for (const bad of [...hostileValues, sqlish, htmlish, emoji, longName]) {
      expect(parseProposalNumber(bad)).toBeNull();
    }
  });
});

describe("parseInvoiceNumber", () => {
  it("reads back what formatInvoiceNumber wrote", () => {
    const cases: Array<[string, number]> = [
      ["WONDFOUSA-2026-001", 1],
      ["WONDFOUSA-2026-001", 9],
      ["WONDFOUSA-2026-001", 99],
      ["WONDFOUSA-2026-001", 100],
      ["HUNZINGERCONSTRUCTION-2026-1000", 1000],
      ["3M-2026-001", 6],
    ];
    for (const [proposalNumber, seq] of cases) {
      expect(parseInvoiceNumber(formatInvoiceNumber(proposalNumber, seq))).toEqual({
        proposalNumber,
        seq,
      });
    }
  });

  it("hands back a parent that itself parses — the chain always resolves", () => {
    const invoice = formatInvoiceNumber(formatProposalNumber("WONDFOUSA", 2026, 4), 9);
    expect(invoice).toBe("WONDFOUSA-2026-004-09");

    const parsed = parseInvoiceNumber(invoice);
    expect(parsed).toEqual({ proposalNumber: "WONDFOUSA-2026-004", seq: 9 });
    expect(parseProposalNumber(parsed!.proposalNumber)).toEqual({
      slug: "WONDFOUSA",
      year: 2026,
      seq: 4,
    });
  });

  it("refuses the legacy schemes so the two can never be confused", () => {
    // RPS-INV-2026-0001 — the legacy global invoice.
    expect(parseInvoiceNumber("RPS-INV-2026-0001")).toBeNull();
    expect(parseInvoiceNumber("RPS-INV-2026-0007")).toBeNull();
    // HUN-01 is a legacy proposal number, not an invoice against parent "HUN".
    expect(parseInvoiceNumber("HUN-01")).toBeNull();
    expect(parseInvoiceNumber("HUN-01-01")).toBeNull();
    // An invoice against a parent that still carries a legacy number. The SQL
    // allocator can mint this (RPS-2026-0007 has invoices too); it is not a
    // current-scheme number and callers must handle the null.
    expect(parseInvoiceNumber("RPS-2026-0007-01")).toBeNull();
    // A four-digit zero-padded tail is the legacy sequence shape.
    expect(parseInvoiceNumber("WONDFOUSA-2026-001-0001")).toBeNull();
  });

  it("refuses a proposal number, and a proposal number refuses an invoice", () => {
    // A slug carries no hyphen, so proposals have exactly three fields and
    // invoices exactly four. Neither parser can ever claim the other's number.
    const proposal = formatProposalNumber("WONDFOUSA", 2026, 1);
    const grown = formatProposalNumber("WONDFOUSA", 2026, 100);
    const invoice = formatInvoiceNumber(proposal, 1);

    expect(parseInvoiceNumber(proposal)).toBeNull();
    expect(parseInvoiceNumber(grown)).toBeNull();
    expect(parseProposalNumber(invoice)).toBeNull();
  });

  it("refuses a zeroth invoice and a malformed tail", () => {
    for (const bad of [
      "WONDFOUSA-2026-001-00",
      "WONDFOUSA-2026-001-0",
      "WONDFOUSA-2026-001-",
      "WONDFOUSA-2026-001-1A",
      "WONDFOUSA-2026-001-01-01",
      "WONDFOUSA-2026-0001-01",
      "-01",
      "01",
      "-",
    ]) {
      expect(parseInvoiceNumber(bad)).toBeNull();
    }
  });

  it("tolerates surrounding whitespace and casing from a pasted reference", () => {
    expect(parseInvoiceNumber(" wondfousa-2026-001-01 ")).toEqual({
      proposalNumber: "WONDFOUSA-2026-001",
      seq: 1,
    });
  });

  it("returns null for hostile input rather than throwing", () => {
    for (const bad of [...hostileValues, sqlish, htmlish, emoji, longName]) {
      expect(parseInvoiceNumber(bad)).toBeNull();
    }
  });
});

describe("the scheme end to end", () => {
  it("numbers a real client's first proposal and its nine invoices", () => {
    const slug = suggestCompanySlug("Wondfo USA, Inc.");
    expect(slug).toBe("WONDFOUSA");
    expect(isValidCompanySlug(slug)).toBe(true);

    const proposal = formatProposalNumber(slug, 2026, 1);
    expect(proposal).toBe("WONDFOUSA-2026-001");

    const invoices = Array.from({ length: 9 }, (_, index) =>
      formatInvoiceNumber(proposal, index + 1),
    );
    expect(invoices[0]).toBe("WONDFOUSA-2026-001-01");
    expect(invoices[8]).toBe("WONDFOUSA-2026-001-09");
    expect(new Set(invoices).size).toBe(9);

    for (const invoice of invoices) {
      expect(parseInvoiceNumber(invoice)!.proposalNumber).toBe(proposal);
    }
  });

  it("never mints the same string for two different sequences", () => {
    const numbers = new Set<string>();
    for (let seq = 1; seq <= 2000; seq += 1) {
      numbers.add(formatProposalNumber("WONDFOUSA", 2026, seq));
    }
    expect(numbers.size).toBe(2000);

    const invoiceNumbers = new Set<string>();
    for (let seq = 1; seq <= 2000; seq += 1) {
      invoiceNumbers.add(formatInvoiceNumber("WONDFOUSA-2026-001", seq));
    }
    expect(invoiceNumbers.size).toBe(2000);
  });

  it("keeps every year's sequences apart", () => {
    expect(formatProposalNumber("WONDFOUSA", 2026, 1)).not.toBe(
      formatProposalNumber("WONDFOUSA", 2027, 1),
    );
  });
});
