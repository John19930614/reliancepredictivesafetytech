import { describe, expect, it } from "vitest";
import { findDeadTime, utilizationPct, type UtilizationPlacement } from "./utilization";

const placement = (overrides: Partial<UtilizationPlacement>): UtilizationPlacement => ({
  placement_id: "p1",
  candidate_name: "Dana Reyes",
  client_name: "Hunzinger",
  logged_hours: 0,
  ...overrides,
});

describe("findDeadTime", () => {
  it("flags an active placement with no hours as the loud case", () => {
    const flags = findDeadTime([placement({ logged_hours: 0 })], 40);
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("no_hours");
    expect(flags[0].deficit_hours).toBe(40);
  });

  it("flags a short week as under_hours with the deficit", () => {
    const flags = findDeadTime([placement({ logged_hours: 25 })], 40);
    expect(flags[0].kind).toBe("under_hours");
    expect(flags[0].deficit_hours).toBe(15);
  });

  it("a full or overtime week is not dead time", () => {
    expect(findDeadTime([placement({ logged_hours: 40 })], 40)).toHaveLength(0);
    expect(findDeadTime([placement({ logged_hours: 48 })], 40)).toHaveLength(0);
  });

  it("sorts worst-first", () => {
    const flags = findDeadTime(
      [
        placement({ placement_id: "a", candidate_name: "A", logged_hours: 30 }),
        placement({ placement_id: "b", candidate_name: "B", logged_hours: 0 }),
      ],
      40,
    );
    expect(flags.map((flag) => flag.placement_id)).toEqual(["b", "a"]);
  });

  it("an unmeasurable expectation yields no flags rather than noise", () => {
    expect(findDeadTime([placement({})], 0)).toEqual([]);
    expect(findDeadTime([placement({})], Number.NaN)).toEqual([]);
  });
});

describe("utilizationPct", () => {
  it("logged over expected across the active book", () => {
    const rows = [placement({ logged_hours: 40 }), placement({ placement_id: "p2", logged_hours: 20 })];
    expect(utilizationPct(rows, 40)).toBe(75);
  });

  it("overtime can exceed 100", () => {
    expect(utilizationPct([placement({ logged_hours: 50 })], 40)).toBe(125);
  });

  it("returns null when there is nothing to measure", () => {
    expect(utilizationPct([], 40)).toBeNull();
    expect(utilizationPct([placement({})], 0)).toBeNull();
  });
});
