import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

// Invoice DOCX rendering — the `docx` package, same library and color
// constants as lib/proposals/docx.ts, so the two document families read as
// one company's output even though this one is a single table rather than a
// multi-section proposal.

import {
  AlignmentType,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { InvoiceDocumentModel } from "./document-model";

const NAVY = "0C3450";
const GOLD = "C99429";
const INK = "16242F";
const MUTED = "59697D";
const BAND = "F1F6FA";

const PAGE_WIDTH = 12240; // US Letter, twips
const MARGIN_X = 863;
const TABLE_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const COL_RATIOS = [0.46, 0.1, 0.16, 0.14, 0.14];
const COL_WIDTHS = COL_RATIOS.map((r) => Math.round(TABLE_WIDTH * r));

async function sealImageRun(): Promise<ImageRun | null> {
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "reliance-seal-transparent.png"));
    return new ImageRun({
      type: "png",
      data: bytes,
      transformation: { width: 54, height: 54 },
      altText: { title: "Reliance seal", description: "Reliance seal", name: "Reliance seal" },
    });
  } catch {
    return null;
  }
}

function para(text: string, opts: { bold?: boolean; size?: number; color?: string; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacingAfter?: number } = {}) {
  return new Paragraph({
    alignment: opts.alignment,
    spacing: { after: opts.spacingAfter ?? 60 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 20, color: opts.color ?? INK })],
  });
}

function cell(children: Paragraph[], opts: { width: number; shading?: string; bold?: boolean } = { width: 0 }) {
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: opts.shading ? { type: ShadingType.CLEAR, fill: opts.shading, color: "auto" } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children,
  });
}

export async function renderInvoiceDocx(model: InvoiceDocumentModel): Promise<Buffer> {
  const seal = await sealImageRun();
  const headerRow = new TableRow({
    children: ["Description", "Qty", "Unit", "Unit amount", "Amount"].map((label, i) =>
      cell([para(label, { bold: true, size: 18, color: NAVY })], { width: COL_WIDTHS[i], shading: BAND }),
    ),
  });

  // A description with an embedded newline is "Category\nSpecific item" (see
  // lib/invoices/create-from-proposal.ts's describeLine()) and prints as a
  // small bold category line above the item name, rather than one paragraph.
  const descriptionParagraphs = (description: string, serviceDate: string | null) => {
    const [category, ...rest] = description.split("\n");
    const body =
      rest.length === 0
        ? [para(description, { size: 19 })]
        : [para(category, { bold: true, size: 15, color: MUTED, spacingAfter: 20 }), para(rest.join(" "), { size: 19 })];
    // When the work was done, under the item it was done for. Small and muted
    // so it reads as a qualifier on the line, not as another line item.
    if (serviceDate) body.push(para(`Serviced ${serviceDate}`, { size: 15, color: MUTED }));
    return body;
  };

  const lineRows = model.lines.map(
    (line) =>
      new TableRow({
        children: [
          cell(descriptionParagraphs(line.description, line.serviceDate), { width: COL_WIDTHS[0] }),
          cell([para(line.qty, { size: 19, alignment: AlignmentType.RIGHT })], { width: COL_WIDTHS[1] }),
          cell([para(line.unit, { size: 19 })], { width: COL_WIDTHS[2] }),
          cell([para(line.unitAmount, { size: 19, alignment: AlignmentType.RIGHT })], { width: COL_WIDTHS[3] }),
          cell([para(line.lineTotal, { size: 19, bold: true, alignment: AlignmentType.RIGHT })], { width: COL_WIDTHS[4] }),
        ],
      }),
  );

  const lineTable = new Table({ width: { size: TABLE_WIDTH, type: WidthType.DXA }, rows: [headerRow, ...lineRows] });

  const totalsRow = (label: string, value: string, bold = false) =>
    new TableRow({
      children: [
        cell([para("", { size: 19 })], { width: TABLE_WIDTH - COL_WIDTHS[3] - COL_WIDTHS[4] }),
        cell([para(label, { bold, size: bold ? 21 : 19, color: bold ? NAVY : MUTED, alignment: AlignmentType.RIGHT })], { width: COL_WIDTHS[3] }),
        cell([para(value, { bold, size: bold ? 21 : 19, color: bold ? NAVY : INK, alignment: AlignmentType.RIGHT })], { width: COL_WIDTHS[4] }),
      ],
    });

  const totalsTable = new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    rows: [totalsRow("Subtotal", model.subtotal), totalsRow("Tax", model.tax), totalsRow("Total due", model.total, true)],
  });

  const metaLine = (label: string, value: string | null) => (value ? para(`${label}: ${value}`, { size: 18, color: MUTED }) : null);

  type Block = Paragraph | Table;

  const children: Block[] = [
    new Paragraph({
      children: [
        ...(seal ? [seal, new TextRun({ text: "  " })] : []),
        new TextRun({ text: model.seller.name, bold: true, size: 26, color: NAVY }),
        new TextRun({ text: "\tINVOICE", bold: true, size: 32, color: NAVY }),
      ],
      tabStops: [{ type: "right" as const, position: TABLE_WIDTH }],
    }),
    ...model.seller.addressLines.map((line) => para(line, { size: 16, color: MUTED, spacingAfter: 20 })),
    model.seller.email || model.seller.phone
      ? para([model.seller.email, model.seller.phone].filter(Boolean).join("  ·  "), { size: 16, color: MUTED, spacingAfter: 200 })
      : para("", { spacingAfter: 200 }),

    para("BILL TO", { bold: true, size: 16, color: MUTED, spacingAfter: 40 }),
    para(model.billTo.name || "—", { bold: true, size: 22, color: NAVY, spacingAfter: 40 }),
    ...model.billTo.addressLines.map((line) => para(line, { size: 18, color: MUTED, spacingAfter: 20 })),

    new Paragraph({ spacing: { before: 160, after: 160 }, border: { bottom: { color: GOLD, size: 6, style: "single", space: 1 } }, children: [] }),

    para(`Invoice #: ${model.invoiceNumber}`, { size: 18 }),
    metaLine("Proposal #", model.proposalNumber),
    para(`Status: ${model.statusLabel}   ·   Kind: ${model.kindLabel}`, { size: 18 }),
    metaLine("Issue date", model.issueDate),
    metaLine("Due date", model.dueDate),
    metaLine("Job / site", model.jobName),
    metaLine("Consultant", model.consultantName),
    metaLine("Client PO / agreement ref", model.clientAgreementRef),
    metaLine("Prepared by", model.preparedBy),
  ].filter((p): p is Paragraph => p !== null);

  children.push(new Paragraph({ spacing: { before: 100, after: 200 }, children: [] }));
  children.push(lineTable);
  children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [] }));
  children.push(totalsTable);

  if (model.paymentTerms) {
    children.push(new Paragraph({ spacing: { before: 300, after: 40 }, children: [] }));
    children.push(para("PAYMENT TERMS", { bold: true, size: 16, color: MUTED }));
    children.push(para(model.paymentTerms, { size: 18 }));
  }
  if (model.notes) {
    children.push(new Paragraph({ spacing: { before: 200, after: 40 }, children: [] }));
    children.push(para("NOTES", { bold: true, size: 16, color: MUTED }));
    children.push(para(model.notes, { size: 18 }));
  }

  const document = new Document({
    sections: [
      {
        properties: { page: { margin: { top: MARGIN_X, bottom: MARGIN_X, left: MARGIN_X, right: MARGIN_X } } },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}
