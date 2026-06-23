// Client-side export helpers for the Legal Register module (doc §5.11).
// PDF via a generalized Black Label print document (browser "Save as PDF");
// Excel via exceljs (dynamic-imported so it stays out of the main bundle).

import { DEFAULT_LEGAL_DISCLAIMER } from "./types";

export interface ExportColumn {
  header: string;
  key: string;
}

export interface ExportMeta {
  company?: string;
  project?: string;
  generatedBy?: string;
  sources?: string[];
}

export interface ExportSheet {
  name: string; // tab/sheet name + filename stem
  title: string; // human title in the document header
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function metaLine(meta: ExportMeta): string {
  const parts = [
    meta.company ? `Company: ${meta.company}` : null,
    meta.project ? `Project: ${meta.project}` : null,
    `Generated: ${new Date().toLocaleString()}`,
    meta.generatedBy ? `By: ${meta.generatedBy}` : null,
  ].filter(Boolean) as string[];
  return parts.join(" · ");
}

/**
 * Pure, testable transform of a sheet into a flat header/body matrix plus the
 * meta line and fixed disclaimer. Shared shape behind both PDF and Excel output.
 */
export function buildExportMatrix(sheet: ExportSheet, meta: ExportMeta = {}) {
  return {
    title: sheet.title,
    metaLine: metaLine(meta),
    header: sheet.columns.map((c) => c.header),
    body: sheet.rows.map((r) => sheet.columns.map((c) => cell(r[c.key]))),
    disclaimer: DEFAULT_LEGAL_DISCLAIMER,
  };
}

/** Builds a Black Label-styled standalone HTML document and opens the print dialog. */
export function exportPdf(sheet: ExportSheet, meta: ExportMeta = {}): void {
  const head = sheet.columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join("");
  const body = sheet.rows
    .map(
      (r) =>
        `<tr>${sheet.columns.map((c) => `<td>${escapeHtml(cell(r[c.key]))}</td>`).join("")}</tr>`,
    )
    .join("");
  const sources = (meta.sources ?? []).filter(Boolean);

  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(sheet.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; font-size: 11px; }
  .header { background: #0b0b0b; color: #fff; padding: 20px 28px; border-bottom: 4px solid #c9932b; }
  .header h1 { margin: 0; font-size: 20px; color: #f0c86a; }
  .header .meta { color: #cfcfcf; font-size: 11px; margin-top: 6px; }
  .content { padding: 22px 28px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #555; border-bottom: 2px solid #c9932b; padding: 7px 8px; }
  tbody td { padding: 7px 8px; vertical-align: top; border-bottom: 1px solid #e2e2e2; }
  tbody tr:nth-child(even) { background: #faf7f0; }
  .disclaimer { margin-top: 20px; padding: 10px 12px; border: 1px solid #e0c98a; background: #fdf8ec; color: #6b5a2a; font-size: 10px; border-radius: 4px; }
  .sources { margin-top: 14px; font-size: 10px; color: #555; }
  .sources b { color: #111; }
  @media print { .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; } tr { page-break-inside: avoid; } }
</style></head>
<body>
  <div class="header"><h1>${escapeHtml(sheet.title)}</h1><div class="meta">Reliance Predictive Safety Technologies &middot; ${escapeHtml(metaLine(meta))} &middot; ${sheet.rows.length} row${sheet.rows.length === 1 ? "" : "s"}</div></div>
  <div class="content">
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    ${sources.length ? `<div class="sources"><b>Sources:</b> ${escapeHtml(sources.join("; "))}</div>` : ""}
    <div class="disclaimer">${escapeHtml(DEFAULT_LEGAL_DISCLAIMER)}</div>
  </div>
</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const idoc = iframe.contentWindow?.document;
  if (!idoc) {
    document.body.removeChild(iframe);
    return;
  }
  idoc.open();
  idoc.write(doc);
  idoc.close();
  const win = iframe.contentWindow!;
  const trigger = () => {
    win.focus();
    win.print();
    setTimeout(() => iframe.parentNode?.removeChild(iframe), 1000);
  };
  if (idoc.readyState === "complete") setTimeout(trigger, 250);
  else win.onload = () => setTimeout(trigger, 250);
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

/** Writes one or more sheets to a real .xlsx workbook and downloads it. */
export async function exportExcel(filenameStem: string, sheets: ExportSheet[], meta: ExportMeta = {}): Promise<void> {
  const mod = await import("exceljs");
  // exceljs is CommonJS; interop default may or may not be present.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ExcelJS: any = (mod as any).default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Reliance Predictive Safety Technologies";

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31) || "Sheet");
    ws.addRow([sheet.title]);
    ws.addRow([metaLine(meta)]);
    ws.addRow([]);
    const headerRow = ws.addRow(sheet.columns.map((c) => c.header));
    headerRow.font = { bold: true };
    for (const r of sheet.rows) ws.addRow(sheet.columns.map((c) => cell(r[c.key])));
    ws.addRow([]);
    ws.addRow([DEFAULT_LEGAL_DISCLAIMER]);
    ws.columns.forEach((col: { width?: number }) => {
      col.width = 28;
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  download(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${filenameStem}.xlsx`,
  );
}
