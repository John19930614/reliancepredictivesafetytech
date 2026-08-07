import { describe, expect, it } from "vitest";
import {
  canTransitionLead,
  capLeads,
  isStaleLead,
  leadDedupKey,
  maxLeadCertifications,
  maxSourceUrlLength,
  normalizeSourceUrl,
  sourcingLeadTransitions,
  validateLeadCandidate,
} from "./sourcing-policy";
import {
  maxHourlyRate,
  sourcingLeadStaleDays,
  sourcingLeadStatuses,
  sourcingMaxLeadsPerRun,
  type SourcingLeadStatus,
  type SourcingRunType,
} from "./types";

/** A lead payload that clears every check — each test breaks exactly one field. */
const cleanLead = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  title: "Senior EHS Manager",
  organization: "Northwind Industrial",
  location: "Houston, TX",
  vertical: "Oil & Gas",
  certifications: ["CSP", "OSHA 30"],
  rate_signal: 85,
  source_url: "https://jobs.example.com/postings/1234",
  summary: "Public posting matching two open job orders.",
  ...overrides,
});

/* -------------------------------------------------------------------------- */
/* Lead review graph                                                          */
/* -------------------------------------------------------------------------- */

describe("sourcing lead transitions", () => {
  it("lets a human take a new lead either way", () => {
    expect(canTransitionLead("new", "accepted").ok).toBe(true);
    expect(canTransitionLead("new", "dismissed").ok).toBe(true);
  });

  it("lets a human resurrect a dismissed lead", () => {
    expect(canTransitionLead("dismissed", "new").ok).toBe(true);
  });

  // Accepting is what created the talent_candidates / talent_job_orders row and
  // stamped created_record_id; moving the lead again would leave the queue
  // disagreeing with the record it produced.
  it("treats accepted as terminal", () => {
    expect(sourcingLeadTransitions.accepted).toEqual([]);
    for (const to of sourcingLeadStatuses) {
      const gate = canTransitionLead("accepted", to);
      expect(gate.ok).toBe(false);
      expect(gate.reason).toBeTruthy();
    }
  });

  it("refuses to accept a lead straight out of dismissed", () => {
    const gate = canTransitionLead("dismissed", "accepted");
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBeTruthy();
  });

  it("rejects no-op transitions", () => {
    for (const status of sourcingLeadStatuses) {
      expect(canTransitionLead(status, status).ok).toBe(false);
    }
  });

  it("rejects every edge that is not in the declared graph", () => {
    const illegal: Array<[SourcingLeadStatus, SourcingLeadStatus]> = [];
    for (const from of sourcingLeadStatuses) {
      for (const to of sourcingLeadStatuses) {
        if (from === to) continue;
        if (sourcingLeadTransitions[from].includes(to)) continue;
        illegal.push([from, to]);
      }
    }
    // 3 statuses → 6 ordered pairs, of which 3 are legal edges.
    const legal = sourcingLeadStatuses.reduce(
      (sum, from) => sum + sourcingLeadTransitions[from].length,
      0,
    );
    expect(legal).toBe(3);
    expect(illegal.length).toBe(6 - 3);
    for (const [from, to] of illegal) {
      const gate = canTransitionLead(from, to);
      expect(gate.ok, `${from} → ${to} must be rejected`).toBe(false);
      expect(gate.reason).toBeTruthy();
    }
  });

  it("rejects statuses that are not statuses at all", () => {
    expect(canTransitionLead("promoted" as SourcingLeadStatus, "accepted").ok).toBe(false);
    expect(canTransitionLead("new", "" as SourcingLeadStatus).ok).toBe(false);
    expect(canTransitionLead(null as unknown as SourcingLeadStatus, "new").ok).toBe(false);
    expect(canTransitionLead("new", undefined as unknown as SourcingLeadStatus).ok).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Source URL normalisation                                                   */
/* -------------------------------------------------------------------------- */

describe("normalizeSourceUrl", () => {
  it("keeps a plain https URL, adding only the canonical root path", () => {
    expect(normalizeSourceUrl("https://example.com/jobs/1")).toBe("https://example.com/jobs/1");
    expect(normalizeSourceUrl("https://example.com")).toBe("https://example.com/");
    expect(normalizeSourceUrl("http://example.com/jobs")).toBe("http://example.com/jobs");
  });

  it("trims surrounding whitespace and lowercases the host, not the path", () => {
    expect(normalizeSourceUrl("  https://EXAMPLE.COM/Jobs/Senior-EHS  ")).toBe(
      "https://example.com/Jobs/Senior-EHS",
    );
  });

  it("drops the fragment", () => {
    expect(normalizeSourceUrl("https://example.com/jobs/1#apply-now")).toBe(
      "https://example.com/jobs/1",
    );
  });

  // The one that makes the unique constraint mean anything: a re-run of the same
  // search returns the same page with a fresh campaign tail every time.
  it("strips utm_* parameters and keeps the real ones, in order", () => {
    expect(
      normalizeSourceUrl("https://example.com/jobs?utm_source=serp&id=1234&utm_medium=cpc&page=2"),
    ).toBe("https://example.com/jobs?id=1234&page=2");
  });

  it("strips utm_* regardless of case, and removes the empty query entirely", () => {
    expect(normalizeSourceUrl("https://example.com/jobs?UTM_Source=serp&Utm_Campaign=aug")).toBe(
      "https://example.com/jobs",
    );
  });

  it("keeps a parameter that merely contains utm_ without leading with it", () => {
    expect(normalizeSourceUrl("https://example.com/jobs?x_utm_source=serp")).toBe(
      "https://example.com/jobs?x_utm_source=serp",
    );
  });

  it("is idempotent, so a re-normalised URL keeps the same dedup key", () => {
    const once = normalizeSourceUrl("https://EXAMPLE.com/jobs?utm_source=a&id=9#top");
    expect(once).toBe("https://example.com/jobs?id=9");
    expect(normalizeSourceUrl(once)).toBe(once);
  });

  it("refuses any scheme that is not http or https", () => {
    for (const value of [
      "ftp://example.com/jobs",
      "javascript:alert(1)",
      "data:text/html,<p>hi</p>",
      "mailto:recruiter@example.com",
      "file:///c:/jobs.html",
      "chrome://settings",
    ]) {
      expect(normalizeSourceUrl(value), value).toBeNull();
    }
  });

  it("refuses anything unparseable, missing, or of the wrong type", () => {
    for (const value of [
      "",
      "   ",
      "example.com/jobs",
      "//example.com/jobs",
      "not a url at all",
      "https://",
      null,
      undefined,
      42,
      {},
      [],
    ]) {
      expect(normalizeSourceUrl(value as unknown as string)).toBeNull();
    }
  });

  it("refuses a URL too long for the unique index behind the dedup constraint", () => {
    const long = `https://example.com/${"a".repeat(maxSourceUrlLength)}`;
    expect(long.length).toBeGreaterThan(maxSourceUrlLength);
    expect(normalizeSourceUrl(long)).toBeNull();
    // Just inside the bound still works.
    const ok = `https://example.com/${"a".repeat(maxSourceUrlLength - 21)}`;
    expect(ok.length).toBeLessThanOrEqual(maxSourceUrlLength);
    expect(normalizeSourceUrl(ok)).toBe(ok);
  });
});

/* -------------------------------------------------------------------------- */
/* Dedup key                                                                  */
/* -------------------------------------------------------------------------- */

describe("leadDedupKey", () => {
  it("prefixes the normalised URL with the lead type", () => {
    expect(leadDedupKey("candidates", "https://example.com/p/jane")).toBe(
      "candidates:https://example.com/p/jane",
    );
    expect(leadDedupKey("job_orders", "https://example.com/jobs/1")).toBe(
      "job_orders:https://example.com/jobs/1",
    );
  });

  // Two sweeps, same page, different tracking tail → one key → one queue row.
  it("collapses tracking and casing variants of the same page onto one key", () => {
    const a = leadDedupKey("job_orders", "https://Example.com/jobs/1?utm_source=serp#apply");
    const b = leadDedupKey("job_orders", "  https://example.com/jobs/1  ");
    expect(a).toBe("job_orders:https://example.com/jobs/1");
    expect(a).toBe(b);
  });

  it("keeps the two lead types apart on the same URL", () => {
    const url = "https://example.com/team";
    expect(leadDedupKey("candidates", url)).not.toBe(leadDedupKey("job_orders", url));
  });

  it("returns null when either half is unusable", () => {
    expect(leadDedupKey("candidates", "ftp://example.com/x")).toBeNull();
    expect(leadDedupKey("candidates", "")).toBeNull();
    expect(leadDedupKey("candidates", null)).toBeNull();
    expect(leadDedupKey("people" as SourcingRunType, "https://example.com/x")).toBeNull();
    expect(leadDedupKey(null as unknown as SourcingRunType, "https://example.com/x")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* AI lead validation                                                         */
/* -------------------------------------------------------------------------- */

describe("validateLeadCandidate", () => {
  it("accepts a well-formed lead and returns the row-shaped value", () => {
    const result = validateLeadCandidate(cleanLead());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead).toEqual({
      title: "Senior EHS Manager",
      organization: "Northwind Industrial",
      location: "Houston, TX",
      vertical: "Oil & Gas",
      certifications: ["CSP", "OSHA 30"],
      rate_signal: 85,
      source_url: "https://jobs.example.com/postings/1234",
      summary: "Public posting matching two open job orders.",
    });
  });

  it("fills the optional fields with null when the model omits them", () => {
    const result = validateLeadCandidate({
      title: "  EHS Coordinator  ",
      source_url: "https://example.com/jobs/7",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead).toEqual({
      title: "EHS Coordinator",
      organization: null,
      location: null,
      vertical: null,
      certifications: [],
      rate_signal: null,
      source_url: "https://example.com/jobs/7",
      summary: null,
    });
  });

  it("treats blank and null optional text as absent", () => {
    const result = validateLeadCandidate(
      cleanLead({ organization: "   ", location: null, vertical: "", summary: null }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead.organization).toBeNull();
    expect(result.lead.location).toBeNull();
    expect(result.lead.vertical).toBeNull();
    expect(result.lead.summary).toBeNull();
  });

  // The stored URL has to be the normalised one, or the app's dedup set and the
  // database's unique constraint disagree about what a duplicate is.
  it("stores the normalised source URL, not what the model emitted", () => {
    const result = validateLeadCandidate(
      cleanLead({ source_url: " https://JOBS.example.com/postings/1234?utm_source=serp#apply " }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead.source_url).toBe("https://jobs.example.com/postings/1234");
  });

  it("trims and de-blanks certifications", () => {
    const result = validateLeadCandidate(
      cleanLead({ certifications: ["  CSP  ", "", "   ", "CHST"] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead.certifications).toEqual(["CSP", "CHST"]);
  });

  it("rounds a rate signal to the stored numeric(10,2) and accepts the ceiling", () => {
    const rounded = validateLeadCandidate(cleanLead({ rate_signal: 85.555 }));
    expect(rounded.ok).toBe(true);
    if (rounded.ok) expect(rounded.lead.rate_signal).toBe(85.56);

    const ceiling = validateLeadCandidate(cleanLead({ rate_signal: maxHourlyRate }));
    expect(ceiling.ok).toBe(true);
    if (ceiling.ok) expect(ceiling.lead.rate_signal).toBe(500);
  });

  it("rejects anything that is not a lead object at all", () => {
    for (const value of [null, undefined, "a lead", 42, true, [], [cleanLead()]]) {
      const result = validateLeadCandidate(value);
      expect(result.ok, JSON.stringify(value)).toBe(false);
      if (!result.ok) expect(result.reason).toBeTruthy();
    }
  });

  it("rejects a missing, blank, non-string or oversized title", () => {
    for (const title of [undefined, null, "", "     ", 42, {}, ["x"], "x".repeat(201)]) {
      const result = validateLeadCandidate(cleanLead({ title }));
      expect(result.ok, String(title)).toBe(false);
    }
    expect(validateLeadCandidate(cleanLead({ title: "x".repeat(200) })).ok).toBe(true);
  });

  it("rejects a lead with no usable public source URL", () => {
    for (const source_url of [
      undefined,
      null,
      "",
      "example.com/jobs",
      "javascript:alert(1)",
      "mailto:recruiter@example.com",
      42,
      {},
    ]) {
      const result = validateLeadCandidate(cleanLead({ source_url }));
      expect(result.ok, String(source_url)).toBe(false);
    }
  });

  it("rejects a malformed or oversized certifications list", () => {
    for (const certifications of [
      "CSP, OSHA 30",
      42,
      { 0: "CSP" },
      ["CSP", 42],
      ["CSP", null],
      ["x".repeat(81)],
      Array.from({ length: maxLeadCertifications + 1 }, (_, i) => `CERT ${i}`),
    ]) {
      const result = validateLeadCandidate(cleanLead({ certifications }));
      expect(result.ok, JSON.stringify(certifications)).toBe(false);
    }
    // Exactly at the limits is fine.
    expect(
      validateLeadCandidate(
        cleanLead({
          certifications: Array.from({ length: maxLeadCertifications }, (_, i) => `CERT ${i}`),
        }),
      ).ok,
    ).toBe(true);
    expect(validateLeadCandidate(cleanLead({ certifications: ["x".repeat(80)] })).ok).toBe(true);
  });

  // A quoted number is a malformed model response; coercing it would hide that
  // while putting a figure the model never committed to in front of a reviewer.
  it("rejects a rate signal that is not a number, or is outside the money bounds", () => {
    for (const rate_signal of ["85", "", 0, -1, -0.01, 500.01, 1000, NaN, Infinity, -Infinity, {}, []]) {
      const result = validateLeadCandidate(cleanLead({ rate_signal }));
      expect(result.ok, String(rate_signal)).toBe(false);
    }
    // Absent is fine — most public postings do not publish a rate.
    expect(validateLeadCandidate(cleanLead({ rate_signal: null })).ok).toBe(true);
    expect(validateLeadCandidate(cleanLead({ rate_signal: undefined })).ok).toBe(true);
  });

  it("rejects oversized or wrongly-typed free text rather than truncating it", () => {
    expect(validateLeadCandidate(cleanLead({ organization: "x".repeat(161) })).ok).toBe(false);
    expect(validateLeadCandidate(cleanLead({ location: "x".repeat(161) })).ok).toBe(false);
    expect(validateLeadCandidate(cleanLead({ vertical: "x".repeat(161) })).ok).toBe(false);
    expect(validateLeadCandidate(cleanLead({ summary: "x".repeat(501) })).ok).toBe(false);
    expect(validateLeadCandidate(cleanLead({ organization: 42 })).ok).toBe(false);
    expect(validateLeadCandidate(cleanLead({ summary: { text: "hi" } })).ok).toBe(false);
    // Exactly at the limits is fine.
    expect(validateLeadCandidate(cleanLead({ organization: "x".repeat(160) })).ok).toBe(true);
    expect(validateLeadCandidate(cleanLead({ summary: "x".repeat(500) })).ok).toBe(true);
  });

  // The whole-payload version of the above: a scraped page dumped into every
  // field must not reach the queue.
  it("rejects a garbage AI payload wholesale", () => {
    const garbage = {
      title: "x".repeat(5000),
      organization: "x".repeat(5000),
      location: { nested: true },
      vertical: 42,
      certifications: Array.from({ length: 400 }, () => "CSP"),
      rate_signal: "a lot",
      source_url: "javascript:void(0)",
      summary: "x".repeat(50000),
      extra_field_the_model_invented: "ignored",
    };
    const result = validateLeadCandidate(garbage);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBeTruthy();
  });

  it("ignores fields the orchestrator owns, even if the model tries to set them", () => {
    const result = validateLeadCandidate(
      cleanLead({
        id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        status: "accepted",
        reviewed_by: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        created_record_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        lead_type: "candidates",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.lead).sort()).toEqual(
      [
        "certifications",
        "location",
        "organization",
        "rate_signal",
        "source_url",
        "summary",
        "title",
        "vertical",
      ].sort(),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Run limits                                                                 */
/* -------------------------------------------------------------------------- */

describe("capLeads", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("caps at sourcingMaxLeadsPerRun by default", () => {
    expect(sourcingMaxLeadsPerRun).toBe(25);
    expect(capLeads(many(400))).toHaveLength(25);
    expect(capLeads(many(400))[24]).toBe(24);
  });

  it("leaves a run under the cap untouched", () => {
    expect(capLeads(many(4))).toEqual([0, 1, 2, 3]);
    expect(capLeads([])).toEqual([]);
  });

  it("honours an explicit cap, including zero", () => {
    expect(capLeads(many(10), 3)).toEqual([0, 1, 2]);
    expect(capLeads(many(10), 0)).toEqual([]);
    expect(capLeads(many(10), 2.9)).toEqual([0, 1]);
  });

  it("falls back rather than throwing on an unusable cap or a non-array", () => {
    expect(capLeads(many(40), -5)).toEqual([]);
    expect(capLeads(many(40), NaN)).toHaveLength(25);
    expect(capLeads(many(40), Infinity)).toHaveLength(25);
    expect(capLeads(many(40), "10" as unknown as number)).toHaveLength(25);
    expect(capLeads(null as unknown as number[])).toEqual([]);
    expect(capLeads("nope" as unknown as number[])).toEqual([]);
  });
});

describe("isStaleLead", () => {
  const now = new Date("2026-08-07T00:00:00.000Z");

  it("flags a lead older than the staleness window", () => {
    expect(sourcingLeadStaleDays).toBe(14);
    expect(isStaleLead("2026-07-01T00:00:00.000Z", now)).toBe(true);
    expect(isStaleLead("2026-07-24T00:00:00.000Z", now)).toBe(true); // day 14, the boundary
    expect(isStaleLead("2026-07-24", now)).toBe(true); // bare date reads as UTC midnight
  });

  it("stays quiet inside the window, and for a lead from the future", () => {
    expect(isStaleLead("2026-07-25T00:00:00.000Z", now)).toBe(false); // day 13
    expect(isStaleLead("2026-08-07T00:00:00.000Z", now)).toBe(false);
    expect(isStaleLead("2026-09-01T00:00:00.000Z", now)).toBe(false);
  });

  it("honours a custom window", () => {
    expect(isStaleLead("2026-08-01T00:00:00.000Z", now, 3)).toBe(true);
    expect(isStaleLead("2026-08-01T00:00:00.000Z", now, 30)).toBe(false);
    expect(isStaleLead("2026-08-01T00:00:00.000Z", now, NaN)).toBe(false); // falls back to 14
  });

  it("stays quiet for a missing or unparseable timestamp rather than crying wolf", () => {
    for (const value of [null, undefined, "", "   ", "not-a-date", 42, {}, []]) {
      expect(isStaleLead(value as unknown as string, now)).toBe(false);
    }
    expect(isStaleLead("2026-07-01T00:00:00.000Z", "nope" as unknown as Date)).toBe(false);
  });
});
