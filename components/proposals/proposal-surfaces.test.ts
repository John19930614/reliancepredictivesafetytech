// The cross-type, cross-surface regression harness for the proposal document.
//
// WHY THIS FILE EXISTS
//   The module sells SEVEN transaction types (lib/proposals/transaction-templates.ts).
//   Three sell a platform subscription — pilot, platform, enterprise. Four sell no
//   subscription at all — training, time_and_materials, fixed_price, retainer.
//   For over a year every one of them printed copy written for a subscription
//   sale: a CPR training proposal promised "Configured platform subscription and
//   client account setup", carried "Taxes & SaaS Fees", and disclaimed a platform
//   it was not selling. The owner caught it FIVE separate times, in five
//   different places, because each fix was a fix to one string.
//
//   Every other suite in this module tests ONE thing: pdf.test.ts tests the PDF,
//   docx.test.ts tests the DOCX, proposal-document-model.test.ts tests the model,
//   each type-profile test tests its own profile. None of them can see the two
//   failure modes that actually shipped:
//
//     1. copy that is correct for one type leaking onto the other six, and
//     2. a fix landing on one of the five output surfaces and not the rest —
//        the per-type section headings reached the screen a full day before they
//        reached the PDF, so a client read one set of headings on the share page
//        and signed a DocuSign envelope carrying another.
//
//   So this file asserts ACROSS types and ACROSS surfaces, and it drives
//   everything from `transactionTemplateKeys` rather than a list of its own. An
//   eighth proposal type is covered by every assertion below the day it is added
//   to the registry — including the ones it was never written for.
//
// THE FIVE SURFACES
//   The screen (ProposalDocument.tsx), the PDF (lib/proposals/pdf.ts), the DOCX
//   (lib/proposals/docx.ts), the public share page (which renders
//   ProposalDocument), and the DocuSign envelope (which sends the PDF). All five
//   render from ONE view-model, so the model IS the screen for assertion
//   purposes — but the PDF and the DOCX are read back out of the RENDERED
//   ARTIFACT here, never out of the model, because a renderer holding its own
//   string literals is exactly the defect this is watching for.

import { inflateRawSync, inflateSync } from "node:zlib";
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { isNoPlatformPackageKey } from "@/lib/proposals/catalog";
import { collectProposalFacts } from "@/lib/proposals/consistency";
import { renderProposalDocx } from "@/lib/proposals/docx";
import type { GeneratorState } from "@/lib/proposals/generator-state";
import { renderProposalPdf, toPdfText } from "@/lib/proposals/pdf";
import { computeProposalTotals } from "@/lib/proposals/pricing";
import { collectReadinessFindings } from "@/lib/proposals/review-checks";
import { proposalFooterText } from "@/lib/proposals/types";
import {
  buildTransactionTemplateState,
  transactionTemplateKeys,
  type TransactionTemplateKey,
} from "@/lib/proposals/transaction-templates";
import {
  buildDocumentTerms,
  buildProposalDocumentModel,
  documentTermDefaults,
  type ProposalDocumentModel,
} from "./proposal-document-model";

/* -------------------------------------------------------------------------- */
/* Cases — derived from the registry, never listed                             */
/* -------------------------------------------------------------------------- */

/**
 * The untyped state: a proposal saved before proposal types existed, or one
 * started blank. `resolveProposalTypeProfile` returns null for it, which is what
 * keeps every document already in a client's hands rendering as it was sent.
 */
const legacyKey = "__untyped_legacy__" as const;
type CaseKey = TransactionTemplateKey | typeof legacyKey;

function stateFor(key: CaseKey): GeneratorState {
  return key === legacyKey ? { v: 1, fields: {}, phases: [], services: [] } : buildTransactionTemplateState(key);
}

/**
 * Which types sell a subscription, read from each type's OWN seed rather than
 * declared here. `review-checks.ts` decides the same question the same way, and
 * the registry stays the single place that knows what a type is — so an eighth
 * type lands in the right bucket, and gets the right assertions, without this
 * file being edited.
 */
function sellsSubscription(key: TransactionTemplateKey): boolean {
  return !isNoPlatformPackageKey(String(buildTransactionTemplateState(key).fields.packageSelect ?? ""));
}

const subscriptionKeys = transactionTemplateKeys.filter(sellsSubscription);
const servicesKeys = transactionTemplateKeys.filter((key) => !sellsSubscription(key));
const allCases: CaseKey[] = [...transactionTemplateKeys, legacyKey];

/* -------------------------------------------------------------------------- */
/* Artifacts — built once per case, shared by every assertion                  */
/* -------------------------------------------------------------------------- */

interface Artifact {
  state: GeneratorState;
  model: ProposalDocumentModel;
  /** One entry per PDF sheet, in page order — the text the file actually draws. */
  pdfPages: string[];
  /** All sheets joined with the per-sheet footer removed, whitespace collapsed. */
  pdfText: string;
  /** One drawn string per entry, in draw order, sheet by sheet. */
  pdfLines: string[];
  docxBytes: Buffer;
  /** word/document.xml's visible runs, whitespace collapsed. */
  docxText: string;
  /** One <w:t> run per entry, in document order. */
  docxLines: string[];
}

const artifacts = new Map<CaseKey, Artifact>();

/**
 * The fixture is deliberately BARE: the seeded template and nothing else.
 *
 * Every string this harness scans is therefore something the platform composed
 * — from the registry, the type profile, the catalog and the commercial
 * defaults — rather than something a fixture author typed. A subscription
 * sentence found on a training document here is one the module produced.
 */
