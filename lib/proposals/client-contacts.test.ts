import { describe, expect, it } from "vitest";
import {
  clientFieldIds,
  defaultContactsForCompany,
  formatAddressLines,
  formatAddressText,
  formatClientContactLine,
  isRenderableContact,
  maxClientContacts,
  normalizeClientContact,
  parseClientContacts,
  serializeClientContacts,
  type ClientCompanyDetail,
} from "./client-contacts";

const contact = (name: string, title = "", email = "", phone = "") => ({ name, title, email, phone });

describe("normalizeClientContact", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeClientContact({ name: "  Kevin   Sanducker ", title: " Safety\tDirector " })).toEqual({
      name: "Kevin Sanducker",
      title: "Safety Director",
      email: "",
      phone: "",
    });
  });

  it("strips the characters the encoding uses as structure", () => {
    // A pipe or a newline inside a name would split one record into two, and
    // the second half would print as somebody who does not exist.
    expect(normalizeClientContact({ name: "Kevin | Sanducker", title: "Safety\nDirector" })).toEqual({
      name: "Kevin Sanducker",
      title: "Safety Director",
      email: "",
      phone: "",
    });
  });

  it("coerces non-strings to empty rather than to 'undefined'", () => {
    expect(normalizeClientContact({ name: undefined, title: null as never })).toEqual({
      name: "",
      title: "",
      email: "",
      phone: "",
    });
  });

  it("caps each field at its column length", () => {
    const long = "x".repeat(500);
    const normalized = normalizeClientContact({ name: long, email: long });
    expect(normalized.name).toHaveLength(160);
    expect(normalized.email).toHaveLength(254);
  });
});

describe("serialize / parse round trip", () => {
  it("round-trips a full record", () => {
    const people = [contact("Kevin Sanducker", "Safety Director", "kevin@hunzinger.test", "262-555-0134")];
    const encoded = serializeClientContacts(people);
    expect(encoded).toBe("Kevin Sanducker | Safety Director | kevin@hunzinger.test | 262-555-0134");
    expect(parseClientContacts({ [clientFieldIds.contacts]: encoded })).toEqual(people);
  });

  it("drops trailing empty fields but keeps the positions of interior ones", () => {
    // The interior separator MUST survive: without it "Jo | jo@x" would parse
    // with the email as the job title.
    expect(serializeClientContacts([contact("Jo Kim")])).toBe("Jo Kim");
    expect(serializeClientContacts([contact("Jo Kim", "", "jo@x.test")])).toBe("Jo Kim |  | jo@x.test");

    const parsed = parseClientContacts({ [clientFieldIds.contacts]: "Jo Kim |  | jo@x.test" });
    expect(parsed).toEqual([contact("Jo Kim", "", "jo@x.test")]);
  });

  it("keeps several people in the seller's chosen order", () => {
    const encoded = serializeClientContacts([
      contact("Kevin Sanducker", "Safety Director"),
      contact("Pat Vance", "Project Executive"),
    ]);
    expect(encoded.split("\n")).toHaveLength(2);
    expect(parseClientContacts({ [clientFieldIds.contacts]: encoded }).map((c) => c.name)).toEqual([
      "Kevin Sanducker",
      "Pat Vance",
    ]);
  });

  it("drops nameless records at both ends", () => {
    expect(serializeClientContacts([contact(""), contact("  "), contact("Jo")])).toBe("Jo");
    expect(parseClientContacts({ [clientFieldIds.contacts]: "\n | Safety Director | x@y.test\nJo\n" })).toEqual([
      contact("Jo"),
    ]);
  });

  it("deduplicates the same person, however they were added", () => {
    // Easy to produce: tick a CRM contact, then type them in by hand.
    const encoded = serializeClientContacts([
      contact("Kevin Sanducker", "Safety Director", "kevin@x.test"),
      contact("KEVIN SANDUCKER", "Safety Director", "Kevin@X.test"),
    ]);
    expect(encoded.split("\n")).toHaveLength(1);
  });

  it("caps the list at maxClientContacts on the way in and out", () => {
    const many = Array.from({ length: 12 }, (_, index) => contact(`Person ${index}`));
    expect(serializeClientContacts(many).split("\n")).toHaveLength(maxClientContacts);
    const overlong = many.map((c) => c.name).join("\n");
    expect(parseClientContacts({ [clientFieldIds.contacts]: overlong })).toHaveLength(maxClientContacts);
  });
});

