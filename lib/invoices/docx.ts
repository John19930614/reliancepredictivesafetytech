// Server-side DOCX rendering for an editable client invoice.
//
// The DOCX follows the same InvoiceDocumentModel the PDF route renders. It is
// intentionally made of Word-native paragraphs and tables rather than an image
// of a document, so the file stays useful when a bookkeeper needs to correct a
// description, add a PO number, or paste the line items into a ledger — which is
// how Steve's original one-pager was produced and is still maintained.
//
// LAYOUT ONLY. Every string comes from the model; nothing is composed here. A
// renderer that writes its own wording is how the Word file and the PDF start
// telling a client two different things about the same invoice.

import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlignTable,
  WidthType,
  convertInchesToTwip,
  type IParagraphOptions,
  type ITableCellOptions,
} from "docx";
import type { InvoiceDocumentModel, InvoicePartyBlock } from "./document-model";

/* Palette shared with lib/proposals/docx.ts, so an invoice and the proposal it
 * bills against look like they came from the same firm. */
const NAVY = "0C3450";
const GOLD = "DCA23A";
const INK = "16242F";
const MUTED = "5D6F7D";
const LINE = "DBE2E9";
const BAND = "F1F6FA";
const WHITE = "FFFFFF";

/* Page geometry in twips (1/1440 in). US Letter, DECLARED rather than left to
 * the `docx` package — its default is A4 (11906 x 16838), which is the bug
 * lib/proposals/docx.ts documents: every full-width table ends up sized against
 * a text column 500 twips narrower than the one it was written for and overhangs
 * the right margin in Word.
 *
 * TABLE_WIDTH must stay equal to PAGE_WIDTH - MARGIN_X * 2; docx.test.ts reads
 * the numbers back out of a rendered file and asserts it. */
const PAGE_WIDTH = 12240;
const PAGE_HEIGHT = 15840;
const MARGIN_X = 863; // convertInchesToTwip(0.6), which floors to 863
const TABLE_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

type Block = Paragraph | Table;

function clean(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").trim();
}

function textRun(
  text: string,
  options: { bold?: boolean; italics?: boolean; color?: string; size?: number; break?: number } = {},
): TextRun {
  return new TextRun({
    text: clean(text),
    // A <w:br/> ahead of this run's text. Set only by para() for the second and
    // later lines of a multi-line value; see the note there.
    break: options.break,
    bold: options.bold,
    italics: options.italics,
    color: options.color ?? INK,
    size: options.size ?? 20,
  });
}

/**
 * One paragraph, and ONE RUN PER LINE of `text`.
 *
 * A line-item description now carries a heading and its detail —
 *
 *   Training
 *   Biosafety Training: Classroom and Practical.
 *
 * — and a "\n" inside a single w:t is swallowed by Word: the file opens with
 * the heading run into the sentence beside it, disagreeing with the PDF, which
 * draws the break. The break has to be its own element, so each line after the
 * first is a run carrying `break: 1` (a <w:br/> ahead of its text).
 *
 * ONE PARAGRAPH, not one per line, on purpose. Splitting a description across
 * paragraphs would apply the document's paragraph spacing between the heading
 * and its detail and let Word break the two apart across a page; a run break
 * keeps them one block of text in one table cell, which is what the row is.
 *
 * Single-line text — every other field on the document — produces exactly the
 * one run it always did.
 */
function para(
  text: string,
  options: {
    bold?: boolean;
    italics?: boolean;
    color?: string;
    size?: number;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    spacingAfter?: number;
    spacingBefore?: number;
    border?: IParagraphOptions["border"];
  } = {},
): Paragraph {
  // clean() keeps the newline and collapses everything else, so this is the
  // model's own line structure rather than anything invented here.
  const lines = clean(text).split("\n");

  return new Paragraph({
    alignment: options.alignment,
    border: options.border,
    spacing: { before: options.spacingBefore ?? 0, after: options.spacingAfter ?? 60 },
    children: lines.map((line, index) => textRun(line, { ...options, break: index === 0 ? undefined : 1 })),
  });
}

function blank(): Paragraph {
  return new Paragraph({ text: "", spacing: { after: 60 } });
}

function cell(
  children: Block[],
  options: {
    width?: number;
    columnSpan?: number;
    fill?: string;
    borders?: ITableCellOptions["borders"];
    verticalAlign?: ITableCellOptions["verticalAlign"];
    margins?: ITableCellOptions["margins"];
  } = {},
): TableCell {
  return new TableCell({
    width: options.width ? { size: options.width, type: WidthType.DXA } : undefined,
    columnSpan: options.columnSpan,
    shading: options.fill ? { fill: options.fill, type: ShadingType.CLEAR } : undefined,
    verticalAlign: options.verticalAlign ?? VerticalAlignTable.TOP,
    margins: options.margins ?? { top: 70, bottom: 70, left: 110, right: 110 },
    borders: options.borders,
    children,
  });
}

function noBorders(): ITableCellOptions["borders"] {
  const line = { style: BorderStyle.NONE, size: 0, color: WHITE };
  return { top: line, bottom: line, left: line, right: line };
}