function modelFor(state: GeneratorState): ProposalDocumentModel {
  return buildProposalDocumentModel({
    state,
    totals: computeProposalTotals(state),
    proposal: {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Proposal",
      status: "draft",
      currentRevision: 1,
      validUntil: null,
    },
    team: [],
    signature: null,
  });
}

/** Collapses every run of whitespace so a wrapped line reads as one sentence. */
function flat(text: string): string {
  return text.replace(/\s+/g, " ");
}

/**
 * The text a rendered PDF actually DRAWS, one entry per sheet.
 *
 * Technique copied from `drawnPages` in lib/proposals/pdf.test.ts (that file
 * does not export it, and importing across suites to share a fixture is worse
 * than 20 duplicated lines). pdf-lib flate-encodes content streams on save and
 * writes drawn strings as hex, so neither the words nor the page count can be
 * checked by scanning the raw bytes.
 */
async function drawnPages(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);

  return doc.getPages().map((page) => {
    const contents = page.node.context.lookup(page.node.get(PDFName.of("Contents")));
    const streams =
      contents instanceof PDFArray ? contents.asArray().map((ref) => page.node.context.lookup(ref)) : [contents];

    const operators = streams
      .map((stream) => {
        if (!(stream instanceof PDFRawStream)) return "";
        const raw = Buffer.from(stream.contents);
        try {
          return inflateSync(raw).toString("latin1");
        } catch {
          return raw.toString("latin1");
        }
      })
      .join("\n");

    return [...operators.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)]
      .map(([, hex]) => Buffer.from(hex, "hex").toString("latin1"))
      .join("\n");
  });
}

/**
 * Pulls one entry out of the .docx archive.
 *
 * Technique copied from `readArchiveEntry` in lib/proposals/docx.test.ts, for
 * the same reason: `jszip` is a transitive dependency of `docx`, not one this
 * project declares, so the local file headers are walked with zlib instead.
 */
function readArchiveEntry(archive: Buffer, name: string): string {
  const wanted = Buffer.from(name, "latin1");
  let offset = archive.indexOf("PK", 0, "latin1");

  while (offset !== -1) {
    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const dataStart = offset + 30 + nameLength + extraLength;

    if (archive.subarray(offset + 30, offset + 30 + nameLength).equals(wanted)) {
      const body =
        compressedSize > 0 ? archive.subarray(dataStart, dataStart + compressedSize) : archive.subarray(dataStart);
      return method === 0 ? body.toString("utf8") : inflateRawSync(body).toString("utf8");
    }

    offset = archive.indexOf("PK", dataStart, "latin1");
  }

  throw new Error(`${name} is not in the archive`);
}

/**
 * The visible text of a Word part, i.e. everything inside its <w:t> runs.
 *
 * The entity table is fuller than docx.test.ts's: the `docx` serializer writes
 * an apostrophe as `&apos;`, and half the per-type scope prose says "the
 * client's". Decoding `&amp;` LAST also matters — decoding it first turns a
 * literal "&lt;" written by a seller into a "<".
 */
const xmlEntities: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

function wordText(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map(([, run]) =>
      run
        .replace(/&(?:lt|gt|quot|apos);/g, (entity) => xmlEntities[entity])
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
        .replace(/&amp;/g, "&"),
    )
    .join("\n");
}

/**
 * The body text of a sheet, with the stamped footer taken off.
 *
 * `stampFooters` (pdf.ts) draws the company footer and "Page N of M" AFTER all
 * body text, so they land at the END of each sheet's content stream. Joining
 * raw sheets therefore drops a footer into the middle of any sentence that
 * straddles a page break — which is a measurement artifact of this harness, not
 * a defect in the document, and it made a perfectly-rendered acceptance
 * statement look missing on the two shortest fixtures.
 */
function withoutFooter(page: string, pageNumber: number, total: number): string {
  const footer = toPdfText(proposalFooterText());
  const label = `Page ${pageNumber} of ${total}`;
  return page
    .split("\n")
    .filter((line) => line !== footer && line !== label)
    .join("\n");
}

// Eight documents through two real renderers is the expensive part of this
// file, so it happens exactly once and every assertion below reads the result.
beforeAll(async () => {
  for (const key of allCases) {
    const state = stateFor(key);
    const model = modelFor(state);
    const pdfPages = await drawnPages(await renderProposalPdf({ model, documentTitle: model.headline }));
    const docxBytes = await renderProposalDocx(model);
    const docxRuns = wordText(readArchiveEntry(docxBytes, "word/document.xml"));
    const body = pdfPages.map((page, index) => withoutFooter(page, index + 1, pdfPages.length));
    artifacts.set(key, {
      state,
      model,
      pdfPages,
      pdfText: flat(body.join("\n")),
      pdfLines: body.join("\n").split("\n"),
      docxBytes,
      docxText: flat(docxRuns),
      docxLines: docxRuns.split("\n"),
    });
  }
}, 300_000);

function artifactFor(key: CaseKey): Artifact {
  const artifact = artifacts.get(key);
  if (!artifact) throw new Error(`no artifact built for ${key}`);
  return artifact;
}

/* -------------------------------------------------------------------------- */
/* Walking the model generically                                               */
/* -------------------------------------------------------------------------- */

