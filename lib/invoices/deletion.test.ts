// The one rule this module exists to keep: an invoice may be deleted only if it
// was NEVER ISSUED. Everything else is voided, and a paid invoice is neither.
//
// The matrix below is walked exhaustively — every status crossed with issued /
// never issued, crossed with the creator / an admin / another employee — because
// the failure this guards against is not a wrong answer in an exotic case. It is
// a single status quietly gaining a delete path and taking a numbered document
// out of a client's history with it.
//
// The wording is asserted too, and not as decoration. A refusal that does not
// name the invoice is unusable in a ledger of forty rows, and a refusal that
// does not name void leaves the operator with no supported next move — which is
// how someone ends up editing an exported PDF instead.

import { describe, expect, it } from "vitest";
import { canDeleteInvoice, type DeletableInvoice, type DeletionActor } from "./deletion";

const CREATOR = "creator-user-id";
const OTHER = "other-user-id";
const ADMIN = "admin-user-id";

const NUMBER = "WONDFOUSA-2026-INV-07";
const ISSUED_AT = "2026-08-14T16:20:00.000Z";

/** Every status the table's CHECK allows, plus one it does not. */
const statuses = ["draft", "issued", "paid", "void"] as const;

function invoice(over: Partial<DeletableInvoice> = {}): DeletableInvoice {
  return { invoiceNumber: NUMBER, status: "draft", issuedAt: null, createdBy: CREATOR, ...over };
}

const creator: DeletionActor = { userId: CREATOR, isAdmin: false };
const otherEmployee: DeletionActor = { userId: OTHER, isAdmin: false };
const admin: DeletionActor = { userId: ADMIN, isAdmin: true };
/** An admin who also happens to be the person who raised it. */
const adminCreator: DeletionActor = { userId: CREATOR, isAdmin: true };

const actors: Array<[string, DeletionActor]> = [
  ["the creator", creator],
  ["another employee", otherEmployee],
  ["an admin", admin],
  ["an admin who raised it", adminCreator],
];

/**
 * The whole truth table, written out rather than derived, so a change to the
 * rule has to be made twice — here and in the module — before it can pass.
 */
const expected: Record<string, Record<string, Record<string, boolean>>> = {
  draft: {
    unissued: { "the creator": true, "another employee": false, "an admin": true, "an admin who raised it": true },
    issued: { "the creator": false, "another employee": false, "an admin": false, "an admin who raised it": false },
  },
  issued: {
    unissued: { "the creator": false, "another employee": false, "an admin": false, "an admin who raised it": false },
    issued: { "the creator": false, "another employee": false, "an admin": false, "an admin who raised it": false },
  },
  paid: {
    unissued: { "the creator": false, "another employee": false, "an admin": false, "an admin who raised it": false },
    issued: { "the creator": false, "another employee": false, "an admin": false, "an admin who raised it": false },
  },
  void: {
    unissued: { "the creator": false, "another employee": false, "an admin": true, "an admin who raised it": true },
    issued: { "the creator": false, "another employee": false, "an admin": false, "an admin who raised it": false },
  },
};

describe("canDeleteInvoice — the full matrix", () => {
  for (const status of statuses) {
    for (const [issuance, issuedAt] of [
      ["unissued", null],
      ["issued", ISSUED_AT],
    ] as const) {
      for (const [who, actor] of actors) {
        const want = expected[status][issuance][who];

        it(`${want ? "allows" : "refuses"} ${who} to delete an ${issuance} ${status} invoice`, () => {
          const result = canDeleteInvoice(invoice({ status, issuedAt }), actor);
          expect(result.ok).toBe(want);
          if (!result.ok) {
            // A refusal always carries a sentence, and the sentence always
            // carries the number. A bare "no" is not an answer, and an
            // anonymous "no" is not one either.
            expect(result.reason.length).toBeGreaterThan(20);
            expect(result.reason).toContain(NUMBER);
          }
        });
      }
    }
  }
});

describe("canDeleteInvoice — never-issued drafts", () => {
  it("lets the employee who raised a draft delete it", () => {
    expect(canDeleteInvoice(invoice(), creator)).toEqual({ ok: true });
  });

  it("lets a portal admin delete anyone's draft", () => {
    expect(canDeleteInvoice(invoice({ createdBy: OTHER }), admin)).toEqual({ ok: true });
  });

  it("names the invoice, the creator and the admin when someone else asks", () => {
    const result = canDeleteInvoice(invoice(), otherEmployee);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe(
      `Only the employee who raised draft ${NUMBER}, or a portal admin, can delete it. ` +
        `Ask an admin, or void it to take it off the ledger.`,
    );
  });

  // created_by is nullable — the FK is `on delete set null`, so a draft raised
  // by someone whose auth user has since been removed has no owner at all.
  // Nobody "is" null, so that draft is an admin's problem and not a hole.
  it("does not let a null createdBy match anyone", () => {
    const orphan = invoice({ createdBy: null });
    expect(canDeleteInvoice(orphan, creator).ok).toBe(false);
    expect(canDeleteInvoice(orphan, { userId: "", isAdmin: false }).ok).toBe(false);
    expect(canDeleteInvoice(orphan, admin)).toEqual({ ok: true });
  });

  // The same hole from the other side: an actor with no id must not inherit a
  // row whose creator column happens to be blank rather than null.
  it("does not let an empty userId match an empty createdBy", () => {
    expect(canDeleteInvoice(invoice({ createdBy: "" }), { userId: "", isAdmin: false }).ok).toBe(false);
  });
});

