import { describe, expect, it } from "vitest";
import {
  billableQty,
  coerceDeliveryMode,
  coerceQtyBasis,
  coerceQtyTiers,
  deliveryModeLabel,
  deliveryModeLabels,
  formatQtyLabel,
  isQtyBasis,
  priceQty,
  qtyBases,
  qtyFieldLabel,
  rateForQty,
  resolveQtyBasis,
  unitToQtyBasis,
} from "./qty-basis";
import { serviceOptions } from "./catalog";

describe("the enum", () => {
  it("is exactly the four bases and nothing else", () => {
    expect([...qtyBases]).toEqual(["session", "attendee", "hour", "flat"]);
  });

  it("accepts its own members and rejects anything else", () => {
    for (const basis of qtyBases) expect(isQtyBasis(basis)).toBe(true);
    expect(isQtyBasis("per_head")).toBe(false);
    expect(isQtyBasis("Session")).toBe(false); // exact match; coerce() does the casing
    expect(isQtyBasis(null)).toBe(false);
    expect(isQtyBasis(0)).toBe(false);
  });
});

describe("coerceQtyBasis", () => {
  it("takes a stored value, trimmed and case-folded", () => {
    expect(coerceQtyBasis("attendee")).toBe("attendee");
    expect(coerceQtyBasis(" Session ")).toBe("session");
    expect(coerceQtyBasis("FLAT")).toBe("flat");
  });

  it("degrades every hostile or unknown shape to null, never throwing", () => {
    // Null is the LEGACY basis — linear qty × price. Falling back to anything
    // else, `flat` above all, would drop a multiplier off a signed total.
    for (const hostile of [
      undefined,
      null,
      "",
      "   ",
      "per head",
      "flat; DROP TABLE",
      "__proto__",
      "constructor",
      "toString",
      0,
      1,
      true,
      {},
      [],
      ["flat"],
      { toString: () => "flat" },
      Number.NaN,
    ]) {
      expect(coerceQtyBasis(hostile)).toBeNull();
    }
  });
});

describe("unitToQtyBasis — the catalog's own vocabulary", () => {
  it("maps the three units the catalog already uses", () => {
    expect(unitToQtyBasis("Session")).toBe("session");
    expect(unitToQtyBasis("Person")).toBe("attendee");
    expect(unitToQtyBasis("Hour")).toBe("hour");
  });

  it("tolerates plurals, casing and the obvious synonyms", () => {
    expect(unitToQtyBasis("sessions")).toBe("session");
    expect(unitToQtyBasis(" ATTENDEES ")).toBe("attendee");
    expect(unitToQtyBasis("Participant")).toBe("attendee");
    expect(unitToQtyBasis("hrs")).toBe("hour");
  });

  it("leaves every other billing unit without a basis", () => {
    // These are real units that must keep printing themselves and keep
    // multiplying. Mapping any of them to a basis — flat most of all — would
    // reprice proposals that quoted two audit days or 120 miles.
    for (const unit of ["Day", "Mile", "Night", "Project", "Document", "Audit", "Year", "Block", "Site", "Package", "User", "Unit", "", "  "]) {
      expect(unitToQtyBasis(unit), unit).toBeNull();
    }
    expect(unitToQtyBasis(null)).toBeNull();
    expect(unitToQtyBasis({})).toBeNull();
  });

  it("never derives `flat` from a unit the catalog ships", () => {
    // The load-bearing invariant behind backward compatibility: a stored row
    // with no basis can never stop multiplying.
    for (const [key, option] of Object.entries(serviceOptions)) {
      expect(unitToQtyBasis(option.unit), `serviceOptions.${key}.unit`).not.toBe("flat");
    }
  });
});

describe("resolveQtyBasis — the basis travels with the price", () => {
  it("prefers the row's stored basis over its unit", () => {
    // A course repriced in the catalog from per-session to per-attendee must
    // not re-base a document already sent.
    expect(resolveQtyBasis("session", "Person")).toBe("session");
  });

  it("falls back to the unit when the row stored no basis", () => {
    expect(resolveQtyBasis(undefined, "Person")).toBe("attendee");
  });

  it("falls back to no basis when neither says anything usable", () => {
    expect(resolveQtyBasis(undefined, "Day")).toBeNull();
    expect(resolveQtyBasis("per_head", "Mile")).toBeNull();
  });
});

