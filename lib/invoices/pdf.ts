// Server-side PDF rendering for a client invoice.
//
// WHY THIS EXISTS RATHER THAN "PRINT TO PDF"
//   The same reason lib/proposals/pdf.ts does: browsers draw their own header
//   and footer into the page margin — document title, the URL the page was
//   served from, the date — and that is a print-dialog checkbox no stylesheet
//   can turn off. An invoice is a financial document a client's accounts
//   payable department files; it must not carry "/employee/clients/…/workflow"
//   across the top of it.
//
// ONE SOURCE OF CONTENT
//   Every string and number below comes from buildInvoiceDocumentModel() — the
//   same view-model the DOCX renderer uses. This file decides LAYOUT only. If a
//   label or a sentence needs to change, change the model, not this file, or the
//   PDF and the Word file will start disagreeing about what the invoice says.
//
// THE TARGET IS A ONE-PAGER
//   Steve's Word original is a single sheet, and that is what a client expects
//   to receive. The geometry below is sized so a realistic invoice — a dozen
//   lines with wrapping descriptions — lands on one page, and
//   lib/invoices/pdf.test.ts asserts it against a fixture of that shape rather
//   than leaving it to be eyeballed. The renderer still PAGINATES rather than
//   clipping: an invoice with forty lines is a long invoice, and dropping rows
//   off the bottom of a bill is not a trade-off worth making for tidiness.

import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { InvoiceDocumentModel } from "./document-model";

/* -------------------------------------------------------------------------- */
/* Page geometry                                                              */
/* -------------------------------------------------------------------------- */

const PAGE_WIDTH = 612; // US Letter at 72dpi
const PAGE_HEIGHT = 792;
const MARGIN_X = 54;
const MARGIN_TOP = 46;
/** Deep enough to clear the closing block and a page number, if one is drawn. */
const MARGIN_BOTTOM = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2; // 504

/** The palette lib/proposals/pdf.ts uses, so the two documents look related. */
const NAVY = rgb(0.047, 0.204, 0.314);
const GOLD = rgb(0.788, 0.576, 0.169);
const INK = rgb(0.086, 0.141, 0.184);
const MUTED = rgb(0.35, 0.42, 0.49);
const RULE = rgb(0.78, 0.82, 0.855);
const BAND = rgb(0.945, 0.965, 0.98);
const WHITE = rgb(1, 1, 1);

/**
 * Line-item column widths, summing to CONTENT_WIDTH.
 *
 * DATE | DESCRIPTION | UNIT PRICE | <qty> | LINE TOTAL. Description takes the
 * slack because it is the only column whose content wraps; the money columns are
 * sized for "$1,234,567.89" so a large figure can never be hyphenated.
 */
const lineColumns = [60, 214, 78, 56, 96];

/** Columns from this index on are right-aligned, like the money on the original. */
const firstRightAlignedColumn = 2;

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/* -------------------------------------------------------------------------- */
/* Text measurement and wrapping                                              */
/* -------------------------------------------------------------------------- */

/**
 * pdf-lib's standard fonts cannot encode characters outside WinAnsi, and
 * `drawText` THROWS on the first one it meets — it does not skip it, and it does
 * not draw a box. An invoice legitimately contains the characters below: the
 * model's own `missingValue` is an em dash, a description pasted out of Word
 * carries curly quotes, and a scope note copied from a proposal carries "≤".
 * Any one of them would take down the whole download.
 *
 * The table is a duplicate of the one in lib/proposals/pdf.ts. That is
 * deliberate: it describes pdf-lib's WinAnsi encoding, not anything about
 * proposals, and importing it would make every invoice download depend on the
 * proposal renderer's module graph (its seal embedding, its footer text, its
 * view-model import). Two small tables that agree are cheaper than that coupling
 * — but they must AGREE, so anything added there belongs here too.
 */
const characterFolds: Array<[RegExp, string]> = [
  [/[‘’‛]/g, "'"],
  [/[“”]/g, '"'],
  [/[–]/g, "-"],
  [/[—]/g, "--"],
  [/[…]/g, "..."],
  [/[≤]/g, "<="],
  [/[≥]/g, ">="],
  // U+00A0 / U+2007 / U+202F — the same three lib/proposals/pdf.ts folds.
  [/[\u00A0\u2007\u202F]/g, " "],
  [/[•]/g, "-"],
];

export function toPdfText(value: string): string {
  let out = typeof value === "string" ? value : "";
  for (const [pattern, replacement] of characterFolds) out = out.replace(pattern, replacement);
  // Anything still outside Latin-1 would throw at draw time.
  return out.replace(/[^\x20-\x7E\xA1-\xFF\n]/g, "");
}

