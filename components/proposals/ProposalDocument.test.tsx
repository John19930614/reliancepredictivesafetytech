// Render tests for the client-facing contractual document.
//
// `proposal-document-model.test.ts` already covers the view-model arithmetic and
// string building. Nothing here re-tests that: these assertions are about the
// RENDERED OUTPUT — the thing a client actually reads and signs — which had no
// coverage at all before the jsdom project existed (see vitest.config.ts).
//
// What that buys, concretely:
//   * a fee row or totals row silently dropped from the JSX is caught, even
//     though the model would still compute it;
//   * `$NaN` / `undefined` / `null` reaching the page is caught for degenerate
//     and hand-edited states;
//   * the historical-revision banner is caught if it stops distinguishing an
//     archived snapshot from the live proposal;
//   * a legal term rendering with an empty interpolation ("limited to , and…")
//     is caught.

import { describe, expect, it } from "vitest";
import { render, within } from "@testing-library/react";
import type { GeneratorState } from "@/lib/proposals/generator-state";
import type { ProposalDocumentProps } from "./ProposalDocument";
import { ProposalDocument } from "./ProposalDocument";

const PROPOSAL_ID = "11111111-1111-4111-8111-111111111111";

const subject: ProposalDocumentProps["proposal"] = {
  id: PROPOSAL_ID,
  title: "Northwind Construction — Platform Proposal",
  status: "sent",
  currentRevision: 5,
  validUntil: "2026-05-01",
};

/**
 * A realistic saved state. The numbers are chosen so every stage of the totals
 * chain lands on a distinct, hand-checkable figure:
 *
 *   package  1 × $12,000 = $12,000   (annualPrice overrides the catalog price)
 *   phase    2 ×  $1,500 =  $3,000
 *   service  3 ×    $250 =    $750
 *   subtotal            = $15,750
 *   −10% discount       =  $1,575  → taxable $14,175
 *   +5% tax             =    $708.75
 *   total               = $14,883.75
 *   25% deposit         =  $3,720.94
 *
 * They are written out literally below rather than recomputed with
 * computeProposalTotals(), so this file checks the document against arithmetic
 * an accountant can follow, not against the same function it renders from.
 */
function wellFormedState(): GeneratorState {
  return {
    v: 1,
    fields: {
      sellerName: "Reliance Predictive Safety Technologies",
      preparedBy: "Dana Reyes",
      sellerContact: "1 Reliance Plaza\nMadison, WI 53703",
      clientCompany: "Northwind Construction",
      clientContact: "Sam Okafor",
      clientTitle: "VP Safety",
      clientEmail: "sam@northwind.example",
      clientAddress: "500 Harbor Way\nMilwaukee, WI 53202",
      proposalDate: "2026-03-09",
      proposalNo: "RPST-2026-014",
      packageSelect: "professional",
      annualPrice: 12000,
      includedUsers: 40,
      includedSites: 3,
      billingTerm: "Annual",
      discountPct: 10,
      taxPct: 5,
      depositPct: 25,
      customSummary: "A six-month pilot across three Northwind jobsites.",
      customExclusions: "Excludes travel outside Wisconsin.",
      paymentTerms: "Net 15 from invoice date",
      lateFee: "2% per month on past-due undisputed balances",
      governingLaw: "California",
      liabilityCap: "Fees paid in the prior 6 months",
      validDays: "45",
    },
    phases: [
      {
        type: "phase",
        key: "discovery",
        name: "Discovery & Site Assessment",
        qty: 2,
        price: 1500,
        desc: "Two-site walkthrough and intake.",
        unit: "",
      },
    ],
    services: [
      {
        type: "service",
        key: "osha10",
        name: "OSHA 10 Training",
        qty: 3,
        price: 250,
        desc: "Three training cohorts.",
        unit: "Person",
      },
    ],
  };
}

/** A state that saved literally nothing — the shape a brand-new proposal has. */
function emptyState(): GeneratorState {
  return { v: 1, fields: {}, phases: [], services: [] };
}

function renderDocument(props: Partial<ProposalDocumentProps> = {}) {
  return render(<ProposalDocument state={wellFormedState()} proposal={subject} {...props} />);
}

/** Row lookup by its first cell, so a row moving in the table is not a failure. */
function feeRowByName(container: HTMLElement, name: string): HTMLTableRowElement {
  const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>(".rp-doc-fee tbody tr"));
  const row = rows.find((candidate) => candidate.cells[0]?.textContent?.trim() === name);
  if (!row) throw new Error(`No fee row named "${name}". Rows: ${rows.map((r) => r.cells[0]?.textContent).join(" | ")}`);
  return row;
}

