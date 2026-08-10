import { generateObject } from "ai";
import { z } from "zod";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { validateAIOutput } from "@/lib/ai/gateway";
import { checkAiBudget, recordAiUsage } from "@/lib/ai/metering";
import { createClient } from "@/lib/supabase/server";
import { COMPANY_NAME } from "@/lib/company-data";

const notesModel = process.env.AI_COMMAND_MODEL || "openai/gpt-4o-mini";

function hasAiGatewayAuth() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL === "1");
}

const requestSchema = z.object({
  meetingId: z.string().min(1).optional(),
  title: z.string().max(200).optional(),
  transcript: z.string().min(1, "There is no transcript to summarize yet."),
  participants: z.array(z.string()).optional(),
});

const notesSchema = z.object({
  summary: z.string().describe("A concise 2-4 sentence overview of the meeting."),
  keyPoints: z.array(z.string()).describe("The most important discussion points."),
  decisions: z.array(z.string()).describe("Decisions that were agreed during the call."),
  actionItems: z
    .array(
      z.object({
        task: z.string(),
        owner: z.string().nullable().optional(),
        due: z.string().nullable().optional(),
      }),
    )
    .describe("Follow-up tasks, with an owner and due date when one was stated."),
  questionsRaised: z.array(z.string()).describe("Open questions or concerns the customer raised."),
  nextSteps: z.array(z.string()).describe("Concrete next steps after the meeting."),
});

type MeetingNotes = z.infer<typeof notesSchema>;

async function getAuthorizedEmployee() {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to generate meeting notes.");
  }

  const { data: role, error } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .eq("account_status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!role) {
    throw new Error("Only active employees can generate meeting notes.");
  }

  return { supabase, user };
}

function bullets(items: string[], emptyText: string): Paragraph[] {
  if (items.length === 0) {
    return [new Paragraph({ children: [new TextRun({ text: emptyText, italics: true, color: "6B7280" })] })];
  }

  return items.map(
    (item) =>
      new Paragraph({
        text: item,
        bullet: { level: 0 },
      }),
  );
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, color: "8A5D05" })],
  });
}

function buildDocument(input: {
  title: string;
  generatedAt: string;
  participants: string[];
  notes: MeetingNotes;
  transcript: string;
}): Document {
  const { title, generatedAt, participants, notes, transcript } = input;

  const actionParagraphs =
    notes.actionItems.length === 0
      ? bullets([], "No action items were captured.")
      : notes.actionItems.map((item) => {
          const meta = [item.owner ? `Owner: ${item.owner}` : null, item.due ? `Due: ${item.due}` : null]
            .filter(Boolean)
            .join(" · ");

          return new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({ text: item.task, bold: true }),
              ...(meta ? [new TextRun({ text: `  (${meta})`, color: "6B7280" })] : []),
            ],
          });
        });

  const transcriptParagraphs = transcript
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map(
      (line) =>
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: line, size: 20, color: "374151" })],
        }),
    );

  return new Document({
    creator: COMPANY_NAME,
    title,
    description: "AI-generated meeting notes",
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: title })],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text: generatedAt, color: "6B7280" })],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({ text: "Participants: ", bold: true }),
              new TextRun({ text: participants.length > 0 ? participants.join(", ") : "Not recorded" }),
            ],
          }),

          sectionHeading("Summary"),
          new Paragraph({ text: notes.summary }),

          sectionHeading("Key Discussion Points"),
          ...bullets(notes.keyPoints, "No key points were captured."),

          sectionHeading("Decisions"),
          ...bullets(notes.decisions, "No decisions were recorded."),

          sectionHeading("Action Items"),
          ...actionParagraphs,

          sectionHeading("Questions & Concerns"),
          ...bullets(notes.questionsRaised, "No open questions were captured."),

          sectionHeading("Next Steps"),
          ...bullets(notes.nextSteps, "No next steps were captured."),

          sectionHeading("Full Transcript"),
          ...(transcriptParagraphs.length > 0
            ? transcriptParagraphs
            : bullets([], "No transcript was captured.")),

          new Paragraph({
            spacing: { before: 320 },
            alignment: AlignmentType.LEFT,
            children: [
              new TextRun({
                text: "AI-generated from a live transcript. Review for accuracy before relying on it; this is not legal, safety, or compliance advice.",
                italics: true,
                size: 16,
                color: "9CA3AF",
              }),
            ],
          }),
        ],
      },
    ],
  });
}