/**
 * Greedy word wrap.
 *
 * A single word longer than the column (a long PO number, a URL) is hard-split
 * rather than allowed to overflow into the next column's figures.
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
  /** Set by the table renderer so a continuation page can repeat the header. */
  onNewPage: (() => void) | null = null;

  constructor(doc: PDFDocument, fonts: Fonts) {
    this.doc = doc;
    this.fonts = fonts;
    this.newPage();
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    this.y = PAGE_HEIGHT - MARGIN_TOP;
    const hook = this.onNewPage;
    if (hook) {
      // Cleared around the call so a header that itself needs space cannot
      // recurse into an endless run of empty pages.
      this.onNewPage = null;
      hook();
      this.onNewPage = hook;
    }
  }

  get bottom(): number {
    return MARGIN_BOTTOM;
  }

  /** Starts a new page unless `height` still fits above the bottom margin. */
  ensure(height: number): void {
    if (this.y - height < this.bottom) this.newPage();
  }

  space(amount: number): void {
    this.y -= amount;
  }

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

  /** Draws one already-short line flush to the right margin. */
  rightText(
    value: string,
    y: number,
    options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; right?: number } = {},
  ): void {
    const font = options.font ?? this.fonts.regular;
    const size = options.size ?? 8.6;
    const right = options.right ?? PAGE_WIDTH - MARGIN_X;
    const line = toPdfText(value);
    this.page.drawText(line, {
      x: right - font.widthOfTextAtSize(line, size),
      y,
      size,
      font,
      color: options.color ?? INK,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

async function tryEmbedSeal(doc: PDFDocument) {
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "reliance-seal-transparent.png"));
    return await doc.embedPng(bytes);
  } catch {
    return null;
  }
}

/**
 * Masthead: logo and firm name left, the word INVOICE right, and under it the
 * three labelled rows.
 *
 * All THREE rows are drawn unconditionally, including REFERENCE PROPOSAL NUMBER.
 * The model guarantees a value for each (a dash when unknown), and the reference
 * is half of the numbering scheme — a reader must be able to tell "no proposal"
 * from "the row was omitted". See the note on InvoiceDocumentModel.headerRows.
 */
function drawMasthead(layout: Layout, model: InvoiceDocumentModel, seal: Awaited<ReturnType<typeof tryEmbedSeal>>): void {
  const top = layout.y;
  const sealSize = 46;

  if (seal) {
    layout.page.drawImage(seal, { x: MARGIN_X, y: top - sealSize, width: sealSize, height: sealSize });
  }
  // The identity column is width-limited so a long firm name can never run into
  // the reference stack on its right; it wraps instead, and a third line still
  // clears the stack horizontally.
  const textX = seal ? MARGIN_X + sealSize + 12 : MARGIN_X;
  const stackLabelX = PAGE_WIDTH - MARGIN_X - 258;
  const wordmarkWidth = stackLabelX - textX - 12;
  for (const [index, line] of wrapText(model.wordmark, layout.fonts.bold, 12.5, wordmarkWidth).slice(0, 3).entries()) {
    layout.page.drawText(line, { x: textX, y: top - 13 - index * 14, size: 12.5, font: layout.fonts.bold, color: NAVY });
  }

  // The word INVOICE, right-aligned above the reference rows.
  layout.rightText(model.stamp, top - 16, { font: layout.fonts.bold, size: 20, color: NAVY });

  // The reference stack: label left, value flush right, which is where a reader
  // looks for a number. BOTH sides are wrapped inside their own column rather
  // than drawn as single runs — a long client PO or a 40-character proposal
  // number, right-aligned, would otherwise grow leftwards straight through its
  // own label.
  // "REFERENCE PROPOSAL NUMBER" is the longest label the document has, and it
  // measures 103.6pt at 6.2 — the column is sized to hold it on ONE line, since
  // a wrapped label reads as two fields. The value column then holds a
  // 21-character invoice number (106.3pt at 8.4) with room to spare.
  const labelSize = 6.2;
  const labelWidth = 116;
  const valueWidth = 258 - labelWidth - 10;
  const rowLine = 9.6;
  let rowY = top - 36;
  for (const row of model.headerRows) {
    const labelLines = wrapText(row.label, layout.fonts.bold, labelSize, labelWidth);
    const valueLines = wrapText(row.value, layout.fonts.bold, 8.4, valueWidth);
    labelLines.forEach((line, index) => {
      layout.page.drawText(line, {
        x: stackLabelX,
        y: rowY - index * rowLine,
        size: labelSize,
        font: layout.fonts.bold,
        color: MUTED,
      });
    });
    valueLines.forEach((line, index) => {
      layout.rightText(line, rowY - index * rowLine, { font: layout.fonts.bold, size: 8.4, color: INK });
    });
    rowY -= Math.max(labelLines.length, valueLines.length, 1) * rowLine + 2.4;
  }

  layout.y = Math.min(top - sealSize - 10, rowY - 6);
  layout.page.drawRectangle({ x: MARGIN_X, y: layout.y, width: CONTENT_WIDTH, height: 2.5, color: NAVY });
  layout.page.drawRectangle({ x: MARGIN_X, y: layout.y, width: 120, height: 2.5, color: GOLD });
  layout.space(14);
}

