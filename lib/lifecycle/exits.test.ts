import { describe, expect, it } from "vitest";
import {
  checkExitInput,
  isClosed,
  isLifecycleExitStatus,
  isOpen,
  lifecycleExit,
  lifecycleExits,
  maxCompetitorLength,
  maxExitReasonLength,
  minExitReasonLength,
  opportunityStatuses,
} from "./exits";

const GOOD_REASON = "Budget pulled for the fiscal year, revisit in Q1.";

describe("the three exit paths", () => {
  it("offers Closed Lost, On Hold and Disqualified", () => {
    expect(lifecycleExits.map((exit) => exit.status)).toEqual(["closed_lost", "on_hold", "disqualified"]);
  });

  it("asks for a competitor only on Closed Lost", () => {
    expect(lifecycleExit("closed_lost")?.capturesCompetitor).toBe(true);
    expect(lifecycleExit("on_hold")?.capturesCompetitor).toBe(false);
    expect(lifecycleExit("disqualified")?.capturesCompetitor).toBe(false);
  });

  it("asks for a follow-up date only on On Hold", () => {
    expect(lifecycleExit("on_hold")?.capturesHoldDate).toBe(true);
    expect(lifecycleExit("closed_lost")?.capturesHoldDate).toBe(false);
  });

  it("recognises the exit statuses and nothing else", () => {
    for (const status of ["closed_lost", "on_hold", "disqualified"]) {
      expect(isLifecycleExitStatus(status), status).toBe(true);
    }
    for (const status of ["open", "won", "lost", "", null, undefined]) {
      expect(isLifecycleExitStatus(status), String(status)).toBe(false);
    }
  });

  it("lists every status a record can hold", () => {
    expect([...opportunityStatuses]).toEqual(["open", "won", "closed_lost", "on_hold", "disqualified"]);
  });
});

describe("isOpen / isClosed", () => {
  it("treats only 'open' as still being worked", () => {
    expect(isOpen("open")).toBe(true);
    for (const status of ["won", "closed_lost", "on_hold", "disqualified"]) {
      expect(isOpen(status), status).toBe(false);
    }
  });

  it("treats won and every exit as closed", () => {
    for (const status of ["won", "closed_lost", "on_hold", "disqualified"]) {
      expect(isClosed(status), status).toBe(true);
    }
    expect(isClosed("open")).toBe(false);
  });
});

describe("checkExitInput", () => {
  it("accepts a Closed Lost with a reason and a competitor", () => {
    const result = checkExitInput({
      status: "closed_lost",
      reason: `  ${GOOD_REASON}  `,
      competitor: "  Acme Safety  ",
    });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      status: "closed_lost",
      reason: GOOD_REASON,
      competitor: "Acme Safety",
      holdUntil: null,
    });
  });

  it("refuses an unknown exit path", () => {
    expect(checkExitInput({ status: "abandoned", reason: GOOD_REASON }).ok).toBe(false);
  });

  it("refuses an empty or whitespace-only reason", () => {
    for (const reason of ["", "   ", null, undefined]) {
      const result = checkExitInput({ status: "closed_lost", reason });
      expect(result.ok, String(reason)).toBe(false);
      expect(result.fieldErrors?.reason).toBeTruthy();
    }
  });

  // A one-word reason is indistinguishable from no reason, and this record
  // exists precisely so a later reader can act on it.
  it("refuses a reason too short to be useful", () => {
    expect(checkExitInput({ status: "disqualified", reason: "no fit" }).ok).toBe(false);
  });

  it("accepts a reason at exactly the floor and the ceiling", () => {
    expect(checkExitInput({ status: "disqualified", reason: "a".repeat(minExitReasonLength) }).ok).toBe(true);
    expect(checkExitInput({ status: "disqualified", reason: "a".repeat(maxExitReasonLength) }).ok).toBe(true);
  });

  it("refuses a reason longer than the column allows", () => {
    // Failing here beats a 23514 at the database.
    const result = checkExitInput({ status: "disqualified", reason: "a".repeat(maxExitReasonLength + 1) });
    expect(result.ok).toBe(false);
    expect(result.error).toContain(String(maxExitReasonLength));
  });

  // A competitor on an On Hold record would later read as a loss.
  it("drops a competitor supplied on an exit that does not capture one", () => {
    const result = checkExitInput({
      status: "disqualified",
      reason: GOOD_REASON,
      competitor: "Acme Safety",
    });
    expect(result.ok).toBe(true);
    expect(result.value?.competitor).toBeNull();
  });

  it("refuses a competitor name that is too long", () => {
    const result = checkExitInput({
      status: "closed_lost",
      reason: GOOD_REASON,
      competitor: "a".repeat(maxCompetitorLength + 1),
    });
    expect(result.ok).toBe(false);
  });

  it("treats a blank competitor as none", () => {
    const result = checkExitInput({ status: "closed_lost", reason: GOOD_REASON, competitor: "   " });
    expect(result.value?.competitor).toBeNull();
  });

  // A hold with no date is how deals disappear — it is the difference between
  // nurture and abandonment.
  it("requires a follow-up date on On Hold", () => {
    const result = checkExitInput({ status: "on_hold", reason: GOOD_REASON });
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.holdUntil).toBeTruthy();
  });

  it("refuses a malformed follow-up date", () => {
    for (const date of ["next March", "01/11/2026", "2026-11", ""]) {
      expect(checkExitInput({ status: "on_hold", reason: GOOD_REASON, holdUntil: date }).ok, date).toBe(false);
    }
  });

  // The right shape is not the same as a real date: "2026-13-45" would reach a
  // `date` column and fail there with a message nobody can act on.
  it("refuses a date that is the right shape but does not exist", () => {
    for (const date of ["2026-13-01", "2026-02-30", "2026-00-10", "2026-11-31"]) {
      expect(checkExitInput({ status: "on_hold", reason: GOOD_REASON, holdUntil: date }).ok, date).toBe(false);
    }
  });

  it("accepts a real leap day", () => {
    expect(checkExitInput({ status: "on_hold", reason: GOOD_REASON, holdUntil: "2028-02-29" }).ok).toBe(true);
  });

  it("accepts an On Hold with a date", () => {
    const result = checkExitInput({ status: "on_hold", reason: GOOD_REASON, holdUntil: "2026-11-01" });
    expect(result.ok).toBe(true);
    expect(result.value?.holdUntil).toBe("2026-11-01");
  });

  it("drops a hold date supplied on an exit that does not capture one", () => {
    const result = checkExitInput({ status: "closed_lost", reason: GOOD_REASON, holdUntil: "2026-11-01" });
    expect(result.value?.holdUntil).toBeNull();
  });
});