describe("canDeleteInvoice — anything ever issued", () => {
  it("refuses an issued invoice with the exact wording that names void", () => {
    const result = canDeleteInvoice(invoice({ status: "issued", issuedAt: ISSUED_AT }), admin);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe(
      `${NUMBER} has been issued, so a client holds a document bearing that number. ` +
        `Void it instead: that withdraws the claim, keeps the number spent, and records why.`,
    );
  });

  // The case the whole `issuedAt` test exists for: status says void, but the
  // client was asked for money first, so the row is evidence rather than junk.
  it("refuses a VOID invoice that had already been issued, and says it must be kept", () => {
    const result = canDeleteInvoice(invoice({ status: "void", issuedAt: ISSUED_AT }), admin);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toContain(NUMBER);
    expect(result.reason).toMatch(/has to be kept/i);
    // Already void: telling anyone to void it again would be nonsense.
    expect(result.reason).not.toMatch(/void it instead/i);
  });

  // A draft that carries an issuedAt contradicts itself; the timestamp wins,
  // because it is the one that says a client may be holding the document.
  it("refuses a draft that somehow carries an issuedAt, even for its creator", () => {
    const result = canDeleteInvoice(invoice({ status: "draft", issuedAt: ISSUED_AT }), creator);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toMatch(/void it instead/i);
    expect(canDeleteInvoice(invoice({ status: "draft", issuedAt: ISSUED_AT }), admin).ok).toBe(false);
  });

  // And the reverse contradiction: status issued, no stamp. Unprovable, so no.
  it("refuses an issued-status invoice with no timestamp and says so plainly", () => {
    const result = canDeleteInvoice(invoice({ status: "issued", issuedAt: null }), admin);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toMatch(/no issued-at timestamp/i);
    expect(result.reason).toMatch(/void it instead/i);
  });

  it("treats a blank issuedAt as never issued rather than as issued", () => {
    // An empty string is not a moment. Reading it as "issued" would strand
    // genuine drafts on the ledger forever, so this pins the direction.
    expect(canDeleteInvoice(invoice({ issuedAt: "   " }), creator)).toEqual({ ok: true });
    expect(canDeleteInvoice(invoice({ issuedAt: "" }), creator)).toEqual({ ok: true });
  });
});

describe("canDeleteInvoice — paid", () => {
  it("refuses a paid invoice to an admin, and does not offer void either", () => {
    const result = canDeleteInvoice(invoice({ status: "paid", issuedAt: ISSUED_AT }), admin);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe(
      `${NUMBER} has been paid, and a paid invoice is the record of money that arrived. It cannot be deleted or voided.`,
    );
  });

  it("refuses a paid invoice even with no issuedAt on the row", () => {
    const result = canDeleteInvoice(invoice({ status: "paid", issuedAt: null }), admin);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toMatch(/has been paid/i);
  });
});

describe("canDeleteInvoice — never-issued voids are admin-only", () => {
  it("lets an admin clear an abandoned void", () => {
    expect(canDeleteInvoice(invoice({ status: "void", issuedAt: null }), admin)).toEqual({ ok: true });
  });

  it("refuses it to the employee who raised it, and says an admin can", () => {
    const result = canDeleteInvoice(invoice({ status: "void", issuedAt: null }), creator);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe(`${NUMBER} was voided before it was ever issued, so only a portal admin can delete it.`);
  });
});

describe("canDeleteInvoice — an unrecognised status", () => {
  it("refuses it and names the only deletable shape", () => {
    const result = canDeleteInvoice(invoice({ status: "written_off" }), admin);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toContain(NUMBER);
    expect(result.reason).toMatch(/written_off/);
    expect(result.reason).toMatch(/never issued/i);
    expect(result.reason).toMatch(/void it instead/i);
  });
});

describe("canDeleteInvoice — a row with no number yet", () => {
  // invoice_number is set by a BEFORE INSERT trigger, so every persisted row has
  // one; a blank arrives only from a caller that forgot to select the column.
  // The refusal still has to read as a sentence rather than as "  has been…".
  it("falls back to a phrase rather than printing an empty name", () => {
    const result = canDeleteInvoice(invoice({ invoiceNumber: "  ", status: "issued", issuedAt: ISSUED_AT }), admin);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toMatch(/^This invoice has been issued/);
  });
});
