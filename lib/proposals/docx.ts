// Server-side DOCX rendering for an editable client proposal.
//
// The DOCX follows the same ProposalDocumentModel used by the browser document
// and PDF route. It is intentionally made of Word-native headings, paragraphs,
// bullets and tables rather than screenshots, so the downloaded file remains
// useful when a proposal needs a client-side redline or internal revision.

import "server-only";

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
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
const WHITE = "FFFFFF";

const TABLE_WIDTH = 9020;

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
  } = {},
): Paragraph {
  return new Paragraph({
    heading: options.heading,
    alignment: options.alignment,
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
    spacing: { before: 260, after: 120 },
    keepNext: true,
    children: [
      textRun(`${number}  `, { bold: true, color: GOLD, size: 25 }),
      textRun(title, { bold: true, color: NAVY, size: 25 }),
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

function table(rows: TableRow[], widths?: number[]): Table {
  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    rows,
  });
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
              width: 2300,
              fill: NAVY,
              verticalAlign: VerticalAlignTable.CENTER,
            }),
            cell(value, { width: TABLE_WIDTH - 2300 }),
          ],
        }),
    ),
    [2300, TABLE_WIDTH - 2300],
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
            { width: TABLE_WIDTH / 3, fill: BAND, borders: noBorders() },
          );
        }),
      }),
    );
  }
  return table(rows, [TABLE_WIDTH / 3, TABLE_WIDTH / 3, TABLE_WIDTH / 3]);
}

function feeTable(groups: DocumentFeeGroup[], totals: ProposalDocumentModel["totalRows"]): Table {
  const widths = [2100, 3500, 760, 1240, 1420];
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
    const fill = total.emphasis === "total" ? NAVY : total.emphasis === "deposit" ? "FBF2DD" : BAND_2;
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
            { width: TABLE_WIDTH / 2, fill: WHITE },
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

export async function renderProposalDocx(model: ProposalDocumentModel): Promise<Buffer> {
  const children: Block[] = [
    para(model.wordmark, { bold: true, color: NAVY, size: 34, spacingAfter: 30 }),
    para(model.docline.toUpperCase(), { color: MUTED, size: 18, spacingAfter: 120 }),
    para(model.headline, { heading: HeadingLevel.TITLE, bold: true, color: NAVY, size: 42, spacingAfter: 80 }),
    para(model.subtitle, { color: MUTED, size: 21, spacingAfter: 150 }),
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
            { width: TABLE_WIDTH, fill: BAND },
          ),
        ],
      }),
    ]),
    heading("02", "Selected Platform Package"),
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
              para("Authorized Signature / Date", { color: MUTED, size: 18, spacingBefore: 260 }),
              para("Printed Name / Title", { color: MUTED, size: 18, spacingBefore: 180 }),
              para("Purchase Order Number, if applicable", { color: MUTED, size: 18, spacingBefore: 180 }),
            ]),
            cell([
              para("Seller Acceptance", { bold: true, color: NAVY, size: 22 }),
              para(signer, { color: INK, size: 19, spacingBefore: 260 }),
              ...(model.signature?.signedOn ? [para(`Signed ${model.signature.signedOn}`, { color: MUTED, size: 17 })] : []),
            ]),
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
