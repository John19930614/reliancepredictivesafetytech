import { describe, expect, it } from "vitest";
import { buildProposalDocumentModel } from "@/components/proposals/proposal-document-model";
import type { GeneratorState } from "./generator-state";
import { computeProposalTotals } from "./pricing";
import { renderProposalDocx } from "./docx";

const state: GeneratorState = {
  v: 1,
  fields: {
    sellerName: "Reliance Predictive Safety Technologies",
    preparedBy: "John Haldemann",
    sellerContact: "Sussex, Wisconsin\nEmail: sales@example.com",
    clientCompany: "Northwind Construction",
    clientContact: "Dana Reyes",
    clientTitle: "Director of Safety",
    proposalDate: "2026-03-04",
    proposalNo: "RPS-2026-0001",
    packageSelect: "starter",
    annualPrice: 12000,
  },
  phases: [],
  services: [],
};

describe("renderProposalDocx", () => {
  it("produces a downloadable Word document from the proposal view-model", async () => {
    const model = buildProposalDocumentModel({
      state,
      totals: computeProposalTotals(state),
      proposal: {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Northwind Construction — Platform Proposal",
        status: "draft",
        currentRevision: 1,
        validUntil: "2026-05-01",
      },
    });

    const bytes = await renderProposalDocx(model);

    expect(bytes.length).toBeGreaterThan(10_000);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
  });
});
