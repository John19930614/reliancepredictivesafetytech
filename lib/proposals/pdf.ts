// Server-side PDF rendering for a client proposal.
//
// WHY THIS EXISTS RATHER THAN "PRINT TO PDF"
//   Browsers draw their own header and footer into the page margin — document
//   title, the URL the page was served from, the date, the page number. That is
//   the file route that was appearing on every page of a saved proposal. No CSS
//   can turn it off; it is a print-dialog checkbox. The stylesheet's zero-margin
//   trick suppresses it in Chrome and Edge, but Firefox and Safari still honour
//   their own setting, and a client-facing commercial document should not depend
//   on which browser the seller happened to use.
//
//   Generating the file ourselves means the footer says exactly what we decided
//   it says, the page count is ours, and the seller's stored signature is
//   embedded rather than left as a blank line.
//
// ONE SOURCE OF CONTENT
//   Every string and number below comes from buildProposalDocumentModel() — the
//   same view-model <ProposalDocument> renders. This file decides LAYOUT only.
//   If a section's wording needs to change, change the model, not this file, or
//   the PDF and the on-screen document will disagree the way the generator's
//   preview used to disagree with the platform's.

import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { DocumentPill, ProposalDocumentModel } from "@/components/proposals/proposal-document-model";
import { proposalFooterText } from "./types";

/* -------------------------------------------------------------------------- */
/* Page geometry                                                              */
/* -------------------------------------------------------------------------- */

const PAGE_WIDTH = 612; // US Letter at 72dpi
const PAGE_HEIGHT = 792;
const MARGIN_X = 44;
const MARGIN_TOP = 42;
/** Deep enough to clear the footer rule and its text on every page. */
const MARGIN_BOTTOM = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const NAVY = rgb(0.047, 0.204, 0.314);
const NAVY_2 = rgb(0.086, 0.384, 0.498);
const GOLD = rgb(0.788, 0.576, 0.169);
const INK = rgb(0.086, 0.141, 0.184);
const MUTED = rgb(0.35, 0.42, 0.49);
const RULE = rgb(0.78, 0.82, 0.855);
const BAND = rgb(0.945, 0.965, 0.98);
const GOLD_TINT = rgb(0.984, 0.949, 0.867);

/** Two columns for the commercial terms — the same shape the print CSS uses. */
const COLUMN_GAP = 14;
const COLUMN_WIDTH = (CONTENT_WIDTH - COLUMN_GAP) / 2;

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/* -------------------------------------------------------------------------- */
/* Text measurement and wrapping                                              */
/* -------------------------------------------------------------------------- */

/**
 * pdf-lib's standard fonts cannot encode characters outside WinAnsi, and
 * `drawText` throws on the first one it meets. The document legitimately
 * contains em dashes, en dashes, curly quotes and "≤" (from the document size
 * catalog), so they are folded to ASCII equivalents rather than allowed to take
 * down the whole download.
 */
const characterFolds: Array<[RegExp, string]> = [
  [/[‘’‛]/g, "'"],
  [/[“”]/g, '"'],
  [/[–]/g, "-"],
  [/[—]/g, "--"],
  [/[…]/g, "..."],
  [/[≤]/g, "<="],
  [/[≥]/g, ">="],
  [/[   ]/g, " "],
  [/[•]/g, "-"],
];

export function toPdfText(value: string): string {
  let out = value;
  for (const [pattern, replacement] of characterFolds) out = out.replace(pattern, replacement);
  // Anything still outside Latin-1 would throw at draw time.
  return out.replace(/[^\x20-\x7E\xA1-\xFF\n]/g, "");
}

/**
 * Greedy word wrap.
 *
 * A single word longer than the column (a URL, a long statute reference) is
 * hard-split rather than allowed to overflow the margin.
 */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = toPdfText(text).replace(/\s+/g, " ").trim();
  if (clean === "") return [];

  const lines: string[] = [];
  let current = "";

  for (const word of clean.split(" ")) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current !== "") lines.push(current);

    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    // Hard-split an unbreakable token.
    let chunk = "";
    for (const char of word) {
      if (font.widthOfTextAtSize(chunk + char, size) > maxWidth && chunk !== "") {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk += char;
      }
    }
    current = chunk;
  }

  if (current !== "") lines.push(current);
  return lines;
}