describe("parseClientContacts legacy fallback", () => {
  it("reads the pre-multi-contact fields when the list is absent", () => {
    // Historical revisions are immutable and still carry these three fields, so
    // the fallback has to keep working for as long as revisions are renderable.
    expect(
      parseClientContacts({
        [clientFieldIds.legacyContact]: "Dana Reyes",
        [clientFieldIds.legacyTitle]: "Safety Director",
        [clientFieldIds.legacyEmail]: "dana@acme.test",
      }),
    ).toEqual([contact("Dana Reyes", "Safety Director", "dana@acme.test")]);
  });

  it("prefers the list over the legacy fields when both are present", () => {
    expect(
      parseClientContacts({
        [clientFieldIds.contacts]: "Kevin Sanducker",
        [clientFieldIds.legacyContact]: "Dana Reyes",
      }).map((c) => c.name),
    ).toEqual(["Kevin Sanducker"]);
  });

  it("returns [] rather than null for a missing, blank or malformed state", () => {
    expect(parseClientContacts(null)).toEqual([]);
    expect(parseClientContacts(undefined)).toEqual([]);
    expect(parseClientContacts({})).toEqual([]);
    expect(parseClientContacts({ [clientFieldIds.contacts]: "   " })).toEqual([]);
    expect(parseClientContacts({ [clientFieldIds.contacts]: 42 as never })).toEqual([]);
  });
});

describe("formatClientContactLine", () => {
  it("joins name and title with an em dash and appends the email", () => {
    expect(formatClientContactLine(contact("Kevin Sanducker", "Safety Director", "kevin@x.test"))).toBe(
      "Kevin Sanducker — Safety Director · kevin@x.test",
    );
  });

  it("omits the parts that are missing rather than printing separators", () => {
    expect(formatClientContactLine(contact("Jo Kim"))).toBe("Jo Kim");
    expect(formatClientContactLine(contact("Jo Kim", "PM"))).toBe("Jo Kim — PM");
    expect(formatClientContactLine(contact("Jo Kim", "", "jo@x.test"))).toBe("Jo Kim · jo@x.test");
  });

  it("never prints the phone number — a proposal is not a contact sheet", () => {
    expect(formatClientContactLine(contact("Jo Kim", "PM", "jo@x.test", "262-555-0134"))).not.toContain("262");
  });
});

describe("formatAddressLines", () => {
  it("puts the city, state and ZIP on one correctly punctuated line", () => {
    expect(
      formatAddressLines({
        address_line1: "1400 W Canal St",
        address_line2: "Suite 200",
        city: "Milwaukee",
        state: "WI",
        postal_code: "53233",
      }),
    ).toEqual(["1400 W Canal St", "Suite 200", "Milwaukee, WI 53233"]);
  });

  it("collapses missing parts instead of leaving stray commas", () => {
    expect(formatAddressLines({ city: "Sussex", state: "Wisconsin" })).toEqual(["Sussex, Wisconsin"]);
    expect(formatAddressLines({ state: "WI", postal_code: "53233" })).toEqual(["WI 53233"]);
    expect(formatAddressLines({ address_line1: "1 Main St" })).toEqual(["1 Main St"]);
  });

  it("omits a domestic country but keeps a foreign one", () => {
    expect(formatAddressLines({ city: "Sussex", country: "United States" })).toEqual(["Sussex"]);
    expect(formatAddressLines({ city: "Sussex", country: "usa" })).toEqual(["Sussex"]);
    expect(formatAddressLines({ city: "Toronto", country: "Canada" })).toEqual(["Toronto", "Canada"]);
  });

  it("returns [] for nothing at all, so the document prints no empty line", () => {
    expect(formatAddressLines(null)).toEqual([]);
    expect(formatAddressLines(undefined)).toEqual([]);
    expect(formatAddressLines({})).toEqual([]);
    expect(formatAddressLines({ city: "   ", state: "" })).toEqual([]);
    expect(formatAddressText({})).toBe("");
  });
});

describe("defaultContactsForCompany", () => {
  const company = (overrides: Partial<ClientCompanyDetail>): ClientCompanyDetail => ({
    id: "c1",
    name: "Hunzinger",
    addressText: "",
    contacts: [],
    legacyContactName: "",
    legacyContactEmail: "",
    ...overrides,
  });

  it("picks the primary contact when there is one", () => {
    const result = defaultContactsForCompany(
      company({
        contacts: [
          { id: "a", isPrimary: false, ...contact("Pat Vance", "Project Executive") },
          { id: "b", isPrimary: true, ...contact("Kevin Sanducker", "Safety Director") },
        ],
      }),
    );
    expect(result.map((c) => c.name)).toEqual(["Kevin Sanducker"]);
  });

  it("falls back to the first contact when none is flagged primary", () => {
    const result = defaultContactsForCompany(
      company({ contacts: [{ id: "a", isPrimary: false, ...contact("Pat Vance") }] }),
    );
    expect(result.map((c) => c.name)).toEqual(["Pat Vance"]);
  });

  it("falls back to the legacy single contact on company_clients", () => {
    expect(
      defaultContactsForCompany(company({ legacyContactName: "Sue", legacyContactEmail: "sue@staff.test" })),
    ).toEqual([contact("Sue", "", "sue@staff.test")]);
  });

  it("returns [] when there is genuinely nobody on file", () => {
    expect(defaultContactsForCompany(company({}))).toEqual([]);
    expect(defaultContactsForCompany(null)).toEqual([]);
  });
});

describe("isRenderableContact", () => {
  it("requires a name — the one field the document cannot do without", () => {
    expect(isRenderableContact(contact("Jo"))).toBe(true);
    expect(isRenderableContact(contact("", "Safety Director", "jo@x.test"))).toBe(false);
  });
});
