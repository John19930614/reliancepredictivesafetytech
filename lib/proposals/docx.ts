// Server-side DOCX rendering for an editable client proposal.
//
// The DOCX follows the same ProposalDocumentModel used by the browser document
// and PDF route. It is intentionally made of Word-native headings, paragraphs,
// bullets and tables rather than screenshots, so the downloaded file remains
// useful when a proposal needs a client-side redline or internal revision.

import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
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
import type {
  DocumentFeeGroup,
  DocumentFeeRow,
  DocumentPartyBlock,
  DocumentTerm,
  ProposalDocumentModel,
} from "@/components/proposals/proposal-document-model";
import { proposalFooterText } from "./types";

const NAVY = "0C3450";
const NAVY_2 = "16627F";
const GOLD = "DCA23A";
const INK = "16242F";
const MUTED = "5D6F7D";
const LINE = "DBE2E9";
const BAND = "F1F6FA";
const BAND_2 = "EEF3F8";
const GOLD_TINT = "FBF2DD";
const WHITE = "FFFFFF";

// Matches the generated PDF / print layout: Letter page, narrow proposal
// margins, and full-width business tables rather than Word's roomier memo
// default. This is a named proposal-export override to the 9360-DXA baseline.
const TABLE_WIDTH = 10680;

type Block = Paragraph | Table;

function clean(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[^\S\n]+/g, " ").trim();
}

function textRun(text: string, options: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) {
  return new TextRun({
    text: clean(text),
    bold: options.bold,
    italics: options.italics,
    color: options.color ?? INK,
    size: options.size ?? 21,
  });
}

function para(
  text: string,
  options: {
    bold?: boolean;
    italics?: boolean;
    color?: string;
    size?: number;
    heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel];
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    spacingAfter?: number;
    spacingBefore?: number;
    border?: IParagraphOptions["border"];
  } = {},
): Paragraph {
  return new Paragraph({
    heading: options.heading,
    alignment: options.alignment,
    border: options.border,
    spacing: { before: options.spacingBefore ?? 0, after: options.spacingAfter ?? 120 },
    children: [textRun(text, options)],
  });
}

function blank(): Paragraph {
  return new Paragraph({ text: "", spacing: { after: 90 } });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 70 },
    children: [textRun(text, { size: 20 })],
  });
}

function heading(number: string, title: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 4 } },
    spacing: { before: 240, after: 120 },
    keepNext: true,
    children: [
      textRun(`${number}  `, { bold: true, color: GOLD, size: 27 }),
      textRun(title, { bold: true, color: NAVY, size: 27 }),
    ],
  });
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
    margins: options.margins ?? { top: 90, bottom: 90, left: 120, right: 120 },
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

function topAccentBorders(): ITableCellOptions["borders"] {
  const quiet = { style: BorderStyle.SINGLE, size: 4, color: LINE };
  return {
    top: { style: BorderStyle.SINGLE, size: 14, color: NAVY_2 },
    bottom: quiet,
    left: quiet,
    right: quiet,
  };
}

function table(rows: TableRow[], widths?: number[]): Table {
  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    rows,
  });
}

async function sealImageRun(): Promise<ImageRun | null> {
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "reliance-seal-transparent.png"));
    return new ImageRun({
      type: "png",
      data: bytes,
      transformation: { width: 72, height: 72 },
      altText: { title: "Reliance seal", description: "Reliance seal", name: "Reliance seal" },
    });
  } catch {
    return null;
  }
}