function totalsRow(container: HTMLElement, label: string): HTMLTableRowElement {
  const rows = Array.from(container.querySelectorAll<HTMLTableRowElement>(".rp-doc-fee tfoot tr"));
  const row = rows.find((candidate) => candidate.cells[0]?.textContent?.trim() === label);
  if (!row) throw new Error(`No totals row labelled "${label}".`);
  return row;
}

function termBody(container: HTMLElement, heading: string): string {
  const sections = Array.from(container.querySelectorAll<HTMLElement>(".rp-doc-term"));
  const section = sections.find((candidate) => candidate.querySelector("h4")?.textContent?.trim() === heading);
  if (!section) throw new Error(`No legal term headed "${heading}".`);
  return section.querySelector("p")?.textContent ?? "";
}

describe("ProposalDocument — well-formed proposal", () => {
  it("renders every fee line item under its group with quantity, unit fee, and extended fee", () => {
    const { container } = renderDocument();

    const groupLabels = Array.from(container.querySelectorAll(".rp-doc-fee-group")).map((row) =>
      row.textContent?.trim(),
    );
    expect(groupLabels).toEqual(["Base Subscription", "Implementation Phases", "Service Lines & Add-Ons"]);

    const packageRow = feeRowByName(container, "Professional Safety Intelligence");
    expect(packageRow.cells[2].textContent).toBe("1");
    expect(packageRow.cells[3].textContent).toBe("$12,000");
    expect(packageRow.cells[4].textContent).toBe("$12,000");

    const phaseRow = feeRowByName(container, "Discovery & Site Assessment");
    expect(phaseRow.cells[1].textContent).toBe("Two-site walkthrough and intake.");
    expect(phaseRow.cells[2].textContent).toBe("2");
    expect(phaseRow.cells[3].textContent).toBe("$1,500");
    expect(phaseRow.cells[4].textContent).toBe("$3,000");

    // Services carry a billing unit from the catalog; osha10 is priced per Person.
    const serviceRow = feeRowByName(container, "OSHA 10 Training");
    expect(serviceRow.cells[2].textContent).toBe("3 Person");
    expect(serviceRow.cells[3].textContent).toBe("$250");
    expect(serviceRow.cells[4].textContent).toBe("$750");
  });

  it("renders the totals block so the printed figures match the fee rows", () => {
    const { container } = renderDocument();

    expect(totalsRow(container, "Subtotal").cells[1].textContent).toBe("$15,750");
    expect(totalsRow(container, "Discount").cells[1].textContent).toBe("-$1,575");
    expect(totalsRow(container, "Tax").cells[1].textContent).toBe("$708.75");
    expect(totalsRow(container, "Total").cells[1].textContent).toBe("$14,883.75");
    expect(totalsRow(container, "Deposit Due at Acceptance").cells[1].textContent).toBe("$3,720.94");

    // The two figures a client acts on must stay visually distinguishable.
    expect(totalsRow(container, "Total")).toHaveClass("rp-doc-fee-total");
    expect(totalsRow(container, "Deposit Due at Acceptance")).toHaveClass("rp-doc-fee-deposit");
  });

  it("renders both party blocks, the proposal metadata, and the validity sentence", () => {
    const { container, getByText } = renderDocument();

    expect(getByText("Proposal for Northwind Construction")).toBeInTheDocument();

    const meta = container.querySelector(".rp-doc-meta") as HTMLElement;
    const preparedFor = within(meta).getByText("Prepared For").parentElement as HTMLTableRowElement;
    expect(preparedFor.cells[1].textContent).toContain("Northwind Construction");
    expect(preparedFor.cells[1].textContent).toContain("Sam Okafor — VP Safety");
    expect(preparedFor.cells[1].textContent).toContain("500 Harbor Way");
    expect(preparedFor.cells[1].textContent).toContain("Milwaukee, WI 53202");
    expect(preparedFor.cells[1].textContent).toContain("sam@northwind.example");

    const preparedBy = within(meta).getByText("Prepared By").parentElement as HTMLTableRowElement;
    expect(preparedBy.cells[1].textContent).toContain("Reliance Predictive Safety Technologies");
    expect(preparedBy.cells[1].textContent).toContain("Prepared by: Dana Reyes");

    // Dates are formatted from the string parts, so they must not shift with the
    // server timezone — March 9 stays March 9.
    expect((within(meta).getByText("Proposal Date").parentElement as HTMLTableRowElement).cells[1].textContent).toBe(
      "March 9, 2026",
    );
    expect((within(meta).getByText("Proposal Number").parentElement as HTMLTableRowElement).cells[1].textContent).toBe(
      "RPST-2026-014",
    );
    expect((within(meta).getByText("Validity").parentElement as HTMLTableRowElement).cells[1].textContent).toBe(
      "Open for acceptance for 45 calendar days from proposal date. Valid until May 1, 2026.",
    );
  });

  it("renders the package pills from the saved package selection", () => {
    const { container } = renderDocument();
    const pills = Array.from(container.querySelectorAll(".rp-doc-pill")).map((pill) => pill.textContent);
    expect(pills).toEqual([
      "Subscription Price: $12,000",
      "Term: —",
      "Included Users: 40",
      "Included Jobsites: 3",
      "Billing: Annual",
    ]);
  });

  it("renders each selected phase and service as a numbered scope entry", () => {
    const { getByText } = renderDocument();
    expect(getByText("1. Discovery & Site Assessment")).toBeInTheDocument();
    expect(getByText("Service Line 1: OSHA 10 Training")).toBeInTheDocument();
  });
});

