import { describe, expect, it } from "vitest";
import {
  splitMeetingsByTime,
  summarizeClientProposals,
  type ClientMeetingRow,
  type ClientProposalRow,
} from "./related";

function proposal(overrides: Partial<ClientProposalRow>): ClientProposalRow {
  return {
    id: crypto.randomUUID(),
    title: "Proposal",
    proposal_number: null,
    status: "draft",
    proposal_value: null,
    accepted_at: null,
    updated_at: null,
    ...overrides,
  };
}

function meeting(overrides: Partial<ClientMeetingRow>): ClientMeetingRow {
  return {
    id: crypto.randomUUID(),
    title: "Meeting",
    status: "scheduled",
    scheduled_at: null,
    ...overrides,
  };
}

describe("summarizeClientProposals", () => {
  it("returns zeroes for a client with no proposals", () => {
    expect(summarizeClientProposals([])).toEqual({
      openCount: 0,
      openValue: 0,
      wonCount: 0,
      wonValue: 0,
      lostCount: 0,
    });
    expect(summarizeClientProposals(null).openCount).toBe(0);
  });

  it("counts draft, in_review and sent as money still in play", () => {
    const summary = summarizeClientProposals([
      proposal({ status: "draft", proposal_value: 1000 }),
      proposal({ status: "in_review", proposal_value: 2000 }),
      proposal({ status: "sent", proposal_value: 3000 }),
    ]);
    expect(summary.openCount).toBe(3);
    expect(summary.openValue).toBe(6000);
  });

  it("separates won from lost, and totals only what was won", () => {
    const summary = summarizeClientProposals([
      proposal({ status: "accepted", proposal_value: 48000 }),
      proposal({ status: "accepted", proposal_value: 12000 }),
      proposal({ status: "declined", proposal_value: 90000 }),
    ]);
    expect(summary.wonCount).toBe(2);
    expect(summary.wonValue).toBe(60000);
    expect(summary.lostCount).toBe(1);
    expect(summary.openValue).toBe(0);
  });

  it("ignores archived proposals entirely", () => {
    const summary = summarizeClientProposals([proposal({ status: "archived", proposal_value: 5000 })]);
    expect(summary).toEqual({ openCount: 0, openValue: 0, wonCount: 0, wonValue: 0, lostCount: 0 });
  });

  it("does not let a malformed stored value deflate a total", () => {
    const summary = summarizeClientProposals([
      proposal({ status: "sent", proposal_value: -500 }),
      proposal({ status: "sent", proposal_value: "not a number" }),
      proposal({ status: "sent", proposal_value: "2500" }),
      proposal({ status: "sent", proposal_value: null }),
    ]);
    expect(summary.openCount).toBe(4);
    expect(summary.openValue).toBe(2500);
  });
});

describe("splitMeetingsByTime", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  it("puts future meetings in upcoming, soonest first", () => {
    const { upcoming } = splitMeetingsByTime(
      [
        meeting({ title: "Later", scheduled_at: "2026-08-20T12:00:00.000Z" }),
        meeting({ title: "Sooner", scheduled_at: "2026-08-14T12:00:00.000Z" }),
      ],
      now,
    );
    expect(upcoming.map((m) => m.title)).toEqual(["Sooner", "Later"]);
  });

  it("puts past meetings in past, most recent first", () => {
    const { past } = splitMeetingsByTime(
      [
        meeting({ title: "Older", scheduled_at: "2026-07-01T12:00:00.000Z", status: "ended" }),
        meeting({ title: "Recent", scheduled_at: "2026-08-10T12:00:00.000Z", status: "ended" }),
      ],
      now,
    );
    expect(past.map((m) => m.title)).toEqual(["Recent", "Older"]);
  });

  it("treats a cancelled future meeting as past, so nobody prepares for it", () => {
    const { upcoming, past } = splitMeetingsByTime(
      [meeting({ title: "Called off", scheduled_at: "2026-08-20T12:00:00.000Z", status: "cancelled" })],
      now,
    );
    expect(upcoming).toHaveLength(0);
    expect(past.map((m) => m.title)).toEqual(["Called off"]);
  });

  it("treats an unscheduled meeting as past — there is nothing to be early for", () => {
    const { upcoming, past } = splitMeetingsByTime([meeting({ scheduled_at: null })], now);
    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(1);
  });

  it("counts a meeting starting exactly now as upcoming", () => {
    const { upcoming } = splitMeetingsByTime([meeting({ scheduled_at: now.toISOString() })], now);
    expect(upcoming).toHaveLength(1);
  });

  it("survives an unparseable timestamp", () => {
    const { upcoming, past } = splitMeetingsByTime([meeting({ scheduled_at: "whenever" })], now);
    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(1);
  });
});
