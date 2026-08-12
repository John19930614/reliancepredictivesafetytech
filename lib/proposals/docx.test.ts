import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildProposalDocumentModel } from "@/components/proposals/proposal-document-model";
import type { GeneratorState } from "./generator-state";
import { computeProposalTotals } from "./pricing";
import { renderProposalDocx } from "./docx";
import { proposalFooterText } from "./types";

const state: GeneratorState = {
  v: 1,
  fields: {
    sellerName: "Reliance Predictive Safety Technologies",
    preparedBy: "John Haldemann",
    sellerContact: "Sussex, Wisconsin\nEmail: sales@example.com",
    clientCompany: "Northwind Construction",
    clientContact: "Dana Reyes",
    clientTitle: "Director of Safety",
    proposalDate: "2026-03-04",
    proposalNo: "RPS-2026-0001",
    packageSelect: "starter",
    annualPrice: 12000,
  },
  phases: [],
  services: [],
};

/**
 * A priced proposal.
 *
 * The line items are named outright rather than referenced by catalog key, so
 * this suite tests the DOCX renderer rather than the current contents of the
 * pricing catalog.
 */
function pricedState(): GeneratorState {
  return {
    ...state,
    fields: { ...state.fields, discountPct: "10", taxPct: "5", depositPct: "25" },
    phases: [
      { type: "phase", key: "", name: "Discovery and Site Walk", qty: 1, price: 3500, desc: "Baseline review.", unit: "" },
      { type: "phase", key: "", name: "Build and Configure", qty: 1, price: 10000, desc: "Platform build.", unit: "" },
    ],
    services: [
      { type: "service", key: "", name: "Site Safety Audit", qty: 4, price: 1250, desc: "Per site.", unit: "site" },
      { type: "service", key: "", name: "OSHA 30 Training", qty: 24, price: 425, desc: "Per participant.", unit: "seat" },
    ],
  };
}