interface ModelString {
  /** Address of the value, e.g. "model.terms[12].body". */
  path: string;
  text: string;
}

/**
 * EVERY string on the view-model, found by walking it rather than by naming
 * fields.
 *
 * Listing the fields by hand is how this defect kept coming back: each fix
 * scrubbed the fields someone remembered, and the next release added a field
 * nobody added to the list. A new model field is scanned by the assertions
 * below on the day it is added, without this file changing.
 */
function collectModelStrings(value: unknown, path: string, out: ModelString[] = []): ModelString[] {
  if (typeof value === "string") {
    out.push({ path, text: value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectModelStrings(entry, `${path}[${index}]`, out));
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) collectModelStrings(entry, `${path}.${key}`, out);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* 0. The harness follows the registry                                         */
/* -------------------------------------------------------------------------- */

describe("registry coverage", () => {
  it("classifies every registered type, with both kinds of deal represented", () => {
    // If an eighth type is added it lands in one of these two buckets from its
    // own seed and inherits every assertion in this file. Nothing here is a
    // hardcoded list of types.
    expect(subscriptionKeys.length + servicesKeys.length).toBe(transactionTemplateKeys.length);
    expect(subscriptionKeys.length).toBeGreaterThan(0);
    expect(servicesKeys.length).toBeGreaterThan(0);
    expect([...subscriptionKeys, ...servicesKeys].sort()).toEqual([...transactionTemplateKeys].sort());
  });

  it("builds a document for every registered type plus the untyped legacy state", () => {
    expect([...artifacts.keys()].sort()).toEqual([...allCases].sort());
  });

  it("reaches every client-readable region of the model when it walks it", () => {
    // Guards the guard. A blanket scan over a walk that silently stopped
    // reaching `terms` or `deliverables` would pass forever while proving
    // nothing, so the paths the scan depends on are asserted to exist.
    const paths = new Set(collectModelStrings(artifactFor("training").model, "model").map((entry) => entry.path));
    for (const required of [
      "model.subtitle",
      "model.docline",
      "model.purposeCallout",
      "model.packageHeading",
      "model.packageIntro",
      "model.packagePills[0].label",
      "model.packagePills[0].value",
      "model.scopeHeading",
      "model.scopeIntro",
      "model.serviceScope[0].heading",
      "model.serviceScope[0].body",
      "model.phaseEmptyNote",
      "model.serviceEmptyNote",
      "model.deliverables[0]",
      "model.deliverablesCoverage",
      "model.feeGroups[0].label",
      "model.feesHeading",
      "model.termHeading",
      "model.schedule",
      "model.scheduleSteps[0]",
      "model.clientResponsibilities[0]",
      "model.exclusions",
      "model.terms[0].heading",
      "model.terms[0].body",
      "model.acceptance",
      "model.legalNotice",
    ]) {
      expect(paths, `the generic walk no longer reaches ${required}`).toContain(required);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 1. No subscription language on a services deal                              */
/* -------------------------------------------------------------------------- */

/**
 * The vocabulary of a subscription sale. Any of it on a training, T&M,
 * fixed-price or retainer document is the defect this module has shipped five
 * times.
 */
const subscriptionVocabulary =
  /saas|subscription|platform access|included users|included jobsites|seat\b|auto-?renew|per user/i;

/**
 * The ONLY strings a services document may carry from that vocabulary.
 *
 * Each is pinned to its exact wording and stripped before the scan runs, so a
 * reword does not slip through the exemption — it fails this test. The list is
 * also asserted to be live (see "every lexical exemption is still earned"), so
 * an exemption whose text has gone away is deleted rather than accumulating.
 *
 * NOTHING IS EXEMPTED BY FIELD. The scan reads every string on the model.
 */
const servicesLexicalExemptions: readonly { text: string; why: string }[] = [
  {
    // components/proposals/proposal-document-model.ts:669 — composed by
    // buildPackageDescription for the services branch, not by any profile. It is
    // a DENIAL that a subscription is included, and it is pinned as a contract
    // by lib/proposals/transaction-templates.test.ts:160. Reported to the owner
    // as a judgement call: it is the one place a services document mentions the
    // subscription at all, and it does so only to rule it out.
    text: "The scope and fees are itemized in the schedule below, and no platform subscription is included.",
    why: "the model's explicit no-subscription denial, pinned by transaction-templates.test.ts",
  },
  {
    // lib/proposals/type-profiles/training.ts, clause id "training.no_show". A
    // seat on a class roster, not a licensed user account — the correct word for
    // a training reservation, in a clause about attendee substitution. Note the
    // plural "Seats reserved on the confirmed roster" in the same clause does
    // NOT need an exemption: /seat\b/ has no word boundary before the "s".
    text: "subject to seat availability",
    why: "a place in a training class, not a licensed subscription seat",
  },
];

function scrubExemptions(text: string): string {
  let out = text;
  for (const exemption of servicesLexicalExemptions) out = out.split(exemption.text).join(" ");
  return out;
}

/**
 * Every stretch of subscription vocabulary left in a body of text, with enough
 * either side to read it, so a failure names the sentence rather than reporting
 * "expected true to be false".
 */
function offendingExcerpts(text: string): string[] {
  const scan = new RegExp(subscriptionVocabulary.source, "gi");
  return [...scrubExemptions(text).matchAll(scan)].map((match) =>
    flat(scrubExemptions(text).slice(Math.max(0, (match.index ?? 0) - 70), (match.index ?? 0) + 90)).trim(),
  );
}

describe("a services deal never speaks the language of a subscription", () => {
  it.each(servicesKeys)("%s prints nothing from the subscription vocabulary", (key) => {
    const violations = collectModelStrings(artifactFor(key).model, "model")
      .map((entry) => ({ ...entry, scrubbed: scrubExemptions(entry.text) }))
      .filter((entry) => subscriptionVocabulary.test(entry.scrubbed))
      .map((entry) => {
        const match = subscriptionVocabulary.exec(entry.scrubbed);
        const at = match?.index ?? 0;
        return {
          path: entry.path,
          matched: match?.[0] ?? "",
          excerpt: entry.scrubbed.slice(Math.max(0, at - 70), at + 90).trim(),
        };
      });

    expect(violations).toEqual([]);
  });

  it.each(servicesKeys)("%s prints none of it in the PDF or the DOCX either", (key) => {
    // The model is the screen. These two are the artifacts a client actually
    // receives — the PDF is what DocuSign sends. A renderer holding its own
    // platform-era string literal is invisible to the model scan above.
    const { pdfText, docxText } = artifactFor(key);
    expect(offendingExcerpts(pdfText)).toEqual([]);
    expect(offendingExcerpts(docxText)).toEqual([]);
  });

  it.each(servicesKeys)("%s prices no subscription and quotes no seat or site limits", (key) => {
    const { model } = artifactFor(key);
    expect(model.includesPlatformPackage).toBe(false);
    // "Base Subscription" is the fee group a package row lands in; a services
    // engagement must produce no package row at all rather than a $0 one.
    expect(model.feeGroups.map((group) => group.label)).not.toContain("Base Subscription");
    expect(model.totals.lineItems.filter((row) => row.source === "package")).toEqual([]);
    expect(model.packagePills.map((pill) => pill.label)).not.toContain("Included Users");
    expect(model.packagePills.map((pill) => pill.label)).not.toContain("Included Jobsites");
    // Section 02 is an engagement summary, not a package selection.
    expect(model.packageHeading).toBe("Engagement Summary");
    // The two "your proposal is missing something" notes are for a subscription
    // rollout. A services engagement has no implementation phases BY DESIGN.
    expect(model.phaseEmptyNote).toBe("");
    expect(model.serviceEmptyNote).toBe("");
    // "(pilot)" billing on a document that is not a pilot announces a deal
    // nobody made.
    expect(model.packagePills.find((pill) => pill.label === "Billing")?.value ?? "").not.toMatch(/pilot/i);
  });

  it("every lexical exemption is still earned", () => {
    // An exemption for text that no longer exists is a hole waiting for the next
    // author. Each one must still be found on at least one services document.
    const corpus = servicesKeys
      .map((key) => {
        const { model, pdfText, docxText } = artifactFor(key);
        return [...collectModelStrings(model, "model").map((entry) => entry.text), pdfText, docxText].join("\n");
      })
      .join("\n");

    for (const exemption of servicesLexicalExemptions) {
      expect(flat(corpus), `stale exemption: ${exemption.why}`).toContain(flat(exemption.text));
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. The subscription types still sell one                                    */
/* -------------------------------------------------------------------------- */

describe("a subscription deal still sells a subscription", () => {
  it.each(subscriptionKeys)("%s still says what it is selling", (key) => {
    const { model, pdfText, docxText } = artifactFor(key);
    const documentText = collectModelStrings(model, "model")
      .map((entry) => entry.text)
      .join("\n");

    expect(documentText).toMatch(/\bsubscription\b/i);
    expect(pdfText).toMatch(/\bsubscription\b/i);
    expect(docxText).toMatch(/\bsubscription\b/i);
  });

  it.each(subscriptionKeys)("%s still prints its seat and site pills and prices a package", (key) => {
    const { model } = artifactFor(key);
    const pills = model.packagePills.map((pill) => pill.label);

    expect(model.includesPlatformPackage).toBe(true);
    expect(pills).toContain("Included Users");
    expect(pills).toContain("Included Jobsites");
    expect(model.packageHeading).toBe("Selected Platform Package");
    expect(model.feeGroups.map((group) => group.label)).toContain("Base Subscription");

    const included = model.packagePills.filter(
      (pill) => pill.label === "Included Users" || pill.label === "Included Jobsites",
    );
    // A pill printing "0" would quote the client a limit of zero. The model
    // drops the pill instead, so a pill that IS present must carry a real count.
    for (const pill of included) expect(Number(pill.value)).toBeGreaterThan(0);

    const packageRow = model.totals.lineItems.find((row) => row.source === "package");
    expect(packageRow).toBeDefined();
    expect(packageRow?.price).toBeGreaterThan(0);
  });

  it("the pilot is still described as a pilot, on every surface", () => {
    // The pilot's equivalent of "subscription": its own noun has to survive the
    // per-type work, or the one type whose whole point is that it does not
    // convert reads like an ordinary platform sale.
    const { model, pdfText, docxText } = artifactFor("pilot");
    expect(model.docline).toMatch(/pilot/i);
    expect(model.proposalTypeLabel).toMatch(/pilot/i);
    expect(pdfText).toMatch(/\bpilot\b/i);
    expect(docxText).toMatch(/\bpilot\b/i);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Surface parity                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The document's ten numbered sections, as the screen renderer emits them.
 *
 * Six titles come from the model (the per-type ones); four are literals held by
 * ProposalDocument.tsx at lines 163, 206, 291, 298, 318 and 328. The numbering
 * is fixed here because these fixtures carry no team — with a Your Team section
 * present, all three renderers shift the last two by one, together.
 *
 * Both the PDF (drawSectionHeading, pdf.ts:203) and the DOCX (heading,
 * docx.ts:~360) draw the number and the title as two consecutive runs, so the
 * flattened artifact text contains "05 Training Fees" verbatim — which makes
 * this a check on the number AND the wording AND the order, not just presence.
 */
function numberedSections(model: ProposalDocumentModel): string[] {
  return [
    `01 Executive Summary`,
    `02 ${model.packageHeading}`,
    `03 ${model.scopeHeading}`,
    `04 Deliverables`,
    `05 ${model.feesHeading}`,
    `06 ${model.termHeading}`,
    `07 Client Responsibilities`,
    `08 Assumptions and Exclusions`,
    `09 Commercial and Legal Terms`,
    `10 Acceptance Statement`,
  ];
}

describe("the PDF and the DOCX print what the screen prints", () => {
  it.each(allCases)("%s renders the same ten numbered section headings on all three surfaces", (key) => {
    const { model, pdfText, docxText } = artifactFor(key);
    const sections = numberedSections(model);

    // This is the assertion that would have caught the per-type headings
    // reaching the screen and not the PDF: pdf.ts held "Detailed Scope of Work"
    // and "Pricing Schedule" as its own literals for a full day.
    const missingFromPdf = sections.filter((heading) => !pdfText.includes(flat(toPdfText(heading))));
    const missingFromDocx = sections.filter((heading) => !docxText.includes(flat(heading)));
    expect(missingFromPdf).toEqual([]);
    expect(missingFromDocx).toEqual([]);

    // In order, and each exactly once — a renderer that emitted section 05 twice
    // or moved the fee schedule above the scope would still pass "contains".
    const pdfPositions = sections.map((heading) => pdfText.indexOf(flat(toPdfText(heading))));
    const docxPositions = sections.map((heading) => docxText.indexOf(flat(heading)));
    for (let index = 1; index < sections.length; index += 1) {
      expect(pdfPositions[index], `PDF section out of order: ${sections[index]}`).toBeGreaterThan(
        pdfPositions[index - 1],
      );
      expect(docxPositions[index], `DOCX section out of order: ${sections[index]}`).toBeGreaterThan(
        docxPositions[index - 1],
      );
    }
  });

  it.each(allCases)("%s renders every clause heading the screen model carries", (key) => {
    const { model, pdfText, docxText } = artifactFor(key);
    const headings = model.terms.map((term) => term.heading);

    expect(headings.length).toBeGreaterThanOrEqual(27);
    expect(new Set(headings).size, "duplicate clause heading").toBe(headings.length);

    const missingFromPdf = headings.filter((heading) => !pdfText.includes(flat(toPdfText(heading))));
    const missingFromDocx = headings.filter((heading) => !docxText.includes(flat(heading)));
    expect(missingFromPdf).toEqual([]);
    expect(missingFromDocx).toEqual([]);
  });

  it.each(allCases)("%s renders the clauses in the model's order, as its own blocks", (key) => {
    // Ordered STRUCTURALLY rather than by string position. Clause bodies quote
    // each other by name — the retainer's Capacity Overage points at Included
    // Advisory Capacity, training's Certification and Cards points at Class
    // Size — so "the first occurrence of heading N is after heading N-1" is
    // false on a perfectly correct document.
    //
    // Every clause heading is drawn as its own run: one Tj in the PDF's
    // two-column block layout, one <w:t> in the DOCX term table. A run that
    // EQUALS a heading is that clause's block; a cross-reference is a fragment
    // inside a longer run and never equals one.
    const { model, pdfLines, docxLines } = artifactFor(key);
    const headings = model.terms.map((term) => term.heading);

    const pdfWanted = new Set(headings.map((heading) => toPdfText(heading)));
    expect(pdfLines.filter((line) => pdfWanted.has(line))).toEqual(headings.map((heading) => toPdfText(heading)));

    const docxWanted = new Set(headings);
    expect(docxLines.filter((line) => docxWanted.has(line))).toEqual(headings);
  });

  it.each(allCases)("%s carries its per-type prose and pills onto both artifacts", (key) => {
    // The headings above are the structure. These are the sentences a client
    // reads — and the ones that were written for a subscription sale.
    const { model, pdfText, docxText } = artifactFor(key);
    const prose = [model.subtitle, model.purposeCallout, model.scopeIntro, model.schedule].filter(Boolean);

    for (const text of prose) {
      expect(pdfText, `missing from PDF: ${text.slice(0, 60)}…`).toContain(flat(toPdfText(text)));
      expect(docxText, `missing from DOCX: ${text.slice(0, 60)}…`).toContain(flat(text));
    }

    // The masthead docline is upper-cased by all three surfaces — CSS
    // `text-transform: uppercase` on screen (proposal-document.css:120),
    // `.toUpperCase()` in pdf.ts:608 and docx.ts:215 — so it is the one line
    // compared without regard to case.
    expect(pdfText.toUpperCase()).toContain(flat(toPdfText(model.docline)).toUpperCase());
    expect(docxText.toUpperCase()).toContain(flat(model.docline).toUpperCase());
    for (const bullet of model.deliverables) {
      expect(pdfText).toContain(flat(toPdfText(bullet)));
      expect(docxText).toContain(flat(bullet));
    }
    for (const pill of model.packagePills) {
      expect(pdfText).toContain(flat(toPdfText(pill.label)));
      expect(docxText).toContain(flat(pill.label));
    }
    for (const group of model.feeGroups) {
      expect(pdfText).toContain(flat(toPdfText(group.label)));
      expect(docxText).toContain(flat(group.label));
    }
  });

  it.each(allCases)("%s shows section 03's empty-state notes on every surface, or on none", (key) => {
    // The model decides whether an absence is worth mentioning: a platform
    // rollout with no implementation phases is missing something, a training
    // proposal is not. Whatever it decides, all five surfaces have to agree —
    // this is the same class of drift as the section headings, one level down.
    const { model, pdfText, docxText } = artifactFor(key);
    const notes: Array<[string, string]> = [
      [model.phaseEmptyNote, model.phaseScope.length === 0 ? "shown" : "hidden"],
      [model.serviceEmptyNote, model.serviceScope.length === 0 ? "shown" : "hidden"],
    ];

    for (const [note, visibility] of notes) {
      if (note === "" || visibility === "hidden") continue;
      expect(pdfText, `the PDF drops the empty-state note "${note}"`).toContain(flat(toPdfText(note)));
      expect(docxText, `the DOCX drops the empty-state note "${note}"`).toContain(flat(note));
    }
    // And a note the model blanked must not be reintroduced by a renderer's own
    // copy of the sentence — how a training client came to be told its proposal
    // had "No implementation phases selected."
    if (model.phaseEmptyNote === "") {
      expect(pdfText).not.toContain("No implementation phases selected");
      expect(docxText).not.toContain("No implementation phases selected");
    }
    if (model.serviceEmptyNote === "") {
      expect(pdfText).not.toContain("No added service lines selected");
      expect(docxText).not.toContain("No added service lines selected");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Every surface is non-empty                                               */
/* -------------------------------------------------------------------------- */

describe("no surface ships blank", () => {
  it.each(allCases)("%s produces a PDF with a plausible page count and ink on every sheet", (key) => {
    const { pdfPages } = artifactFor(key);

    // Under three sheets a document this long has silently lost content; over
    // eight is the ceiling lib/proposals/pdf.test.ts already holds the loaded
    // fixture to. A seeded template sits comfortably between the two.
    expect(pdfPages.length).toBeGreaterThanOrEqual(3);
    expect(pdfPages.length).toBeLessThanOrEqual(8);

    // The owner reported blank pages. A sheet carrying only the stamped footer
    // sits near 60 characters, so the floor is set well above it. Reported as a
    // list so a failure names the blank sheets.
    const thin = pdfPages
      .map((text, index) => ({ page: index + 1, characters: text.length }))
      .filter((sheet) => sheet.characters < 400);
    expect(thin).toEqual([]);
  });

  it.each(allCases)("%s produces a DOCX with real body text", (key) => {
    const { docxBytes, docxText } = artifactFor(key);

    expect(docxBytes.subarray(0, 2).toString()).toBe("PK");
    // The boilerplate parts and the embedded seal clear 10 kB on their own, so
    // bytes prove nothing; the visible runs of word/document.xml do.
    expect(docxText.length).toBeGreaterThan(6_000);
    expect(docxText).toContain("Client Acceptance");
    expect(docxText).toContain("Seller Acceptance");
  });

  it.each(allCases)("%s prints a priced fee table and its acceptance block on both artifacts", (key) => {
    const { model, pdfText, docxText } = artifactFor(key);
    for (const row of model.totalRows) {
      expect(pdfText).toContain(flat(toPdfText(row.label)));
      expect(docxText).toContain(flat(row.label));
    }
    expect(pdfText).toContain(flat(toPdfText(model.acceptance)));
    expect(docxText).toContain(flat(model.acceptance));
    expect(pdfText).toContain(flat(toPdfText(model.legalNotice)));
    expect(docxText).toContain(flat(model.legalNotice));
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Legacy is frozen                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The 27 clause headings, in order, exactly as every proposal sent before
 * proposal types existed carries them.
 *
 * Written out as literals on purpose. Deriving them from `sharedClauseIds` or
 * `legacyDocumentCopy` would assert that the code agrees with itself; these are
 * transcribed from the pre-refactor `buildDocumentTerms()` and are what is
 * sitting in clients' inboxes.
 */
const legacyClauseHeadings: readonly string[] = [
  "Payment Terms",
  "Scope Changes",
  "Confidentiality",
  "Data Privacy — CCPA/CPRA (California)",
  "Data Privacy — Multi-State",
  "Data Breach Notification",
  "Data and AI Use",
  "Intellectual Property",
  "Trade Secrets — Wisconsin & Federal",
  "Client Data Ownership",
  "Limitation of Liability",
  "Warranty Disclaimer",
  "No Guarantee of Outcome",
  "OSHA Compliance Disclaimer",
  "Indemnification",
  "Dispute Resolution & Arbitration",
  "California Auto-Renewal Law",
  "Electronic Signatures (E-SIGN / UETA)",
  "Taxes & SaaS Fees",
  "Independent Contractor",
  "Force Majeure",
  "Governing Law & Venue",
  "Non-Solicitation",
  "Severability",
  "Entire Agreement",
  "Termination",
  "Proposal Validity",
];

describe("a proposal with no type stamped renders exactly as it always did", () => {
  it("prints the original 27 clauses, in order", () => {
    expect(artifactFor(legacyKey).model.terms.map((term) => term.heading)).toEqual(legacyClauseHeadings);
  });

  it("prints the original clause BODIES, byte for byte", () => {
    // buildDocumentTerms() is the pre-refactor implementation, still exported
    // from proposal-document-model.ts. Comparing against it is the strongest
    // freeze available: the per-type composition may add, drop and reword
    // clauses for the seven types, and must change nothing for a document that
    // predates them.
    expect(artifactFor(legacyKey).model.terms).toEqual(
      buildDocumentTerms({
        paymentTerms: documentTermDefaults.paymentTerms,
        lateFee: documentTermDefaults.lateFee,
        aiData: documentTermDefaults.aiData,
        ipRights: documentTermDefaults.ipRights,
        liabilityCap: documentTermDefaults.liabilityCap,
        governingLaw: documentTermDefaults.governingLaw,
        validDays: documentTermDefaults.validDays,
      }),
    );
  });

  it("prints the original section headings", () => {
    const { model } = artifactFor(legacyKey);
    expect(model.packageHeading).toBe("Selected Platform Package");
    expect(model.scopeHeading).toBe("Detailed Scope of Work");
    expect(model.feesHeading).toBe("Pricing Schedule");
    expect(model.termHeading).toBe("Schedule and Implementation Approach");
    expect(model.docline).toBe("Platform Services Proposal");
    expect(model.proposalTypeLabel).toBeNull();
  });

  it("prints the original deliverables", () => {
    expect(artifactFor(legacyKey).model.deliverables).toEqual([
      "Configured platform subscription and client account setup",
      "Billing package selection and proposal pricing schedule",
      "User and jobsite structure based on the selected package",
      "Management-ready scope, assumptions, and acceptance documentation",
    ]);
  });

  it("prints the original narrative copy", () => {
    const { model } = artifactFor(legacyKey);
    expect(model.subtitle).toBe(
      "Safety Intelligence, Compliance Support, and Predictive Risk Platform Services",
    );
    expect(model.purposeCallout).toBe(
      "This document establishes the proposed scope, pricing, payment structure, deliverables, assumptions, and " +
        "commercial terms for platform billing and related safety technology support.",
    );
    expect(model.scopeIntro).toBe(
      "The selected services are organized into practical work phases and service lines so the proposal can be " +
        "scaled for a small pilot, a single jobsite, a multi-site deployment, or a full enterprise platform rollout.",
    );
    expect([...model.scheduleSteps]).toEqual([
      "Kickoff and access setup",
      "Client data intake and configuration",
      "Platform setup, modules, templates, workflows, and user roles",
      "Validation review with client leadership",
      "Launch support, user training, and final billing activation",
    ]);
    expect([...model.clientResponsibilities]).toEqual([
      "Provide accurate company, jobsite, user, and billing information.",
      "Identify authorized reviewers and approvers for scope, pricing, security, and legal terms.",
      "Provide existing safety documents, templates, forms, training matrices, and site-specific requirements needed for configuration.",
      "Review draft outputs in a timely manner and consolidate feedback when possible.",
      "Maintain responsibility for final operational decisions, employee discipline, regulatory filings, and site execution.",
    ]);
  });

  it("keeps the platform-era empty-state notes and the asset's selected billing term", () => {
    const { model } = artifactFor(legacyKey);
    expect(model.phaseEmptyNote).toBe("No implementation phases selected.");
    expect(model.serviceEmptyNote).toBe("No added service lines selected.");
    // The one commercial default that names a deal. A typed proposal must never
    // inherit it; an untyped one printed it and must keep printing it.
    expect(model.packagePills.find((pill) => pill.label === "Billing")?.value).toBe("One-time (pilot)");
    expect(model.schedule).toContain("implementation follows the order shown in the scope");
  });

  it("carries the frozen copy through to the PDF and the DOCX", () => {
    const { pdfText, docxText } = artifactFor(legacyKey);
    for (const heading of legacyClauseHeadings) {
      expect(pdfText).toContain(flat(toPdfText(heading)));
      expect(docxText).toContain(flat(heading));
    }
    expect(pdfText).toContain("Configured platform subscription and client account setup");
    expect(docxText).toContain("Configured platform subscription and client account setup");
  });
});

/* -------------------------------------------------------------------------- */
/* 6. No per-deal commercial value is hardcoded                                */
/* -------------------------------------------------------------------------- */

/** Values no template, profile or renderer may bake in — they are per deal. */
const negotiatedTerms = {
  paymentTerms: "Net 45 on invoice, 20% due at acceptance",
  liabilityCap: "two times the fees paid in the preceding six months",
  governingLaw: "Minnesota (primary)",
  validDays: "21",
};

describe("the seller's own commercial terms reach every document", () => {
  it.each(allCases)("%s interpolates the DEFAULT commercial terms into its rendered clauses", (key) => {
    const { pdfText, docxText } = artifactFor(key);
    for (const value of [
      documentTermDefaults.paymentTerms,
      "Fees paid under this proposal in the prior 12 months",
      documentTermDefaults.governingLaw,
      `${documentTermDefaults.validDays} calendar days`,
    ]) {
      expect(pdfText, `missing from the ${key} PDF: ${value}`).toContain(flat(toPdfText(value)));
      expect(docxText, `missing from the ${key} DOCX: ${value}`).toContain(flat(value));
    }
  });

  it.each(allCases)("%s interpolates NEGOTIATED commercial terms rather than a frozen sentence", (key) => {
    // The default check above passes on a profile that overrode a clause
    // wholesale and pasted the default text in as prose. This one changes every
    // value, so only a clause that genuinely interpolates survives it.
    const state = stateFor(key);
    const model = modelFor({ ...state, fields: { ...state.fields, ...negotiatedTerms } });
    const clauses = model.terms.map((term) => `${term.heading}\n${term.body}`).join("\n");

    expect(clauses, "payment terms are not interpolated").toContain(negotiatedTerms.paymentTerms);
    expect(clauses, "the liability cap is not interpolated").toContain(negotiatedTerms.liabilityCap);
    expect(clauses, "governing law is not interpolated").toContain(negotiatedTerms.governingLaw);
    expect(clauses, "the validity window is not interpolated").toContain(`${negotiatedTerms.validDays} calendar days`);

    // And the defaults must be gone — a clause that prints both is quoting two
    // different deals on the same page.
    expect(clauses).not.toContain(documentTermDefaults.governingLaw);
    expect(clauses).not.toContain("Fees paid under this proposal in the prior 12 months");
  });

  it.each(allCases)("%s keeps the clauses that protect the company, whatever its profile drops", (key) => {
    // composeDocumentTerms refuses to let a profile omit these; this is the
    // assertion that the refusal actually reaches the document.
    const headings = artifactFor(key).model.terms.map((term) => term.heading).join("\n");
    for (const required of [
      /confidentialit/i,
      /limitation of liability/i,
      /warranty disclaimer|standard of care/i,
      /osha/i,
      /indemnification/i,
      /dispute resolution/i,
      /governing law/i,
      /entire agreement/i,
      /proposal validity/i,
    ]) {
      expect(headings, `no clause matching ${required} on ${key}`).toMatch(required);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 7. Internal consistency — a seeded template passes the platform's own checks */
/* -------------------------------------------------------------------------- */

/**
 * Findings that are a property of the BARE FIXTURE, not of the template.
 *
 * A freshly seeded proposal genuinely has no client, no team and no signer —
 * the seller supplies those. Everything else is the template's own doing, and
 * a template that trips the platform's readiness rules is a template that ships
 * broken.
 */
const fixtureAttributableFindings = new Set(["client_missing", "client_unassigned", "client_contact_email", "team_bios", "signer"]);

describe("each seeded template passes the platform's own readiness checks", () => {
  it.each(transactionTemplateKeys)("%s trips no finding of its own", (key) => {
    const findings = collectReadinessFindings(artifactFor(key).state, {
      status: "draft",
      validUntil: null,
      clientAssigned: true,
      today: "2026-08-12",
    });

    const templateAttributable = findings
      .filter((finding) => !fixtureAttributableFindings.has(finding.id))
      .map((finding) => `[${finding.severity}] ${finding.id} (${finding.area}): ${finding.message}`);
    expect(templateAttributable).toEqual([]);
  });

  it.each(transactionTemplateKeys)("%s states facts that agree with what it sells", (key) => {
    const facts = collectProposalFacts(artifactFor(key).state);

    expect(facts.servicesOnly).toBe(!sellsSubscription(key));
    expect(facts.proposalTypeLabel, "the type stamp did not survive into the facts").not.toBeNull();
    expect(facts.total).toBeGreaterThan(0);
    // Zero is only a legitimate headline figure when the deal genuinely costs
    // nothing; a seeded template that leaves it in the accepted set lets
    // "priced at $0.00" pass the consistency scanner.
    expect(facts.moneyFigures).not.toContain(0);
    // The AI reviewer is handed these as AUTHORITATIVE FACTS under a rule that
    // forbids it introducing a number that is not in the block. Seats on a
    // training deal would invite it to write a roster limit nobody bought.
    if (facts.servicesOnly) {
      expect(facts.users).toBe(0);
      expect(facts.sites).toBe(0);
      expect(facts.packageName).toBe("");
      expect(facts.packagePrice).toBe(0);
    } else {
      expect(facts.users).toBeGreaterThan(0);
      expect(facts.sites).toBeGreaterThan(0);
      expect(facts.packageName).not.toBe("");
    }
    // A billing cadence naming a pilot belongs only to the pilot.
    expect(facts.billingTerm).not.toBe("");
    if (key !== "pilot") expect(facts.billingTerm).not.toMatch(/pilot/i);
  });

  it("the untyped legacy state reports exactly the findings an empty proposal should", () => {
    // Not a template, so it is held to a different bar: a blank document SHOULD
    // report an empty summary and a zero total. What it must not do is report a
    // type-specific finding, because it has no type.
    const findings = collectReadinessFindings(artifactFor(legacyKey).state, {
      status: "draft",
      validUntil: null,
      clientAssigned: true,
      today: "2026-08-12",
    });
    const ids = findings.map((finding) => finding.id);
    expect(ids).toContain("summary_empty");
    expect(ids).toContain("total_zero");
    expect(ids).not.toContain("subscription_type_without_package");
    expect(ids).not.toContain("training_below_class_minimum");
    expect(ids.filter((id) => id.startsWith("figures:"))).toEqual([]);
    expect(collectProposalFacts(artifactFor(legacyKey).state).proposalTypeLabel).toBeNull();
  });
});
