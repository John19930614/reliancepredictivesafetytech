import { describe, expect, it } from "vitest";
import {
  firstGrantStatusKey,
  grantStatus,
  grantStatusColor,
  grantStatusKeys,
  grantStatusLabel,
  grantStatusRank,
  grantStatuses,
  isGrantStatusKey,
  isGrantTerminalStatus,
} from "./statuses";

describe("grant statuses", () => {
  it("declares nine unique keys and a catalog entry for each", () => {
    expect(grantStatusKeys).toHaveLength(9);
    expect(new Set(grantStatusKeys).size).toBe(9);
    expect(grantStatuses).toHaveLength(9);

    for (const key of grantStatusKeys) {
      const status = grantStatus(key);
      expect(status, `no catalog entry for ${key}`).not.toBeNull();
      expect(status?.label).toBeTruthy();
      expect(status?.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("starts a new grant in identified", () => {
    expect(firstGrantStatusKey).toBe("identified");
    expect(isGrantStatusKey(firstGrantStatusKey)).toBe(true);
  });

  it("treats exactly awarded, declined and not_eligible as terminal", () => {
    const terminal = grantStatusKeys.filter((key) => isGrantTerminalStatus(key));
    expect(terminal).toEqual(["awarded", "declined", "not_eligible"]);
    expect(grantStatuses.filter((status) => status.isTerminal).map((status) => status.key)).toEqual(terminal);
  });

  it("keeps on_hold out of the terminal set so a parked grant can re-enter the pipeline", () => {
    // Lighter Capital is "keep on hand", not dead. A terminal status would need
    // an admin to reopen it.
    expect(isGrantTerminalStatus("on_hold")).toBe(false);
  });

  it("rejects display strings and blanks, including the ones the source sheet used", () => {
    expect(isGrantStatusKey(null)).toBe(false);
    expect(isGrantStatusKey(undefined)).toBe(false);
    expect(isGrantStatusKey("")).toBe(false);
    expect(isGrantStatusKey("Application Submitted")).toBe(false);
    expect(isGrantStatusKey("Reviewing membership")).toBe(false);
    expect(isGrantStatusKey("pre-reg")).toBe(false);
    expect(isGrantStatusKey("We do not qualify")).toBe(false);
  });

  it("degrades rather than throwing on an unknown key", () => {
    // A hand-edited row must render as off-workflow, not take the page down.
    expect(grantStatus("nope")).toBeNull();
    expect(grantStatusLabel("nope")).toBe("nope");
    expect(grantStatusColor("nope")).toBe("#a7a7a7");
    expect(grantStatusRank("nope")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("ranks work blocked on us ahead of work blocked on the funder", () => {
    expect(grantStatusRank("researching")).toBeLessThan(grantStatusRank("inquiry_sent"));
    expect(grantStatusRank("pre_registered")).toBeLessThan(grantStatusRank("application_submitted"));
    expect(grantStatusRank("application_submitted")).toBeLessThan(grantStatusRank("identified"));
    expect(grantStatusRank("on_hold")).toBeLessThan(grantStatusRank("awarded"));
  });
});