/* -------------------------------------------------------------------------- */
/* Cursor — a page plus a y position, that knows how to start a new page       */
/* -------------------------------------------------------------------------- */

class Layout {
  readonly doc: PDFDocument;
  readonly fonts: Fonts;
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;

  constructor(doc: PDFDocument, fonts: Fonts) {
    this.doc = doc;
    this.fonts = fonts;
    this.newPage();
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    this.y = PAGE_HEIGHT - MARGIN_TOP;
  }

  get bottom(): number {
    return MARGIN_BOTTOM;
  }

  /** Starts a new page unless `height` still fits above the footer. */
  ensure(height: number): void {
    if (this.y - height < this.bottom) this.newPage();
  }

  space(amount: number): void {
    this.y -= amount;
  }

  /**
   * Draws wrapped text and advances the cursor, breaking pages as needed.
   * Returns the y position after the last line.
   */
  text(
    value: string,
    options: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      x?: number;
      width?: number;
      lineHeight?: number;
    } = {},
  ): void {
    const font = options.font ?? this.fonts.regular;
    const size = options.size ?? 8.6;
    const color = options.color ?? INK;
    const x = options.x ?? MARGIN_X;
    const width = options.width ?? CONTENT_WIDTH;
    const lineHeight = options.lineHeight ?? size * 1.32;

    for (const line of wrapText(value, font, size, width)) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      this.page.drawText(line, { x, y: this.y, size, font, color });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Section pieces                                                             */
/* -------------------------------------------------------------------------- */

function drawSectionHeading(layout: Layout, number: string, title: string): void {
  const size = 12.2;
  // Keep the heading with at least the first line of whatever follows.
  layout.ensure(size * 3);
  layout.space(10);
  layout.y -= size;

  const badgeWidth = 24;
  layout.page.drawRectangle({
    x: MARGIN_X,
    y: layout.y - 5,
    width: badgeWidth,
    height: 21,
    color: NAVY,
  });
  layout.page.drawText(number, {
    x: MARGIN_X + 5.5,
    y: layout.y,
    size: 8.8,
    font: layout.fonts.bold,
    color: GOLD,
  });
  layout.page.drawText(toPdfText(title), {
    x: MARGIN_X + badgeWidth + 10,
    y: layout.y,
    size,
    font: layout.fonts.bold,
    color: NAVY,
  });

  layout.y -= 4;
  layout.page.drawLine({
    start: { x: MARGIN_X, y: layout.y },
    end: { x: PAGE_WIDTH - MARGIN_X, y: layout.y },
    thickness: 0.6,
    color: RULE,
  });
  layout.space(5);
}

function drawCallout(layout: Layout, label: string, body: string): void {
  const size = 8.2;
  const lineHeight = size * 1.32;
  const labelWidth = layout.fonts.bold.widthOfTextAtSize(label, size);
  const bodyLines = wrapText(body, layout.fonts.regular, size, CONTENT_WIDTH - labelWidth - 24);
  const height = Math.max(24, bodyLines.length * lineHeight + 14);
  layout.ensure(height);
  const top = layout.y;
  layout.y -= height;

  layout.page.drawRectangle({
    x: MARGIN_X,
    y: layout.y,
    width: CONTENT_WIDTH,
    height,
    color: BAND,
    borderColor: RULE,
    borderWidth: 0.4,
  });
  layout.page.drawRectangle({ x: MARGIN_X, y: layout.y, width: 4, height, color: GOLD });
  layout.page.drawText(toPdfText(label), {
    x: MARGIN_X + 10,
    y: top - 15,
    size,
    font: layout.fonts.bold,
    color: NAVY,
  });
  bodyLines.forEach((line, index) => {
    layout.page.drawText(line, {
      x: MARGIN_X + 10 + labelWidth,
      y: top - 15 - index * lineHeight,
      size,
      font: layout.fonts.regular,
      color: INK,
    });
  });
  layout.space(3);
}

function drawPills(layout: Layout, pills: readonly DocumentPill[]): void {
  const gap = 7;
  const columns = 3;
  const width = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
  const height = 20;

  for (let index = 0; index < pills.length; index += columns) {
    layout.ensure(height + 5);
    const row = pills.slice(index, index + columns);
    const top = layout.y;
    layout.y -= height;
    row.forEach((pill, offset) => {
      const x = MARGIN_X + offset * (width + gap);
      layout.page.drawRectangle({
        x,
        y: layout.y,
        width,
        height,
        color: rgb(1, 1, 1),
        borderColor: RULE,
        borderWidth: 0.45,
      });
      const label = `${pill.label}: ${pill.value}`;
      layout.page.drawText(toPdfText(label), {
        x: x + 6,
        y: top - 13,
        size: 7.5,
        font: layout.fonts.bold,
        color: NAVY,
      });
    });
    layout.space(4);
  }
}

function drawBullets(layout: Layout, items: readonly string[]): void {
  for (const item of items) {
    const lines = wrapText(item, layout.fonts.regular, 8.6, CONTENT_WIDTH - 12);
    layout.ensure(8.6 * 1.32 * lines.length);
    let first = true;
    for (const line of lines) {
      layout.ensure(8.6 * 1.32);
      layout.y -= 8.6 * 1.32;
      if (first) {
        layout.page.drawRectangle({
          x: MARGIN_X + 3,
          y: layout.y + 2.5,
          width: 4.5,
          height: 4.5,
          color: GOLD,
        });
        first = false;
      }
      layout.page.drawText(line, {
        x: MARGIN_X + 12,
        y: layout.y,
        size: 8.6,
        font: layout.fonts.regular,
        color: INK,
      });
    }
  }
}

/** Column widths for the pricing table, summing to CONTENT_WIDTH. */
const feeColumns = [148, 200, 44, 60, 68];

function drawFeeRow(
  layout: Layout,
  cells: string[],
  options: { bold?: boolean; background?: ReturnType<typeof rgb>; color?: ReturnType<typeof rgb> } = {},
): void {
  const size = 7.8;
  const font = options.bold ? layout.fonts.bold : layout.fonts.regular;
  const color = options.color ?? INK;
  const padding = 4;

  // Measure first so the row is never split across a page boundary.
  const wrapped = cells.map((cell, index) =>
    wrapText(cell, font, size, feeColumns[index] - padding * 2),
  );
  const lineCount = Math.max(1, ...wrapped.map((lines) => lines.length));
  const rowHeight = lineCount * size * 1.3 + padding * 2;

  layout.ensure(rowHeight);
  const top = layout.y;
  layout.y -= rowHeight;

  if (options.background) {
    layout.page.drawRectangle({
      x: MARGIN_X,
      y: layout.y,
      width: CONTENT_WIDTH,
      height: rowHeight,
      color: options.background,
    });
  }

  let x = MARGIN_X;
  wrapped.forEach((lines, index) => {
    const columnWidth = feeColumns[index];
    // Qty, unit price and amount are right-aligned, like the HTML table.
    const alignRight = index >= 2;
    lines.forEach((line, lineIndex) => {
      const textWidth = font.widthOfTextAtSize(line, size);
      const textX = alignRight ? x + columnWidth - padding - textWidth : x + padding;
      layout.page.drawText(line, {
        x: textX,
        y: top - padding - size - lineIndex * size * 1.3,
        size,
        font,
        color,
      });
    });
    x += columnWidth;
  });

  layout.page.drawLine({
    start: { x: MARGIN_X, y: layout.y },
    end: { x: PAGE_WIDTH - MARGIN_X, y: layout.y },
    thickness: 0.4,
    color: RULE,
  });
}

/**
 * Two-column block renderer for the commercial terms and the bios.
 *
 * Balances by filling the left column down the page, then the right, per page:
 * the terms are read as reference material, so column order matters less than
 * not wasting half a sheet.
 */
function drawTwoColumnBlocks(
  layout: Layout,
  blocks: Array<{ heading: string; body: string[] }>,
  options: { headingSize?: number; bodySize?: number; boxed?: boolean } = {},
): void {
  const headingSize = options.headingSize ?? 8;
  const bodySize = options.bodySize ?? 7.1;
  const headingLine = headingSize * 1.3;
  const bodyLine = bodySize * 1.28;
  const blockGap = 6;

  const measured = blocks.map((block) => {
    const headingLines = wrapText(block.heading, layout.fonts.bold, headingSize, COLUMN_WIDTH - 8);
    const bodyLines = block.body.flatMap((paragraph) =>
      wrapText(paragraph, layout.fonts.regular, bodySize, COLUMN_WIDTH - 8),
    );
    return {
      headingLines,
      bodyLines,
      height: headingLines.length * headingLine + bodyLines.length * bodyLine + blockGap + 4,
    };
  });

  let column = 0;
  let columnTop = layout.y;
  let cursor = layout.y;
  let lowest = layout.y;

  const columnX = () => MARGIN_X + column * (COLUMN_WIDTH + COLUMN_GAP);

  for (const block of measured) {
    if (cursor - block.height < layout.bottom) {
      if (column === 0) {
        column = 1;
        cursor = columnTop;
      } else {
        layout.newPage();
        column = 0;
        columnTop = layout.y;
        cursor = layout.y;
        lowest = layout.y;
      }
    }

    const x = columnX();
    let y = cursor;

    if (options.boxed) {
      layout.page.drawRectangle({
        x: x - 3,
        y: cursor - block.height + 2,
        width: COLUMN_WIDTH,
        height: block.height - 2,
        color: rgb(1, 1, 1),
        borderColor: RULE,
        borderWidth: 0.35,
      });
      layout.page.drawRectangle({
        x: x - 3,
        y: cursor - block.height + 2,
        width: 2.2,
        height: block.height - 2,
        color: GOLD,
      });
    }

    for (const line of block.headingLines) {
      y -= headingLine;
      layout.page.drawText(line, { x, y, size: headingSize, font: layout.fonts.bold, color: NAVY });
    }
    for (const line of block.bodyLines) {
      y -= bodyLine;
      layout.page.drawText(line, { x, y, size: bodySize, font: layout.fonts.regular, color: INK });
    }

    cursor = y - blockGap;
    if (cursor < lowest) lowest = cursor;
  }

  layout.y = Math.min(cursor, lowest);
}

/* -------------------------------------------------------------------------- */
/* Footer                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Stamps the footer on every page once the total is known.
 *
 * Run LAST, after all content is laid out, because "Page 3 of 7" cannot be
 * written before the seventh page exists. This is the whole reason the download
 * is generated server-side: the line below is the only thing in the page
 * margin, so the file route can never appear there.
 */
export function stampFooters(layout: Layout): void {
  const total = layout.pages.length;
  const size = 6.8;
  const y = MARGIN_BOTTOM - 18;

  layout.pages.forEach((page, index) => {
    page.drawLine({
      start: { x: MARGIN_X, y: y + 11 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: y + 11 },
      thickness: 0.5,
      color: RULE,
    });
    page.drawText(toPdfText(proposalFooterText()), {
      x: MARGIN_X,
      y,
      size,
      font: layout.fonts.regular,
      color: MUTED,
    });
    const pageLabel = `Page ${index + 1} of ${total}`;
    const width = layout.fonts.regular.widthOfTextAtSize(pageLabel, size);
    page.drawText(pageLabel, {
      x: PAGE_WIDTH - MARGIN_X - width,
      y,
      size,
      font: layout.fonts.regular,
      color: MUTED,
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Document                                                                   */
/* -------------------------------------------------------------------------- */

export interface ProposalPdfOptions {
  model: ProposalDocumentModel;
  /** Shown in the PDF metadata title. */
  documentTitle: string;
}

async function tryEmbedSeal(doc: PDFDocument) {
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "reliance-seal-transparent.png"));
    return await doc.embedPng(bytes);
  } catch {
    return null;
  }
}

export async function renderProposalPdf({ model, documentTitle }: ProposalPdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const seal = await tryEmbedSeal(doc);

  doc.setTitle(toPdfText(documentTitle));
  doc.setProducer(toPdfText(model.wordmark));
  doc.setCreator(toPdfText(model.wordmark));

  const layout = new Layout(doc, fonts);

  /* --- Masthead --------------------------------------------------------- */
  const mastheadTop = layout.y;
  const sealSize = 58;
  if (seal) {
    layout.page.drawImage(seal, {
      x: MARGIN_X,
      y: mastheadTop - sealSize,
      width: sealSize,
      height: sealSize,
    });
  }
  const textX = seal ? MARGIN_X + sealSize + 14 : MARGIN_X;
  layout.page.drawText(toPdfText(model.wordmark), {
    x: textX,
    y: mastheadTop - 21,
    size: 15.2,
    font: fonts.bold,
    color: NAVY,
  });
  const stamp = "PROPOSAL";
  const stampWidth = fonts.bold.widthOfTextAtSize(stamp, 8.8);
  const stampX = PAGE_WIDTH - MARGIN_X - Math.max(stampWidth + 18, 78);
  layout.page.drawRectangle({
    x: stampX,
    y: mastheadTop - 23,
    width: Math.max(stampWidth + 12, 72),
    height: 22,
    color: NAVY,
  });
  layout.page.drawText(stamp, {
    x: stampX + 9,
    y: mastheadTop - 16.2,
    size: 8.8,
    font: fonts.bold,
    color: rgb(1, 1, 1),
  });
  layout.page.drawText(toPdfText(model.docline.toUpperCase()), {
    x: textX,
    y: mastheadTop - 37,
    size: 7.8,
    font: fonts.regular,
    color: MUTED,
  });
  const conf = "CONFIDENTIAL";
  const confWidth = fonts.bold.widthOfTextAtSize(conf, 7.2);
  layout.page.drawText(conf, {
    x: PAGE_WIDTH - MARGIN_X - confWidth,
    y: mastheadTop - 37,
    size: 7.2,
    font: fonts.bold,
    color: GOLD,
  });
  const revisionTag = toPdfText(`${model.revisionLabel ?? model.currentRevisionLabel} - ${model.statusLabel}`);
  const revisionTagWidth = fonts.regular.widthOfTextAtSize(revisionTag, 7.2);
  layout.page.drawRectangle({
    x: PAGE_WIDTH - MARGIN_X - revisionTagWidth - 14,
    y: mastheadTop - 56,
    width: revisionTagWidth + 14,
    height: 16,
    color: rgb(1, 1, 1),
    borderColor: RULE,
    borderWidth: 0.4,
  });
  layout.page.drawText(revisionTag, {
    x: PAGE_WIDTH - MARGIN_X - revisionTagWidth - 7,
    y: mastheadTop - 51,
    size: 7.2,
    font: fonts.bold,
    color: NAVY,
  });
  layout.y = mastheadTop - sealSize - 9;
  layout.page.drawRectangle({
    x: MARGIN_X,
    y: layout.y,
    width: CONTENT_WIDTH,
    height: 3,
    color: NAVY,
  });
  layout.page.drawRectangle({
    x: MARGIN_X,
    y: layout.y,
    width: 128,
    height: 3,
    color: GOLD,
  });
  layout.space(14);

  layout.text(model.headline, { font: fonts.bold, size: 19.2, color: NAVY, lineHeight: 22.4 });
  layout.space(2);
  layout.text(model.subtitle, { size: 9.2, color: MUTED });
  layout.space(8);

  /* --- Party / meta table ----------------------------------------------- */
  const metaRows: Array<[string, string[]]> = [
    ["Prepared For", [model.preparedFor.name, ...model.preparedFor.lines]],
    ["Prepared By", [model.preparedByBlock.name, ...model.preparedByBlock.lines]],
    ["Proposal Date", [model.proposalDate]],
    ["Proposal Number", [model.proposalNumber]],
  ];
  if (model.termLabel) metaRows.push(["Engagement Term", [model.termLabel]]);
  metaRows.push(["Validity", [model.validity]]);

  const labelWidth = 96;
  for (const [label, values] of metaRows) {
    const valueLines = values.flatMap((value) => wrapText(value, fonts.regular, 8, CONTENT_WIDTH - labelWidth - 12));
    const rowHeight = Math.max(1, valueLines.length) * 10.4 + 5;
    layout.ensure(rowHeight);
    const top = layout.y;
    layout.y -= rowHeight;

    layout.page.drawRectangle({
      x: MARGIN_X,
      y: layout.y,
      width: labelWidth,
      height: rowHeight,
      color: NAVY,
    });
    layout.page.drawText(toPdfText(label), {
      x: MARGIN_X + 5,
      y: top - 12,
      size: 7.6,
      font: fonts.bold,
      color: rgb(1, 1, 1),
    });
    valueLines.forEach((line, index) => {
      layout.page.drawText(line, {
        x: MARGIN_X + labelWidth + 7,
        y: top - 12 - index * 10.4,
        size: 8,
        font: index === 0 ? fonts.bold : fonts.regular,
        color: INK,
      });
    });
    layout.page.drawLine({
      start: { x: MARGIN_X, y: layout.y },
      end: { x: PAGE_WIDTH - MARGIN_X, y: layout.y },
      thickness: 0.4,
      color: RULE,
    });
  }

  /* --- 01 Executive Summary --------------------------------------------- */
  drawSectionHeading(layout, "01", "Executive Summary");
  layout.text(model.summary, { size: 9 });
  layout.space(4);
  drawCallout(layout, "Proposal Purpose: ", model.purposeCallout);

  /* --- 02 Package -------------------------------------------------------- */
  drawSectionHeading(layout, "02", model.packageHeading);
  layout.text(model.packageIntro);
  layout.space(4);
  drawPills(layout, model.packagePills);

  /* --- 03 Scope ---------------------------------------------------------- */
  drawSectionHeading(layout, "03", model.scopeHeading);
  layout.text(model.scopeIntro);
  layout.space(2);
  const scope = [...model.phaseScope, ...model.serviceScope];
  if (scope.length === 0) {
    layout.text("No implementation phases or service lines selected.", { color: MUTED });
  }
  for (const entry of scope) {
    layout.space(3);
    layout.text(entry.heading, { font: fonts.bold, size: 8.8, color: NAVY });
    if (entry.body) layout.text(entry.body);
  }

  /* --- 04 Deliverables --------------------------------------------------- */
  drawSectionHeading(layout, "04", "Deliverables");
  drawBullets(layout, model.deliverables);
  if (model.deliverablesCoverage) {
    layout.space(3);
    layout.text(model.deliverablesCoverage);
  }

  /* --- 05 Pricing -------------------------------------------------------- */
  drawSectionHeading(layout, "05", model.feesHeading);
  drawFeeRow(layout, ["Item", "Description", "Qty", "Unit Price", "Amount"], {
    bold: true,
    background: NAVY,
    color: rgb(1, 1, 1),
  });
  for (const group of model.feeGroups) {
    drawFeeRow(layout, [group.label, "", "", "", ""], { bold: true, background: BAND, color: NAVY });
    for (const row of group.rows) {
      drawFeeRow(layout, [row.name || "-", row.desc, row.qtyLabel, row.priceLabel, row.amountLabel]);
    }
  }
  for (const row of model.totalRows) {
    drawFeeRow(layout, ["", "", "", row.label, row.value], {
      bold: row.emphasis === "total",
      background: row.emphasis === "total" ? NAVY : row.emphasis === "deposit" ? GOLD_TINT : BAND,
      color: row.emphasis === "total" ? rgb(1, 1, 1) : INK,
    });
  }

  /* --- 06 Schedule ------------------------------------------------------- */
  drawSectionHeading(layout, "06", model.termHeading);
  layout.text(model.schedule);
  layout.space(3);
  drawBullets(layout, model.scheduleSteps);

  /* --- 07 Client responsibilities ---------------------------------------- */
  drawSectionHeading(layout, "07", "Client Responsibilities");
  drawBullets(layout, model.clientResponsibilities);

  /* --- 08 Assumptions ---------------------------------------------------- */
  drawSectionHeading(layout, "08", "Assumptions and Exclusions");
  layout.text(model.exclusions);

  /* --- 09 Team (optional) ------------------------------------------------ */
  let sectionNumber = 9;
  const pad = (value: number) => String(value).padStart(2, "0");
  if (model.team.length > 0) {
    drawSectionHeading(layout, pad(sectionNumber), "Your Team");
    sectionNumber += 1;
    drawTwoColumnBlocks(
      layout,
      model.team.map((member) => ({
        heading: member.title ? `${member.name} - ${member.title}` : member.name,
        body: member.paragraphs,
      })),
      { headingSize: 8.6, bodySize: 7.4, boxed: true },
    );
    layout.space(4);
  }

  /* --- Commercial and legal terms ---------------------------------------- */
  drawSectionHeading(layout, pad(sectionNumber), "Commercial and Legal Terms");
  sectionNumber += 1;
  drawTwoColumnBlocks(
    layout,
    model.terms.map((term) => ({ heading: term.heading, body: [term.body] })),
    { boxed: true },
  );
  layout.space(6);

  /* --- Acceptance -------------------------------------------------------- */
  drawSectionHeading(layout, pad(sectionNumber), "Acceptance Statement");
  layout.text(model.acceptance);
  layout.space(6);

  await drawSignatureBlocks(layout, doc, model);

  layout.space(10);
  layout.text(model.legalNotice, { size: 6.6, color: MUTED });

  stampFooters(layout);

  return doc.save();
}

/**
 * The two signature boxes.
 *
 * Drawn as one unit and pushed to a new page rather than split: a signature
 * line orphaned from its heading is the kind of thing that gets a document
 * queried during execution.
 */
async function drawSignatureBlocks(
  layout: Layout,
  doc: PDFDocument,
  model: ProposalDocumentModel,
): Promise<void> {
  const boxHeight = 112;
  layout.ensure(boxHeight + 6);
  const top = layout.y;
  layout.y -= boxHeight;

  const boxes: Array<{ title: string; lines: string[] }> = [
    {
      title: "Client Acceptance",
      lines: ["Authorized Signature / Date", "Printed Name / Title", "Purchase Order Number, if applicable"],
    },
    { title: "Seller Acceptance", lines: [] },
  ];

  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index];
    const x = MARGIN_X + index * (COLUMN_WIDTH + COLUMN_GAP);

    layout.page.drawRectangle({
      x,
      y: layout.y,
      width: COLUMN_WIDTH,
      height: boxHeight,
      borderColor: RULE,
      borderWidth: 0.6,
    });
    layout.page.drawText(toPdfText(box.title), {
      x: x + 8,
      y: top - 15,
      size: 9,
      font: layout.fonts.bold,
      color: NAVY,
    });

    let lineY = top - 44;
    for (const label of box.lines) {
      layout.page.drawLine({
        start: { x: x + 8, y: lineY },
        end: { x: x + COLUMN_WIDTH - 8, y: lineY },
        thickness: 0.5,
        color: rgb(0.29, 0.35, 0.42),
      });
      layout.page.drawText(toPdfText(label), {
        x: x + 8,
        y: lineY - 8,
        size: 6.6,
        font: layout.fonts.regular,
        color: MUTED,
      });
      lineY -= 25;
    }

    if (index !== 1) continue;

    // Seller side: embed the stored signature when there is one.
    let drewImage = false;
    if (model.signature) {
      const embedded = await embedSignature(doc, model.signature.dataUrl);
      if (embedded) {
        const maxWidth = COLUMN_WIDTH - 24;
        const maxHeight = 34;
        const scale = Math.min(maxWidth / embedded.width, maxHeight / embedded.height, 1);
        layout.page.drawImage(embedded, {
          x: x + 10,
          y: top - 40 - embedded.height * scale + 8,
          width: embedded.width * scale,
          height: embedded.height * scale,
        });
        drewImage = true;
      }
    }

    const sellerLineY = top - 48;
    layout.page.drawLine({
      start: { x: x + 8, y: sellerLineY },
      end: { x: x + COLUMN_WIDTH - 8, y: sellerLineY },
      thickness: 0.5,
      color: rgb(0.29, 0.35, 0.42),
    });

    const caption = model.signature
      ? [model.signature.name, model.signature.title].filter((part) => part).join(" / ")
      : model.sellerSignature;
    layout.page.drawText(toPdfText(caption), {
      x: x + 8,
      y: sellerLineY - 9,
      size: 6.8,
      font: layout.fonts.regular,
      color: drewImage ? INK : MUTED,
    });
    if (model.signature?.signedOn) {
      layout.page.drawText(toPdfText(`Signed ${model.signature.signedOn}`), {
        x: x + 8,
        y: sellerLineY - 18,
        size: 6.4,
        font: layout.fonts.regular,
        color: MUTED,
      });
    }
  }
}

/**
 * Decodes a `data:image/...;base64,...` signature into an embedded image.
 *
 * Returns null on anything unexpected — a malformed URI, an unsupported format,
 * or a corrupt payload. A proposal that downloads with a blank signature line is
 * recoverable; one that fails to download at all is not.
 */
async function embedSignature(doc: PDFDocument, dataUrl: string) {
  const match = /^data:(image\/(png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    const bytes = Buffer.from(match[3], "base64");
    return match[2] === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}