describe("billableQty", () => {
  it("bills the stored quantity on every linear basis", () => {
    expect(billableQty("session", 3)).toBe(3);
    expect(billableQty("attendee", 10)).toBe(10);
    expect(billableQty("hour", 0.25)).toBe(0.25);
    expect(billableQty(null, 7)).toBe(7);
  });

  it("bills exactly one on a flat line, at any quantity including zero", () => {
    for (const qty of [0, 1, 3, 999, -5, "12", null, undefined, Number.NaN]) {
      expect(billableQty("flat", qty)).toBe(1);
    }
  });

  it("floors a negative or unparseable quantity at zero", () => {
    expect(billableQty("attendee", -10)).toBe(0);
    expect(billableQty("attendee", Number.NaN)).toBe(0);
    expect(billableQty("attendee", "ten")).toBe(0);
  });
});

describe("rateForQty — the volume ladder", () => {
  const ladder = coerceQtyTiers([
    { min_qty: 20, price: 95 },
    { min_qty: 50, price: 85 },
  ]);

  it("uses the row's own price below the first threshold", () => {
    expect(rateForQty(105, 1, ladder)).toBe(105);
    expect(rateForQty(105, 19, ladder)).toBe(105);
  });

  it("steps at the threshold and stays stepped above it", () => {
    expect(rateForQty(105, 20, ladder)).toBe(95);
    expect(rateForQty(105, 49, ladder)).toBe(95);
    expect(rateForQty(105, 50, ladder)).toBe(85);
    expect(rateForQty(105, 5000, ladder)).toBe(85);
  });

  it("is the row's flat price when there is no ladder — the default", () => {
    expect(rateForQty(105, 500, [])).toBe(105);
  });
});

describe("coerceQtyTiers", () => {
  it("normalizes, clamps and sorts a stored ladder", () => {
    expect(
      coerceQtyTiers([
        { min_qty: 50, price: 85 },
        { min_qty: 20, price: 95 },
        { min_qty: -5, price: -10 },
      ]),
    ).toEqual([
      { min_qty: 0, price: 0 },
      { min_qty: 20, price: 95 },
      { min_qty: 50, price: 85 },
    ]);
  });

  it("resolves a duplicated threshold downwards", () => {
    // Duplicates are malformed. Resolving down means a hand-crafted payload
    // cannot inflate a total by appending a dearer tier at a live threshold.
    expect(
      coerceQtyTiers([
        { min_qty: 20, price: 95 },
        { min_qty: 20, price: 250 },
      ]),
    ).toEqual([{ min_qty: 20, price: 95 }]);
  });

  it("drops every malformed entry rather than trusting it", () => {
    expect(
      coerceQtyTiers([
        { min_qty: "20", price: 95 },
        { min_qty: 20, price: "95" },
        { min_qty: Number.NaN, price: 95 },
        { min_qty: 20, price: Number.POSITIVE_INFINITY },
        { price: 95 },
        { min_qty: 20 },
        null,
        "20:95",
        [20, 95],
      ]),
    ).toEqual([]);
  });

  it("treats an absent or non-array ladder as no ladder at all", () => {
    // Which is what every row saved to date has.
    expect(coerceQtyTiers(undefined)).toEqual([]);
    expect(coerceQtyTiers(null)).toEqual([]);
    expect(coerceQtyTiers({ "20": 95 })).toEqual([]);
    expect(coerceQtyTiers("[]")).toEqual([]);
  });
});