function safeFileName(title: string) {
  const base = title.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return `${base || "meeting-notes"}.docx`;
}

/** Every model-authored string in the notes, flattened for the AI gateway. */
function notesToText(notes: MeetingNotes): string {
  return [
    notes.summary,
    ...notes.keyPoints,
    ...notes.decisions,
    ...notes.actionItems.map((item) => [item.task, item.owner, item.due].filter(Boolean).join(" — ")),
    ...notes.questionsRaised,
    ...notes.nextSteps,
  ].join("\n");
}

export async function POST(req: Request) {
  try {
    const { user } = await getAuthorizedEmployee();

    if (!hasAiGatewayAuth()) {
      return Response.json(
        { error: "AI Gateway is not configured. Set AI_GATEWAY_API_KEY for local use, or enable Vercel OIDC in deployment." },
        { status: 503 },
      );
    }

    const parsed = requestSchema.safeParse(await req.json());

    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }

    const title = (parsed.data.title?.trim() || "Sales Meeting Notes").slice(0, 200);
    const transcript = parsed.data.transcript.trim();
    const participants = (parsed.data.participants ?? []).map((name) => name.trim()).filter(Boolean);

    const budget = await checkAiBudget("sales_meeting_notes");
    if (!budget.allowed) {
      return Response.json({ error: budget.message }, { status: 429 });
    }
    const model = budget.modelOverride ?? notesModel;

    const { object: notes, usage } = await generateObject({
      model,
      schema: notesSchema,
      system:
        "You are a precise meeting-notes assistant for a B2B safety-technology sales team. " +
        "Summarize the transcript faithfully. Do not invent details, owners, dates, or commitments that were not stated. " +
        "Leave a list empty rather than guessing. Keep each bullet short and factual.",
      prompt:
        `Meeting title: ${title}\n` +
        (participants.length > 0 ? `Participants: ${participants.join(", ")}\n` : "") +
        `\nTranscript (speaker-labeled, in order):\n${transcript}`,
    });

    await recordAiUsage({
      featureKey: "sales_meeting_notes",
      runSource: "user",
      userId: user.id,
      model,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    });

    // AI Gateway — this output enters an official workflow, so it must pass
    // validateAIOutput() before the document is assembled. A block or fail
    // (injection pattern, PII) never reaches the docx; a warn proceeds because
    // the notes are human-reviewed by nature, and the verdict travels on the
    // response header since the payload itself is the binary document.
    const gateway = validateAIOutput({ rawOutput: notesToText(notes), promptKey: "sales_meeting_notes" });
    if (gateway.status === "blocked" || gateway.status === "fail") {
      const reason =
        gateway.blockedReason ||
        gateway.checks.find((check) => check.status === "fail")?.detail ||
        "AI gateway rejected the generated notes.";
      return Response.json(
        { error: `Meeting notes were blocked by the AI safety gateway: ${reason}` },
        { status: 422 },
      );
    }

    const generatedAt = new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "America/Chicago",
    }).format(new Date());

    const doc = buildDocument({ title, generatedAt, participants, notes, transcript });
    const buffer = await Packer.toBuffer(doc);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeFileName(title)}"`,
        "Cache-Control": "no-store",
        "X-AI-Gateway-Status": gateway.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate meeting notes.";
    return Response.json({ error: message }, { status: 500 });
  }
}