async function masthead(model: ProposalDocumentModel): Promise<Block[]> {
  const seal = await sealImageRun();
  const widths = [1000, 6500, TABLE_WIDTH - 7500];
  const row = new TableRow({
    children: [
      cell(
        [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 0 }, children: seal ? [seal] : [] })],
        { width: widths[0], borders: noBorders(), verticalAlign: VerticalAlignTable.CENTER, margins: { top: 0, bottom: 0, left: 0, right: 80 } },
      ),
      cell(
        [
          para(model.wordmark, { bold: true, color: NAVY, size: 35, spacingAfter: 40 }),
          para(model.docline.toUpperCase(), { color: MUTED, size: 18, spacingAfter: 0 }),
        ],
        { width: widths[1], borders: noBorders(), verticalAlign: VerticalAlignTable.CENTER },
      ),
      cell(
        [
          para("PROPOSAL", { bold: true, color: WHITE, size: 18, alignment: AlignmentType.CENTER, spacingAfter: 35 }),
          para("CONFIDENTIAL", { bold: true, color: GOLD, size: 16, alignment: AlignmentType.RIGHT, spacingAfter: 35 }),
          para(`${model.revisionLabel ?? model.currentRevisionLabel} · ${model.statusLabel}`, {
            bold: true,
            color: WHITE,
            size: 16,
            alignment: AlignmentType.RIGHT,
            spacingAfter: 0,
          }),
        ],
        { width: widths[2], fill: NAVY, borders: noBorders(), verticalAlign: VerticalAlignTable.CENTER },
      ),
    ],
  });

  const divider = new TableRow({
    children: [
      cell([blank()], { width: 1900, fill: GOLD, borders: noBorders(), margins: { top: 20, bottom: 20, left: 0, right: 0 } }),
      cell([blank()], {
        width: TABLE_WIDTH - 1900,
        columnSpan: 2,
        fill: NAVY,
        borders: noBorders(),
        margins: { top: 20, bottom: 20, left: 0, right: 0 },
      }),
    ],
  });

  return [
    table([row], widths),
    table([divider], [1900, TABLE_WIDTH - 1900]),
    new Paragraph({ text: "", spacing: { after: 180 } }),
  ];
}

function partyParagraphs(block: DocumentPartyBlock): Paragraph[] {
  return [
    para(block.name, { bold: true, color: INK, size: 20, spacingAfter: 40 }),
    ...block.lines.map((line) => para(line, { color: INK, size: 19, spacingAfter: 20 })),
  ];
}

function metaTable(model: ProposalDocumentModel): Table {
  const rows: Array<[string, Paragraph[]]> = [
    ["Prepared For", partyParagraphs(model.preparedFor)],
    ["Prepared By", partyParagraphs(model.preparedByBlock)],
    ["Proposal Date", [para(model.proposalDate, { bold: true, size: 20, spacingAfter: 0 })]],
    ["Proposal Number", [para(model.proposalNumber, { bold: true, size: 20, spacingAfter: 0 })]],
  ];
  if (model.termLabel) rows.push(["Engagement Term", [para(model.termLabel, { size: 20, spacingAfter: 0 })]]);
  rows.push(["Validity", [para(model.validity, { size: 20, spacingAfter: 0 })]]);

  return table(
    rows.map(
      ([label, value]) =>
        new TableRow({
          children: [
            cell([para(label, { bold: true, color: WHITE, size: 17, spacingAfter: 0 })], {
              width: 2500,
              fill: NAVY,
              verticalAlign: VerticalAlignTable.CENTER,
            }),
            cell(value, { width: TABLE_WIDTH - 2500 }),
          ],
        }),
    ),
    [2500, TABLE_WIDTH - 2500],
  );
}

function pillsTable(model: ProposalDocumentModel): Table {
  const rows: TableRow[] = [];
  for (let index = 0; index < model.packagePills.length; index += 3) {
    const group = model.packagePills.slice(index, index + 3);
    rows.push(
      new TableRow({
        children: Array.from({ length: 3 }, (_, offset) => {
          const pill = group[offset];
          return cell(
            pill ? [para(`${pill.label}: ${pill.value}`, { bold: true, color: NAVY, size: 18, spacingAfter: 0 })] : [blank()],
            { width: TABLE_WIDTH / 3, fill: WHITE, borders: border(), margins: { top: 70, bottom: 70, left: 120, right: 120 } },
          );
        }),
      }),
    );
  }
  return table(rows, [TABLE_WIDTH / 3, TABLE_WIDTH / 3, TABLE_WIDTH / 3]);
}