function modelFor(source: GeneratorState) {
  return buildProposalDocumentModel({
    state: source,
    totals: computeProposalTotals(source),
    proposal: {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Northwind Construction — Platform Proposal",
      status: "draft",
      currentRevision: 1,
      validUntil: "2026-05-01",
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Reading the rendered file back                                              */
/* -------------------------------------------------------------------------- */

/**
 * Pulls one entry out of the .docx archive.
 *
 * A byte-length check cannot tell a proposal from an empty Word template — the
 * boilerplate parts alone clear 10 kB — so the assertions below read
 * `word/document.xml` and look for the document's own words. Done by walking the
 * local file headers with zlib rather than adding a zip library: `jszip` is a
 * transitive dependency of `docx`, not one this project declares.
 */
function readArchiveEntry(archive: Buffer, name: string): string {
  const wanted = Buffer.from(name, "latin1");
  let offset = archive.indexOf("PK", 0, "latin1");

  while (offset !== -1) {
    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + nameLength + extraLength;

    if (archive.subarray(offset + 30, offset + 30 + nameLength).equals(wanted)) {
      // A streamed entry writes 0 here and puts the real size in a trailing
      // data descriptor; inflateRawSync stops at the end of the deflate stream
      // either way, so the rest of the archive can safely be handed to it.
      const body = compressedSize > 0 ? archive.subarray(dataStart, dataStart + compressedSize) : archive.subarray(dataStart);
      return method === 0 ? body.toString("utf8") : inflateRawSync(body).toString("utf8");
    }

    offset = archive.indexOf("PK", dataStart, "latin1");
  }

  throw new Error(`${name} is not in the archive`);
}

/** The visible text of a Word part, i.e. everything inside its <w:t> runs. */
function wordText(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map(([, run]) => run.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'))
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

describe("renderProposalDocx", () => {
  it("produces a downloadable Word document from the proposal view-model", async () => {
    const bytes = await renderProposalDocx(modelFor(state));

    expect(bytes.length).toBeGreaterThan(10_000);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
  });

  it("writes the document's own text into word/document.xml, not an empty shell", async () => {
    // The byte-length check above passes on a Word file containing nothing —
    // the boilerplate parts and the embedded seal clear it on their own. This is
    // the assertion that the proposal actually reached the page.
    const bytes = await renderProposalDocx(modelFor(pricedState()));
    const text = wordText(readArchiveEntry(bytes, "word/document.xml"));

    for (const expected of [
      "Executive Summary",
      "Deliverables",
      "Commercial and Legal Terms",
      "Acceptance Statement",
      "Client Acceptance",
      "Seller Acceptance",
      "Northwind Construction",
      "RPS-2026-0001",
      "Discovery and Site Walk",
      "OSHA 30 Training",
    ]) {
      expect(text).toContain(expected);
    }

    // Priced, not just laid out.
    expect(text).toMatch(/\$[\d,]+\.\d{2}/);

    // A full proposal is thousands of characters of terms alone. The floor is
    // set far below a real document and far above an empty one.
    expect(text.length).toBeGreaterThan(6_000);
  });

  it("numbers its sections in order and carries the company footer", async () => {
    const bytes = await renderProposalDocx(modelFor(pricedState()));
    const text = wordText(readArchiveEntry(bytes, "word/document.xml"));

    // Section numbers are rendered as their own run ahead of the title, and the
    // sequence shifts by one when a Your Team block is present — so the check is
    // that they are consecutive from 01, not that any given heading is number N.
    const numbers = [...text.matchAll(/^(\d{2})\s*$/gm)].map(([, value]) => Number(value));
    expect(numbers.length).toBeGreaterThanOrEqual(10);
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));

    const footer = wordText(readArchiveEntry(bytes, "word/footer1.xml"));
    expect(footer).toContain(proposalFooterText());
    // Same reason the PDF route exists: no file route on a client-facing page.
    expect(footer).not.toContain("/employee/proposals");
  });

  it("lays out on US Letter with no table running past the margin", async () => {
    // The `docx` package defaults to A4. This file used to take that default
    // while its own comment claimed Letter, so the DOCX disagreed with the PDF
    // route and with `@page { size: letter }` in proposal-document.css, and
    // every full-width table was 500 twips wider than the text column it sat in
    // — visible overhang past the right margin in Word.
    const xml = readArchiveEntry(await renderProposalDocx(modelFor(pricedState())), "word/document.xml");

    const pageWidth = Number(/<w:pgSz[^>]*\sw:w="(\d+)"/.exec(xml)?.[1]);
    const left = Number(/<w:pgMar[^>]*\sw:left="(\d+)"/.exec(xml)?.[1]);
    const right = Number(/<w:pgMar[^>]*\sw:right="(\d+)"/.exec(xml)?.[1]);

    expect(pageWidth).toBe(12240); // 8.5in in twips
    expect(Number(/<w:pgSz[^>]*\sw:h="(\d+)"/.exec(xml)?.[1])).toBe(15840); // 11in

    const printable = pageWidth - left - right;
    // Attribute order inside <w:tblW> is the serializer's business, so read the
    // tag and then pick the attributes out of it.
    const tableWidths = [...xml.matchAll(/<w:tblW\b[^>]*>/g)]
      .map(([tag]) => ({
        type: /w:type="([^"]+)"/.exec(tag)?.[1],
        width: Number(/w:w="(\d+)"/.exec(tag)?.[1]),
      }))
      .filter((entry) => entry.type === "dxa" && Number.isFinite(entry.width))
      .map((entry) => entry.width);

    expect(tableWidths.length).toBeGreaterThan(0);
    expect(tableWidths.filter((width) => width > printable)).toEqual([]);
  });

  it("renders an all-but-empty proposal without throwing, and still writes its structure", async () => {
    const empty: GeneratorState = { v: 1, fields: {}, phases: [], services: [] };
    const bytes = await renderProposalDocx(modelFor(empty));
    const text = wordText(readArchiveEntry(bytes, "word/document.xml"));

    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(text).toContain("Executive Summary");
    expect(text).toContain("Acceptance Statement");
  });
});