function border(color = LINE, size = 6): ITableCellOptions["borders"] {
  const line = { style: BorderStyle.SINGLE, size, color };
  return { top: line, bottom: line, left: line, right: line };
}

function table(
  rows: TableRow[],
  widths: number[],
  options: { alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
): Table {
  return new Table({
    width: { size: widths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    alignment: options.alignment,
    rows,
  });
}

async function sealImageRun(): Promise<ImageRun | null> {
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "reliance-seal-transparent.png"));
    return new ImageRun({
      type: "png",
      data: bytes,
      transformation: { width: 58, height: 58 },
      altText: { title: "Reliance seal", description: "Reliance seal", name: "Reliance seal" },
    });
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Masthead — logo and firm name left, the word INVOICE right, and beneath it the
 * three labelled reference rows.
 *
 * ALL THREE rows are emitted, REFERENCE PROPOSAL NUMBER included, whatever the
 * value. The model supplies a dash when there is no proposal, so a reader can
 * tell "raised outside a proposal" from "somebody dropped the row". Making the
 * row conditional here would defeat the numbering scheme the invoice number is
 * built around.
 */
async function masthead(model: InvoiceDocumentModel): Promise<Block[]> {
  const seal = await sealImageRun();
  const topWidths = [1100, TABLE_WIDTH - 1100];

  const identity = new TableRow({
    children: [
      cell([new Paragraph({ spacing: { after: 0 }, children: seal ? [seal] : [] })], {
        width: topWidths[0],
        borders: noBorders(),
        verticalAlign: VerticalAlignTable.CENTER,
        margins: { top: 0, bottom: 0, left: 0, right: 80 },
      }),
      cell([para(model.wordmark, { bold: true, color: NAVY, size: 30, spacingAfter: 0 })], {
        width: topWidths[1],
        borders: noBorders(),
        verticalAlign: VerticalAlignTable.CENTER,
      }),
    ],
  });

  // The reference stack, right-aligned as its own table: label left, value
  // flush right, which is where a reader's eye goes for a number.
  const stackWidths = [3400, 3000];
  const stack = model.headerRows.map(
    (row) =>
      new TableRow({
        children: [
          cell([para(row.label, { bold: true, color: MUTED, size: 15, spacingAfter: 0 })], {
            width: stackWidths[0],
            borders: noBorders(),
            margins: { top: 30, bottom: 30, left: 0, right: 110 },
          }),
          cell(
            [para(row.value, { bold: true, color: INK, size: 19, alignment: AlignmentType.RIGHT, spacingAfter: 0 })],
            { width: stackWidths[1], borders: noBorders(), margins: { top: 30, bottom: 30, left: 0, right: 0 } },
          ),
        ],
      }),
  );

  return [
    table([identity], topWidths),
    para(model.stamp, { bold: true, color: NAVY, size: 40, alignment: AlignmentType.RIGHT, spacingAfter: 40 }),
    table(stack, stackWidths, { alignment: AlignmentType.RIGHT }),
    // The navy/gold rule under the masthead, drawn as a shaded strip.
    table(
      [
        new TableRow({
          children: [
            cell([blank()], {
              width: 2400,
              fill: GOLD,
              borders: noBorders(),
              margins: { top: 12, bottom: 12, left: 0, right: 0 },
            }),
            cell([blank()], {
              width: TABLE_WIDTH - 2400,
              fill: NAVY,
              borders: noBorders(),
              margins: { top: 12, bottom: 12, left: 0, right: 0 },
            }),
          ],
        }),
      ],
      [2400, TABLE_WIDTH - 2400],
    ),
    new Paragraph({ text: "", spacing: { after: 140 } }),
  ];
}

function partyParagraphs(block: InvoicePartyBlock): Paragraph[] {
  return [
    ...(block.heading ? [para(block.heading, { bold: true, color: GOLD, size: 15, spacingAfter: 30 })] : []),
    para(block.name, { bold: true, color: NAVY, size: 21, spacingAfter: 30 }),
    ...block.lines.map((line) => para(line, { color: INK, size: 18, spacingAfter: 15 })),
  ];
}

/** The letterhead block and the TO block, side by side. */
function parties(model: InvoiceDocumentModel): Table {
  const widths = [Math.floor(TABLE_WIDTH / 2), TABLE_WIDTH - Math.floor(TABLE_WIDTH / 2)];
  return table(
    [
      new TableRow({
        children: [
          cell(partyParagraphs(model.firm), { width: widths[0], borders: noBorders(), margins: { top: 0, bottom: 0, left: 0, right: 160 } }),
          cell(partyParagraphs(model.billTo), { width: widths[1], borders: noBorders(), margins: { top: 0, bottom: 0, left: 0, right: 0 } }),
        ],
      }),
    ],
    widths,
  );
}

/** CONSULTANT | JOB | PAYMENT TERMS | DUE DATE. */
function bar(model: InvoiceDocumentModel): Table {
  const count = Math.max(1, model.barCells.length);
  const base = Math.floor(TABLE_WIDTH / count);
  const widths = Array.from({ length: count }, (_, index) =>
    index === count - 1 ? TABLE_WIDTH - base * (count - 1) : base,
  );

  return table(
    [
      new TableRow({
        children: model.barCells.map((barCell, index) =>
          cell(
            [
              para(barCell.label, { bold: true, color: MUTED, size: 14, spacingAfter: 25 }),
              para(barCell.value, { bold: true, color: NAVY, size: 18, spacingAfter: 0 }),
            ],
            { width: widths[index], fill: BAND, borders: border() },
          ),
        ),
      }),
    ],
    widths,
  );
}

/**
 * The line-item table and the totals under it.
 *
 * INV-7: `model.lines` is written out in full and in order. There is no filter,
 * no "skip when the total is zero", and no merging of adjacent rows. A $0.00
 * line records goodwill work that was performed and not charged for; it is the
 * client's evidence that the work happened, and it prints its explicit $0.00 in
 * the LINE TOTAL column like every other row.
 */
function lineItems(model: InvoiceDocumentModel): Table {
  // Derived from TABLE_WIDTH rather than hand-tuned literals, for the reason
  // lib/proposals/docx.ts documents: literals that sum past the printable width
  // overhang the right margin in Word on every document.
  const ratios = [0.12, 0.42, 0.16, 0.12, 0.18];
  const widths = ratios.map((ratio) => Math.floor(TABLE_WIDTH * ratio));
  widths[widths.length - 1] += TABLE_WIDTH - widths.reduce((sum, width) => sum + width, 0);

  const rows: TableRow[] = [
    new TableRow({
      // Repeated at the top of a continuation page. An invoice is meant to be a
      // one-pager, but a long one must not drop a reader into unlabelled figures.
      tableHeader: true,
      children: model.columnHeaders.map((label, index) =>
        cell(
          [
            para(label, {
              bold: true,
              color: WHITE,
              size: 15,
              alignment: index >= 2 ? AlignmentType.RIGHT : undefined,
              spacingAfter: 0,
            }),
          ],
          { width: widths[index], fill: NAVY, verticalAlign: VerticalAlignTable.CENTER },
        ),
      ),
    }),
  ];

  for (const line of model.lines) {
    const cells = [line.dateLabel, line.description, line.unitPriceLabel, line.quantityLabel, line.lineTotalLabel];
    rows.push(
      new TableRow({
        children: cells.map((value, index) =>
          cell(
            [
              para(value, {
                size: 17,
                alignment: index >= 2 ? AlignmentType.RIGHT : undefined,
                spacingAfter: 0,
              }),
            ],
            { width: widths[index], borders: border() },
          ),
        ),
      }),
    );
  }

  for (const total of model.totalRows) {
    const emphasised = total.emphasis === "total";
    const fill = emphasised ? NAVY : BAND;
    const color = emphasised ? WHITE : NAVY;
    rows.push(
      new TableRow({
        children: [
          cell([blank()], {
            width: widths[0] + widths[1],
            columnSpan: 2,
            borders: border(),
          }),
          cell([para(total.label, { bold: true, color, size: 17, alignment: AlignmentType.RIGHT, spacingAfter: 0 })], {
            width: widths[2],
            fill,
            borders: border(),
          }),
          cell(
            [para(total.quantityLabel, { bold: true, color, size: 17, alignment: AlignmentType.RIGHT, spacingAfter: 0 })],
            { width: widths[3], fill, borders: border() },
          ),
          cell([para(total.value, { bold: true, color, size: 18, alignment: AlignmentType.RIGHT, spacingAfter: 0 })], {
            width: widths[4],
            fill,
            borders: border(),
          }),
        ],
      }),
    );
  }

  return table(rows, widths);
}

/* -------------------------------------------------------------------------- */
/* Document                                                                   */
/* -------------------------------------------------------------------------- */

export async function renderInvoiceDocx(model: InvoiceDocumentModel): Promise<Buffer> {
  const children: Block[] = [
    ...(await masthead(model)),
    parties(model),
    new Paragraph({ text: "", spacing: { after: 140 } }),
    bar(model),
    new Paragraph({ text: "", spacing: { after: 140 } }),
    lineItems(model),
    new Paragraph({ text: "", spacing: { after: 200 } }),
    para(model.preparedByLine, { bold: true, color: INK, size: 19, spacingAfter: 60 }),
    para(model.agreementSentence, { color: MUTED, size: 17, spacingAfter: 0 }),
  ];

  const document = new Document({
    creator: model.wordmark,
    title: model.documentTitle,
    description: model.agreementSentence,
    styles: {
      default: {
        document: {
          run: { font: "Aptos", size: 20, color: INK },
          paragraph: { spacing: { line: 264, after: 80 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: {
              top: convertInchesToTwip(0.6),
              right: MARGIN_X,
              bottom: convertInchesToTwip(0.6),
              left: MARGIN_X,
            },
          },
        },
        footers: {
          // The invoice number and nothing else. Same reason the PDF route
          // exists: a client-facing document must never carry the file route it
          // was generated from, which is what a browser's own print footer adds.
          default: new Footer({
            children: [
              para(model.documentTitle, { color: MUTED, size: 14, alignment: AlignmentType.RIGHT, spacingAfter: 0 }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}
