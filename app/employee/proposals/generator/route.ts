import { NextResponse } from "next/server";
import { getProposalAccess } from "@/lib/proposals/access";
import { proposalGeneratorHtml } from "@/lib/proposals/generator-html";

/**
 * Serves the embedded Proposal & Billing Generator (v15) for the workspace
 * iframe. Auth-gated: the generator carries the internal pricing catalog, so it
 * is never exposed as a public static asset.
 */
export async function GET() {
  const { userId, canRead } = await getProposalAccess();
  if (!userId || !canRead) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return new NextResponse(proposalGeneratorHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
