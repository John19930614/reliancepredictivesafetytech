import { describe, expect, it } from "vitest";
import { canSetReleaseStatus, isReleaseStatus, releaseStatuses } from "./release-policy";

describe("isReleaseStatus", () => {
  it("accepts every status the database permits", () => {
    for (const status of releaseStatuses) {
      expect(isReleaseStatus(status)).toBe(true);
    }
  });

  it("rejects anything else, including near-misses and non-strings", () => {
    expect(isReleaseStatus("Deployed")).toBe(false);
    expect(isReleaseStatus("shipped")).toBe(false);
    expect(isReleaseStatus("")).toBe(false);
    expect(isReleaseStatus(null)).toBe(false);
    expect(isReleaseStatus(undefined)).toBe(false);
    expect(isReleaseStatus(3)).toBe(false);
  });
});

describe("canSetReleaseStatus", () => {
  it("refuses a status the database would reject, naming the valid ones", () => {
    const gate = canSetReleaseStatus({ nextStatus: "shipped" });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain("not a release status");
    expect(gate.reason).toContain("deployed");
  });

  it("refuses to mark a release deployed without a sign-off", () => {
    const gate = canSetReleaseStatus({ nextStatus: "deployed", signedOffAt: null });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain("Sign the release off");
  });

  it("treats a missing sign-off field the same as an absent sign-off", () => {
    expect(canSetReleaseStatus({ nextStatus: "deployed" }).ok).toBe(false);
  });

  it("allows deployment once the release is signed off", () => {
    const gate = canSetReleaseStatus({
      nextStatus: "deployed",
      signedOffAt: "2026-08-13T12:00:00.000Z",
    });
    expect(gate.ok).toBe(true);
    expect(gate.reason).toBeUndefined();
  });

  it("leaves every other transition alone, signed off or not", () => {
    for (const status of releaseStatuses.filter((s) => s !== "deployed")) {
      expect(canSetReleaseStatus({ nextStatus: status, signedOffAt: null }).ok).toBe(true);
    }
  });
});