describe("ProposalDocument — degenerate state", () => {
  it("renders a complete document from an empty state with no NaN, undefined, or null on the page", () => {
    const { container, getByText } = render(
      <ProposalDocument
        state={emptyState()}
        proposal={{ ...subject, validUntil: null, currentRevision: 1 }}
      />,
    );

    const text = container.textContent ?? "";
    expect(container.innerHTML).not.toContain("NaN");
    expect(text).not.toContain("$NaN");
    expect(text).not.toMatch(/\bundefined\b/);
    expect(text).not.toMatch(/\bnull\b/);

    // Still a whole document, not a stub: all ten numbered sections survive.
    const sectionNumbers = Array.from(container.querySelectorAll(".rp-doc-secno")).map((el) => el.textContent);
    expect(sectionNumbers).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]);

    // With nothing selected, the fee table falls back to the generator's own
    // preselected pilot package rather than rendering an empty table.
    expect(feeRowByName(container, "Pilot Program — Platform Access").cells[4].textContent).toBe(
      "$5,000",
    );
    expect(totalsRow(container, "Total").cells[1].textContent).toBe("$5,000");
    // A 0% deposit is a real commercial position ("nothing due at signing"), so
    // it says so in words rather than printing "$0".
    expect(totalsRow(container, "Deposit Due at Acceptance").cells[1].textContent).toBe("No cost");

    // Honest empty states rather than fabricated content.
    expect(getByText("No implementation phases selected.")).toBeInTheDocument();
    expect(getByText("No added service lines selected.")).toBeInTheDocument();
    expect(getByText("No executive summary was recorded for this proposal.")).toBeInTheDocument();
    // Unfilled party identity is a dash, never an invented company name.
    expect(container.querySelectorAll(".rp-doc-party-name")[0].textContent).toBe("—");
    // No validUntil: the sentence ends cleanly rather than trailing "Valid until".
    expect(container.querySelector(".rp-doc-meta")?.textContent).not.toContain("Valid until");
  });

  it("renders no NaN for a hand-edited state carrying junk numerics", () => {
    // Deliberately cast past isGeneratorState(): this is the shape a row edited
    // straight in the database has, and the document must not print "$NaN" on a
    // page a client is looking at.
    const hostile = {
      v: 1,
      fields: {
        annualPrice: "not a number",
        includedUsers: "many",
        includedSites: -4,
        discountPct: 250,
        taxPct: -30,
        depositPct: "abc",
        validDays: "",
        proposalDate: "",
      },
      phases: [{ type: "phase", key: "", name: "", qty: Number.NaN, price: Number.NaN, desc: "", unit: "" }],
      services: [{ type: "service", key: "", name: "", qty: "3", price: "seventy", desc: "", unit: "" }],
    } as unknown as GeneratorState;

    const { container, getByText } = render(
      <ProposalDocument state={hostile} proposal={{ ...subject, validUntil: "" }} />,
    );

    const text = container.textContent ?? "";
    expect(container.innerHTML).not.toContain("NaN");
    expect(text).not.toContain("$NaN");
    expect(text).not.toMatch(/\bundefined\b/);
    expect(text).not.toMatch(/-\$-/);

    // A clamped discount cannot invert the total into a negative number.
    // Zero prints as "No cost" rather than "$0" so a free line does not read
    // like a pricing mistake — see formatLineAmount().
    expect(totalsRow(container, "Total").cells[1].textContent).toBe("No cost");

    // Unnamed rows still carry a placeholder rather than a blank cell. NOTE the
    // fee table and the scope section label them differently: the table prints a
    // dash, sections 03/04 print "Untitled phase 1". Both are honest, so this
    // pins the current behaviour rather than asserting one is correct.
    expect(feeRowByName(container, "—").cells[4].textContent).toBe("No cost");
    expect(getByText("1. Untitled phase 1")).toBeInTheDocument();
    expect(getByText("Service Line 1: Untitled service line 1")).toBeInTheDocument();
  });
});