/**
 * The letterhead block and the TO block, side by side on one row.
 *
 * Measured before anything is drawn, so the pair is placed as a unit rather than
 * running off the bottom of the sheet: the two columns advance their own cursors
 * independently, which means neither of them passes through Layout.ensure() on
 * the way down.
 */
function drawParties(layout: Layout, model: InvoiceDocumentModel): void {
  const columnWidth = (CONTENT_WIDTH - 24) / 2;
  const size = 8;
  const lineHeight = size * 1.34;

  const measure = (block: InvoiceDocumentModel["firm"]) => {
    const nameLines = wrapText(block.name, layout.fonts.bold, size + 0.6, columnWidth);
    const bodyLines = block.lines.flatMap((entry) => wrapText(entry, layout.fonts.regular, size, columnWidth));
    return {
      nameLines,
      bodyLines,
      height: (block.heading ? 12 : 0) + (nameLines.length + bodyLines.length) * lineHeight,
    };
  };

  const blocks = [
    { block: model.firm, x: MARGIN_X, ...measure(model.firm) },
    { block: model.billTo, x: MARGIN_X + columnWidth + 24, ...measure(model.billTo) },
  ];

  layout.ensure(Math.max(...blocks.map((entry) => entry.height)) + 12);
  const top = layout.y;

  for (const entry of blocks) {
    let y = top;
    if (entry.block.heading) {
      y -= 8;
      layout.page.drawText(toPdfText(entry.block.heading), {
        x: entry.x,
        y,
        size: 7,
        font: layout.fonts.bold,
        color: GOLD,
      });
      y -= 4;
    }
    for (const line of entry.nameLines) {
      y -= lineHeight;
      layout.page.drawText(line, { x: entry.x, y, size: size + 0.6, font: layout.fonts.bold, color: NAVY });
    }
    for (const line of entry.bodyLines) {
      y -= lineHeight;
      layout.page.drawText(line, { x: entry.x, y, size, font: layout.fonts.regular, color: INK });
    }
  }

  layout.y = top - Math.max(...blocks.map((entry) => entry.height));
  layout.space(12);
}

/** CONSULTANT | JOB | PAYMENT TERMS | DUE DATE, as one banded row of cells. */
function drawBar(layout: Layout, model: InvoiceDocumentModel): void {
  const cells = model.barCells;
  if (cells.length === 0) return;

  const width = CONTENT_WIDTH / cells.length;
  const labelSize = 6.4;
  const valueSize = 8;

  // Measured before anything is drawn so the row is never split across a page.
  const wrapped = cells.map((cell) => wrapText(cell.value, layout.fonts.bold, valueSize, width - 12));
  const valueLines = Math.max(1, ...wrapped.map((lines) => lines.length));
  const height = 13 + valueLines * (valueSize * 1.25) + 8;

  layout.ensure(height + 6);
  const top = layout.y;
  layout.y -= height;

  layout.page.drawRectangle({
    x: MARGIN_X,
    y: layout.y,
    width: CONTENT_WIDTH,
    height,
    color: BAND,
    borderColor: RULE,
    borderWidth: 0.5,
  });

  cells.forEach((cell, index) => {
    const x = MARGIN_X + index * width;
    if (index > 0) {
      layout.page.drawLine({
        start: { x, y: layout.y },
        end: { x, y: top },
        thickness: 0.5,
        color: RULE,
      });
    }
    layout.page.drawText(toPdfText(cell.label), {
      x: x + 6,
      y: top - 10,
      size: labelSize,
      font: layout.fonts.bold,
      color: MUTED,
    });
    wrapped[index].forEach((line, lineIndex) => {
      layout.page.drawText(line, {
        x: x + 6,
        y: top - 21 - lineIndex * (valueSize * 1.25),
        size: valueSize,
        font: layout.fonts.bold,
        color: NAVY,
      });
    });
  });

  layout.space(12);
}