describe("priceQty — the arithmetic", () => {
  it("bills three booked sessions and then two when one cancels", () => {
    expect(priceQty("session", 3, 1000).amount).toBe(3000);
    expect(priceQty("session", 2, 1000).amount).toBe(2000);
  });

  it("bills ten attendees at the per-head rate", () => {
    expect(priceQty("attendee", 10, 105)).toMatchObject({ qty: 10, rate: 105, amount: 1050 });
  });

  it("does not scale a flat line by its quantity", () => {
    for (const qty of [0, 1, 2, 40]) {
      expect(priceQty("flat", qty, 1000)).toMatchObject({ qty: 1, rate: 1000, amount: 1000 });
    }
  });

  it("ignores a tier ladder on a flat line, which has no quantity to tier on", () => {
    const tiers = coerceQtyTiers([{ min_qty: 1, price: 1 }]);
    expect(priceQty("flat", 40, 1000, tiers).amount).toBe(1000);
  });

  it("prices a legacy row with no basis exactly as multiplication always did", () => {
    expect(priceQty(null, 3, 1150).amount).toBe(3450);
    expect(priceQty(null, 0.5, 1250).amount).toBe(625);
  });

  it("floors a hostile price and quantity at zero instead of going negative", () => {
    expect(priceQty("attendee", -10, 105).amount).toBe(0);
    expect(priceQty("attendee", 10, -105).amount).toBe(0);
    expect(priceQty("attendee", Number.NaN, Number.NaN).amount).toBe(0);
    expect(priceQty("attendee", 10, "105").amount).toBe(0);
  });
});

describe("formatQtyLabel", () => {
  it("names the thing it counted, singular and plural", () => {
    expect(formatQtyLabel("session", 1)).toBe("1 session");
    expect(formatQtyLabel("session", 2)).toBe("2 sessions");
    expect(formatQtyLabel("attendee", 10)).toBe("10 attendees");
    expect(formatQtyLabel("hour", 1)).toBe("1 hour");
    expect(formatQtyLabel("hour", 2.5)).toBe("2.5 hours");
  });

  it("prints no quantity at all for a flat fee", () => {
    expect(formatQtyLabel("flat", 1)).toBe("Flat fee");
    expect(formatQtyLabel("flat", 12)).toBe("Flat fee");
  });

  it("prints a basis-less row character-for-character as the document always has", () => {
    // `unit ? qty + " " + unit : String(qty)` — the exact composition in
    // components/proposals/proposal-document-model.ts's toFeeRow().
    expect(formatQtyLabel(null, 3, "Day")).toBe("3 Day");
    expect(formatQtyLabel(null, 120, "Mile")).toBe("120 Mile");
    expect(formatQtyLabel(null, 1, "")).toBe("1");
  });
});

describe("qtyFieldLabel — the editor's Qty caption", () => {
  it("says what to type", () => {
    expect(qtyFieldLabel("session")).toBe("Sessions");
    expect(qtyFieldLabel("attendee")).toBe("Attendees");
    expect(qtyFieldLabel("hour")).toBe("Hours");
    expect(qtyFieldLabel("flat")).toBe("Flat fee — qty not billed");
  });

  it("falls back to the row's unit, then to a generic", () => {
    expect(qtyFieldLabel(null, "Mile")).toBe("Mile");
    expect(qtyFieldLabel(null, "")).toBe("Unit");
  });
});

describe("delivery mode", () => {
  it("carries the two client-facing labels", () => {
    expect(deliveryModeLabels.in_person).toBe("Instructor-led course — in person");
    expect(deliveryModeLabels.virtual).toBe("Instructor-led course — virtual");
  });

  it("coerces the stored forms a browser or an older build might write", () => {
    expect(coerceDeliveryMode("in_person")).toBe("in_person");
    expect(coerceDeliveryMode("in person")).toBe("in_person");
    expect(coerceDeliveryMode("In-Person")).toBe("in_person");
    expect(coerceDeliveryMode(" VIRTUAL ")).toBe("virtual");
  });

  it("degrades anything else to unstated rather than printing it", () => {
    // The label is printed on a client document, so an unknown value must
    // never reach the page as itself.
    for (const hostile of [undefined, null, "", "hybrid", "<script>", {}, [], 1, true]) {
      expect(coerceDeliveryMode(hostile)).toBeNull();
    }
    expect(deliveryModeLabel(null)).toBe("");
  });
});