describe("ProposalDocument — historical revision banner", () => {
  it("marks the document as an archived snapshot when the rendered revision is not the current one", () => {
    const { container } = renderDocument({ revisionNumber: 2 });

    const banner = container.querySelector(".rp-doc-banner");
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("Revision 2 — not the current version.");
    expect(banner?.textContent).toContain("revision 5");
    expect(container.querySelector(".rp-doc-revtag")?.textContent).toContain("Revision 2");
  });

  it("shows no banner when the rendered revision IS the proposal's current revision", () => {
    const { container } = renderDocument({ revisionNumber: 5 });
    expect(container.querySelector(".rp-doc-banner")).toBeNull();
    expect(container.querySelector(".rp-doc-revtag")?.textContent).toContain("Revision 5");
  });

  it("shows no banner on the live document, where no revision number is passed", () => {
    const { container } = renderDocument();
    expect(container.querySelector(".rp-doc-banner")).toBeNull();
    // The masthead still has to say which revision the reader is holding.
    expect(container.querySelector(".rp-doc-revtag")?.textContent).toContain("Revision 5");
  });
});

describe("ProposalDocument — commercial and legal terms", () => {
  /** The seven a dispute actually turns on. */
  const loadBearingTerms = [
    "Dispute Resolution & Arbitration",
    "Limitation of Liability",
    "Governing Law & Venue",
    "Warranty Disclaimer",
    "OSHA Compliance Disclaimer",
    "Trade Secrets — Wisconsin & Federal",
    "Data Privacy — CCPA/CPRA (California)",
  ];

  it("renders all 27 commercial and legal terms, each with a heading and a body", () => {
    const { container } = renderDocument();
    const sections = Array.from(container.querySelectorAll(".rp-doc-term"));
    expect(sections).toHaveLength(27);

    for (const section of sections) {
      expect(section.querySelector("h4")?.textContent?.trim()).toBeTruthy();
      expect(section.querySelector("p")?.textContent?.trim()).toBeTruthy();
    }

    const headings = sections.map((section) => section.querySelector("h4")?.textContent?.trim());
    for (const heading of loadBearingTerms) expect(headings).toContain(heading);
  });

  it("interpolates the seller's selected values into the contractual sentences", () => {
    const { container } = renderDocument();

    expect(termBody(container, "Payment Terms")).toContain(
      "Net 15 from invoice date. 2% per month on past-due undisputed balances.",
    );
    expect(termBody(container, "Limitation of Liability")).toContain(
      "SELLER'S TOTAL LIABILITY IS LIMITED TO Fees paid in the prior 6 months, AND SELLER IS NOT LIABLE",
    );
    expect(termBody(container, "Governing Law & Venue")).toContain(
      "governed by the laws of California, without regard to conflict-of-law principles",
    );
    expect(termBody(container, "Proposal Validity")).toContain("open for 45 calendar days");
  });

  it("falls back to the generator's own defaults when the select-backed terms were never saved", () => {
    // The failure this guards against is a contractual sentence with a hole in
    // it — "limited to , and Seller is not liable" — on a document a client signs.
    const { container } = render(
      <ProposalDocument state={emptyState()} proposal={{ ...subject, validUntil: null }} />,
    );

    const liability = termBody(container, "Limitation of Liability");
    expect(liability).not.toMatch(/LIMITED TO\s*,/);
    expect(liability).toContain("LIMITED TO Fees paid under this proposal in the prior 12 months");

    const governing = termBody(container, "Governing Law & Venue");
    expect(governing).not.toMatch(/laws of\s*,/);
    expect(governing).toContain("governed by the laws of Wisconsin (primary),");

    const payment = termBody(container, "Payment Terms");
    expect(payment).not.toMatch(/^\s*\./);
    expect(payment).toContain("Net 30 from invoice date. 1.5% per month");

    expect(termBody(container, "Proposal Validity")).toContain("open for 60 calendar days");

    // No term may render with an empty interpolation slot anywhere.
    for (const section of Array.from(container.querySelectorAll(".rp-doc-term"))) {
      const body = section.querySelector("p")?.textContent ?? "";
      expect(body).not.toMatch(/\s,\s*(and|AND)\b/);
      expect(body).not.toMatch(/\s{2,}/);
    }
  });
});

describe("ProposalDocument — escaping", () => {
  it("renders markup-looking field text as literal text, never as HTML", () => {
    // The generator's own renderer concatenates into innerHTML; this component
    // exists partly to close that stored-XSS sink, so the escaping is a
    // load-bearing property rather than an incidental React behaviour.
    const state = wellFormedState();
    state.fields.clientCompany = '<img src=x onerror="alert(1)">Acme';
    state.fields.customSummary = "<script>alert('xss')</script>";

    const { container } = render(<ProposalDocument state={state} proposal={subject} />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('img[onerror]')).toBeNull();
    expect(container.textContent).toContain("<script>alert('xss')</script>");
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">Acme');
  });
});