/** One row of the line-item table, measured first so it never splits a page. */
function drawTableRow(
  layout: Layout,
  cells: string[],
  options: { bold?: boolean; background?: ReturnType<typeof rgb>; color?: ReturnType<typeof rgb>; rule?: boolean } = {},
): void {
  const size = 7.8;
  const font = options.bold ? layout.fonts.bold : layout.fonts.regular;
  const color = options.color ?? INK;
  const padding = 4;

  const wrapped = cells.map((cell, index) => wrapText(cell, font, size, lineColumns[index] - padding * 2));
  const lineCount = Math.max(1, ...wrapped.map((lines) => lines.length));
  const rowHeight = lineCount * size * 1.32 + padding * 2;

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
    const columnWidth = lineColumns[index];
    const alignRight = index >= firstRightAlignedColumn;
    lines.forEach((line, lineIndex) => {
      const textWidth = font.widthOfTextAtSize(line, size);
      layout.page.drawText(line, {
        x: alignRight ? x + columnWidth - padding - textWidth : x + padding,
        y: top - padding - size - lineIndex * size * 1.32,
        size,
        font,
        color,
      });
    });
    x += columnWidth;
  });

  if (options.rule !== false) {
    layout.page.drawLine({
      start: { x: MARGIN_X, y: layout.y },
      end: { x: PAGE_WIDTH - MARGIN_X, y: layout.y },
      thickness: 0.4,
      color: RULE,
    });
  }
}

/**
 * The line-item table and the totals under it.
 *
 * INV-7: `model.lines` is drawn in full, in order, with no predicate of any
 * kind. A $0.00 line is work Steve performed and did not charge for, and it is
 * on the invoice so the client sees it — dropping it, merging it into a
 * neighbouring row, or blanking its LINE TOTAL cell would all destroy the point
 * of putting it there.
 */
function drawLineItems(layout: Layout, model: InvoiceDocumentModel): void {
  const header = () =>
    drawTableRow(layout, model.columnHeaders, { bold: true, background: NAVY, color: WHITE });

  header();
  // A continuation page repeats the column headers rather than dropping a
  // reader into unlabelled figures.
  layout.onNewPage = header;

  for (const line of model.lines) {
    drawTableRow(layout, [
      line.dateLabel,
      line.description,
      line.unitPriceLabel,
      line.quantityLabel,
      line.lineTotalLabel,
    ]);
  }

  for (const row of model.totalRows) {
    const emphasised = row.emphasis === "total";
    drawTableRow(layout, ["", "", row.label, row.quantityLabel, row.value], {
      bold: true,
      background: emphasised ? NAVY : BAND,
      color: emphasised ? WHITE : NAVY,
    });
  }

  layout.onNewPage = null;
}

/** "Invoice Prepared By: …" and the service-agreement sentence. */
function drawClosing(layout: Layout, model: InvoiceDocumentModel): void {
  layout.space(16);
  layout.text(model.preparedByLine, { size: 8.4, font: layout.fonts.bold, color: INK });
  layout.space(4);
  layout.text(model.agreementSentence, { size: 7.6, color: MUTED });
}

/**
 * Page numbers, stamped once the total is known.
 *
 * Only when there is more than one page. The document is a one-pager by design,
 * and "Page 1 of 1" on a single-sheet invoice is noise; on a two-sheet invoice
 * it is the reader's only assurance they have the whole bill.
 */
function stampPageNumbers(layout: Layout): void {
  const total = layout.pages.length;
  if (total < 2) return;
  const size = 6.8;
  const y = MARGIN_BOTTOM - 20;

  layout.pages.forEach((page, index) => {
    const label = `Page ${index + 1} of ${total}`;
    page.drawText(label, {
      x: PAGE_WIDTH - MARGIN_X - layout.fonts.regular.widthOfTextAtSize(label, size),
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

export interface InvoicePdfOptions {
  model: InvoiceDocumentModel;
  /** Shown in the PDF metadata title. Defaults to the model's own title. */
  documentTitle?: string;
}

export async function renderInvoicePdf({ model, documentTitle }: InvoicePdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const seal = await tryEmbedSeal(doc);

  doc.setTitle(toPdfText(documentTitle ?? model.documentTitle));
  doc.setProducer(toPdfText(model.wordmark));
  doc.setCreator(toPdfText(model.wordmark));

  const layout = new Layout(doc, fonts);

  drawMasthead(layout, model, seal);
  drawParties(layout, model);
  drawBar(layout, model);
  drawLineItems(layout, model);
  drawClosing(layout, model);
  stampPageNumbers(layout);

  return doc.save();
}
