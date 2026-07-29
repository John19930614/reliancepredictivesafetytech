export const proposalStatuses = ["draft", "in_review", "sent", "accepted", "declined", "archived"] as const;
export type ProposalStatus = (typeof proposalStatuses)[number];

export const proposalStatusLabels: Record<ProposalStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  archived: "Archived",
};

export const proposalStatusColors: Record<ProposalStatus, string> = {
  draft: "#a7a7a7",
  in_review: "#f59e0b",
  sent: "#3b82f6",
  accepted: "#22c55e",
  declined: "#ef4444",
  archived: "#6b7280",
};

export interface ProposalRow {
  id: string;
  client_id: string | null;
  title: string;
  status: ProposalStatus;
  owner: string | null;
  proposal_value: number | null;
  valid_until: string | null;
  summary: string | null;
  body_markdown: string | null;
  current_revision: number;
  created_at: string;
  updated_at: string;
}

export interface ProposalRevisionRow {
  id: string;
  proposal_id: string;
  revision_number: number;
  title: string;
  summary: string | null;
  body_markdown: string | null;
  change_note: string | null;
  status_at_save: string | null;
  form_data: unknown;
  created_at: string;
}