function feeTable(groups: DocumentFeeGroup[], totals: ProposalDocumentModel["totalRows"]): Table {
  const widths = [2400, 4300, 760, 1540, 1680];
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: ["Item", "Description", "Qty", "Unit Price", "Amount"].map((label, index) =>
        cell([para(label, { bold: true, color: WHITE, size: 17, spacingAfter: 0 })], {
          width: widths[index],
          fill: NAVY,
          verticalAlign: VerticalAlignTable.CENTER,
        }),
      ),
    }),
  ];

  for (const group of groups) {
    rows.push(
      new TableRow({
        children: [
          cell([para(group.label, { bold: true, color: NAVY, size: 17, spacingAfter: 0 })], {
            width: TABLE_WIDTH,
            columnSpan: 5,
            fill: BAND_2,
            margins: { top: 70, bottom: 70, left: 120, right: 120 },
          }),
        ],
      }),
    );
    for (const row of group.rows) rows.push(feeRow(row, widths));
  }

  for (const total of totals) {
    const fill = total.emphasis === "total" ? NAVY : total.emphasis === "deposit" ? GOLD_TINT : BAND_2;
    const color = total.emphasis === "total" ? WHITE : NAVY;
    rows.push(
      new TableRow({
        children: [
          cell([para(total.label, { bold: true, color, size: 18, alignment: AlignmentType.RIGHT, spacingAfter: 0 })], {
            width: widths.slice(0, 4).reduce((sum, width) => sum + width, 0),
            columnSpan: 4,
            fill,
          }),
          cell([para(total.value, { bold: true, color, size: 18, alignment: AlignmentType.RIGHT, spacingAfter: 0 })], {
            width: widths[4],
            fill,
          }),
        ],
      }),
    );
  }

  return table(rows, widths);
}

function feeRow(row: DocumentFeeRow, widths: number[]): TableRow {
  const cells = [row.name || "-", row.desc, row.qtyLabel, row.priceLabel, row.amountLabel];
  return new TableRow({
    children: cells.map((value, index) =>
      cell([para(value, { bold: index === 0, size: 18, alignment: index >= 2 ? AlignmentType.RIGHT : undefined })], {
        width: widths[index],
      }),
    ),
  });
}

function termTable(terms: DocumentTerm[]): Table {
  const rows: TableRow[] = [];
  for (let index = 0; index < terms.length; index += 2) {
    const pair = terms.slice(index, index + 2);
    rows.push(
      new TableRow({
        children: Array.from({ length: 2 }, (_, offset) => {
          const term = pair[offset];
          return cell(
            term
              ? [
                  para(term.heading, { bold: true, color: NAVY, size: 19, spacingAfter: 40 }),
                  para(term.body, { color: INK, size: 17, spacingAfter: 0 }),
                ]
              : [blank()],
            { width: TABLE_WIDTH / 2, fill: WHITE, borders: topAccentBorders(), margins: { top: 100, bottom: 100, left: 120, right: 120 } },
          );
        }),
      }),
    );
  }
  return table(rows, [TABLE_WIDTH / 2, TABLE_WIDTH / 2]);
}

function pushScope(children: Block[], entries: ProposalDocumentModel["phaseScope"], empty: string): void {
  if (entries.length === 0) {
    children.push(para(empty, { italics: true, color: MUTED }));
    return;
  }
  for (const entry of entries) {
    children.push(para(entry.heading, { bold: true, color: NAVY_2, size: 21, spacingBefore: 80, spacingAfter: 45 }));
    if (entry.body) children.push(para(entry.body, { size: 20 }));
  }
}

function signatureLine(label: string, spacingBefore: number, color = MUTED): Paragraph {
  return para(label, {
    color,
    size: 18,
    spacingBefore,
    spacingAfter: 80,
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: "4A5A6A", space: 4 } },
  });
}

