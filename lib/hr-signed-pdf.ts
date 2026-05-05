import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { HrFormAnswers, HrFormDefinition, HrFormField, HrFormAnswerValue, HrDocumentTemplate } from "@/lib/company-data";

type GenerateSignedOnboardingPdfParams = {
  template: Pick<HrDocumentTemplate, "title" | "category" | "version" | "body_text">;
  formDefinition: HrFormDefinition;
  answers: HrFormAnswers;
  typedLegalName: string;
  signerEmail: string | null;
  signerIp: string | null;
  signedAt: string;
};

function sanitizePdfText(value: string) {
  return value.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "").trim();
}

function formatAnswer(value: HrFormAnswerValue | undefined) {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "object" && value) {
    return Object.entries(value)
      .filter(([, item]) => item)
      .map(([key, item]) => `${key.replace(/_/g, " ")}: ${item}`)
      .join(", ");
  }

  return String(value ?? "");
}

function wrapText(text: string, maxChars: number) {
  const words = sanitizePdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function getSectionedFields(fields: HrFormField[]) {
  const sections = new Map<string, HrFormField[]>();

  for (const field of fields) {
    const section = field.section || "Form details";
    sections.set(section, [...(sections.get(section) ?? []), field]);
  }

  return [...sections.entries()];
}

export async function generateSignedOnboardingPdf({
  template,
  formDefinition,
  answers,
  typedLegalName,
  signerEmail,
  signerIp,
  signedAt,
}: GenerateSignedOnboardingPdfParams) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 612;
  const height = 792;
  const margin = 54;
  const contentWidth = width - margin * 2;
  let page = pdf.addPage([width, height]);
  let y = height - margin;

  function addPageIfNeeded(requiredHeight: number) {
    if (y - requiredHeight >= margin) {
      return;
    }

    page = pdf.addPage([width, height]);
    y = height - margin;
  }

  function drawLine(text: string, options?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number }) {
    const size = options?.size ?? 10;
    const gap = options?.gap ?? size + 4;
    addPageIfNeeded(gap);
    page.drawText(sanitizePdfText(text), {
      x: margin,
      y,
      size,
      font: options?.bold ? bold : regular,
      color: options?.color ?? rgb(0.12, 0.12, 0.12),
    });
    y -= gap;
  }

  function drawWrapped(text: string, options?: { size?: number; bold?: boolean; maxChars?: number; gap?: number }) {
    const size = options?.size ?? 10;
    const lines = wrapText(text, options?.maxChars ?? 92);
    addPageIfNeeded(lines.length * (size + 4));
    for (const line of lines) {
      page.drawText(line, {
        x: margin,
        y,
        size,
        font: options?.bold ? bold : regular,
        color: rgb(0.12, 0.12, 0.12),
      });
      y -= options?.gap ?? size + 4;
    }
  }

  page.drawRectangle({
    x: 0,
    y: height - 88,
    width,
    height: 88,
    color: rgb(0.08, 0.12, 0.16),
  });
  page.drawText("Reliance Predictive Safety Technologies LLC", {
    x: margin,
    y: height - 42,
    size: 14,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Signed Employee Onboarding Record", {
    x: margin,
    y: height - 64,
    size: 10,
    font: regular,
    color: rgb(0.86, 0.9, 0.92),
  });

  y = height - 120;
  drawWrapped(template.title, { size: 18, bold: true, maxChars: 54, gap: 22 });
  drawLine(`${template.category} | Template version ${template.version}`, { size: 10 });
  drawLine(`Form: ${formDefinition.official_form_name || formDefinition.title}`, { size: 10 });
  drawLine(`Jurisdiction: ${formDefinition.jurisdiction_type.toUpperCase()} ${formDefinition.jurisdiction_code}`, { size: 10 });

  if (formDefinition.official_form_edition || formDefinition.official_form_expiration_date) {
    drawLine(
      `Official edition: ${formDefinition.official_form_edition ?? "Not specified"} | Expiration: ${
        formDefinition.official_form_expiration_date ?? "Not specified"
      }`,
      { size: 10 },
    );
  }

  if (formDefinition.form_source_url) {
    drawWrapped(`Source: ${formDefinition.form_source_url}`, { size: 9, maxChars: 96 });
  }

  y -= 12;
  if (template.body_text) {
    drawWrapped(template.body_text, { size: 9, maxChars: 96, gap: 12 });
    y -= 10;
  }

  for (const [section, fields] of getSectionedFields(formDefinition.field_schema)) {
    addPageIfNeeded(42);
    drawLine(section, { size: 12, bold: true, gap: 18 });

    for (const field of fields) {
      const answer = formatAnswer(answers[field.name]);
      const sensitiveLabel = field.sensitive ? " (sensitive)" : "";
      drawWrapped(`${field.label}${sensitiveLabel}: ${answer || "Not provided"}`, { size: 10, maxChars: 88, gap: 14 });
    }

    y -= 6;
  }

  addPageIfNeeded(120);
  y -= 8;
  page.drawRectangle({
    x: margin,
    y: y - 92,
    width: contentWidth,
    height: 106,
    borderColor: rgb(0.72, 0.58, 0.28),
    borderWidth: 1,
    color: rgb(0.99, 0.97, 0.91),
  });
  y -= 16;
  drawLine("Electronic Signature", { size: 12, bold: true, gap: 18 });
  drawLine(`Signed by: ${typedLegalName}`, { size: 10 });
  drawLine(`Signer email: ${signerEmail ?? "Not captured"}`, { size: 10 });
  drawLine(`Signed at: ${signedAt}`, { size: 10 });
  drawLine(`Signer IP: ${signerIp ?? "Not captured"}`, { size: 10 });

  const bytes = await pdf.save();
  const buffer = Buffer.from(bytes);
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  return { bytes: buffer, sha256 };
}