export async function renderProposalDocx(model: ProposalDocumentModel): Promise<Buffer> {
  const children: Block[] = [
    ...(await masthead(model)),
    para(model.headline, { bold: true, color: NAVY, size: 52, spacingAfter: 80 }),
    para(model.subtitle, { color: MUTED, size: 23, spacingAfter: 160 }),
    metaTable(model),
    heading("01", "Executive Summary"),
    para(model.summary, { size: 21 }),
    table([
      new TableRow({
        children: [
          cell(
            [
              new Paragraph({
                spacing: { after: 0 },
                children: [
                  textRun("Proposal Purpose: ", { bold: true, color: NAVY, size: 20 }),
                  textRun(model.purposeCallout, { size: 20 }),
                ],
              }),
            ],
            {
              width: TABLE_WIDTH,
              fill: BAND,
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: LINE },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE },
                left: { style: BorderStyle.SINGLE, size: 18, color: GOLD },
                right: { style: BorderStyle.SINGLE, size: 4, color: LINE },
              },
            },
          ),
        ],
      }),
    ]),
    heading("02", model.packageHeading),
    para(model.packageIntro, { size: 20 }),
    pillsTable(model),
    heading("03", "Detailed Scope of Work"),
    para(model.scopeIntro, { size: 20 }),
  ];

  pushScope(children, model.phaseScope, "No implementation phases selected.");
  pushScope(children, model.serviceScope, "No added service lines selected.");

  children.push(heading("04", "Deliverables"));
  for (const item of model.deliverables) children.push(bullet(item));
  if (model.deliverablesCoverage) children.push(para(model.deliverablesCoverage, { size: 20 }));

  children.push(heading("05", "Pricing Schedule"), feeTable(model.feeGroups, model.totalRows));
  children.push(heading("06", "Schedule and Implementation Approach"), para(model.schedule, { size: 20 }));
  for (const item of model.scheduleSteps) children.push(bullet(item));
  children.push(heading("07", "Client Responsibilities"));
  for (const item of model.clientResponsibilities) children.push(bullet(item));
  children.push(heading("08", "Assumptions and Exclusions"));
  for (const paragraph of model.exclusions.split(/\n+/).filter(Boolean)) children.push(para(paragraph, { size: 20 }));

  let sectionNumber = 9;
  if (model.team.length > 0) {
    children.push(heading(String(sectionNumber).padStart(2, "0"), "Your Team"));
    sectionNumber += 1;
    for (const member of model.team) {
      children.push(para(member.title ? `${member.name} - ${member.title}` : member.name, { bold: true, color: NAVY, size: 21 }));
      for (const paragraph of member.paragraphs) children.push(para(paragraph, { size: 19 }));
    }
  }

  children.push(heading(String(sectionNumber).padStart(2, "0"), "Commercial and Legal Terms"), termTable(model.terms));
  sectionNumber += 1;
  children.push(heading(String(sectionNumber).padStart(2, "0"), "Acceptance Statement"));
  children.push(para(model.acceptance, { size: 20 }));

  const signer = model.signature
    ? [model.signature.name, model.signature.title].filter(Boolean).join(" / ")
    : model.sellerSignature;
  children.push(
    table(
      [
        new TableRow({
          children: [
            cell([
              para("Client Acceptance", { bold: true, color: NAVY, size: 22 }),
              signatureLine("Authorized Signature / Date", 260),
              signatureLine("Printed Name / Title", 180),
              signatureLine("Purchase Order Number, if applicable", 180),
            ], { margins: { top: 180, bottom: 180, left: 180, right: 180 } }),
            cell([
              para("Seller Acceptance", { bold: true, color: NAVY, size: 22 }),
              signatureLine(signer, 260, INK),
              ...(model.signature?.signedOn ? [para(`Signed ${model.signature.signedOn}`, { color: MUTED, size: 17 })] : []),
            ], { margins: { top: 180, bottom: 180, left: 180, right: 180 } }),
          ],
        }),
      ],
      [TABLE_WIDTH / 2, TABLE_WIDTH / 2],
    ),
  );

  children.push(para(model.legalNotice, { color: MUTED, size: 16, italics: true, spacingBefore: 180 }));

  const document = new Document({
    creator: model.wordmark,
    title: model.headline,
    description: model.subtitle,
    styles: {
      default: {
        document: {
          run: { font: "Aptos", size: 21, color: INK },
          paragraph: { spacing: { line: 276, after: 100 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.6),
              right: convertInchesToTwip(0.6),
              bottom: convertInchesToTwip(0.65),
              left: convertInchesToTwip(0.6),
            },
          },
        },
        footers: {
          default: new Footer({
            children: [para(proposalFooterText(), { color: MUTED, size: 16, alignment: AlignmentType.RIGHT })],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}
