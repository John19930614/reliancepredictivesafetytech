import { describe, expect, it } from "vitest";
import { lifecycleStages } from "@/lib/company-data";
import {
  buildClientSearchFilter,
  buildDirectoryHref,
  escapeLikePattern,
  hasActiveFilters,
  maxSearchLength,
  resolvePage,
  resolveStageFilter,
  sanitizeSearch,
} from "./directory";

describe("escapeLikePattern", () => {
  it("keeps a plain company name untouched", () => {
    expect(escapeLikePattern("Ironline Construction")).toBe("Ironline Construction");
  });

  it("escapes the LIKE wildcards so they match literally", () => {
    expect(escapeLikePattern("Wilson_Group")).toBe("Wilson\\_Group");
    expect(escapeLikePattern("50%")).toBe("50\\%");
  });
});

describe("buildClientSearchFilter", () => {
  it("searches every column a person would type into the box", () => {
    const filter = buildClientSearchFilter("acme");
    expect(filter).toBe(
      'name.ilike."%acme%",contact_name.ilike."%acme%",email.ilike."%acme%",owner.ilike."%acme%"',
    );
  });

  // The whole reason this function exists: PostgREST reads `or=(...)` as a
  // grammar, so a search term is syntax unless it is quoted and escaped.
  it("does not let a comma split the filter into extra terms", () => {
    const filter = buildClientSearchFilter("Reyes, Ltd.");
    expect(filter).toBe(
      'name.ilike."%Reyes, Ltd.%",contact_name.ilike."%Reyes, Ltd.%",' +
        'email.ilike."%Reyes, Ltd.%",owner.ilike."%Reyes, Ltd.%"',
    );
    // Four terms, not five — the comma stayed inside its quoted value.
    expect(filter.split("ilike").length - 1).toBe(4);
  });

  it("does not let a quote close the value and escape into the grammar", () => {
    const filter = buildClientSearchFilter('a"b');
    expect(filter).toContain('name.ilike."%a\\"b%"');
    expect(filter).not.toContain('"%a"b%"');
  });

  it("does not let a backslash escape the closing quote", () => {
    // A trailing backslash is the classic break-out: `"...\"` would otherwise
    // consume the closing quote and leave the value unterminated.
    const filter = buildClientSearchFilter("a\\");
    expect(filter).toContain('name.ilike."%a\\\\\\\\%"');
  });

  it("leaves a closing paren inert", () => {
    expect(buildClientSearchFilter("a)b")).toContain('name.ilike."%a)b%"');
  });

  it("escapes wildcards before quoting, so a typed % is not match-everything", () => {
    expect(buildClientSearchFilter("50%")).toContain('name.ilike."%50\\\\%%"');
  });
});

describe("sanitizeSearch", () => {
  it("trims surrounding whitespace", () => {
    expect(sanitizeSearch("  acme  ")).toBe("acme");
  });

  it("treats missing and blank input as no search", () => {
    expect(sanitizeSearch(undefined)).toBe("");
    expect(sanitizeSearch("   ")).toBe("");
  });

  it("caps an overlong term rather than sending it to the database", () => {
    expect(sanitizeSearch("x".repeat(500))).toHaveLength(maxSearchLength);
  });
});

describe("resolveStageFilter", () => {
  it("accepts every real lifecycle stage", () => {
    for (const stage of lifecycleStages) {
      expect(resolveStageFilter(stage)).toBe(stage);
    }
  });

  it("rejects anything that is not a stage, so it never reaches the query", () => {
    expect(resolveStageFilter("Signed / Wonk")).toBe("");
    expect(resolveStageFilter("'; drop table company_clients; --")).toBe("");
    expect(resolveStageFilter(undefined)).toBe("");
  });
});

describe("resolvePage", () => {
  it("reads a valid page number", () => {
    expect(resolvePage("3")).toBe(3);
  });

  it("falls back to page 1 for anything unusable", () => {
    expect(resolvePage(undefined)).toBe(1);
    expect(resolvePage("0")).toBe(1);
    expect(resolvePage("-4")).toBe(1);
    expect(resolvePage("banana")).toBe(1);
  });
});

describe("buildDirectoryHref", () => {
  it("returns the bare path when nothing is filtered", () => {
    expect(buildDirectoryHref({})).toBe("/employee/clients");
  });

  it("omits page 1 so the default view has a clean URL", () => {
    expect(buildDirectoryHref({ page: "1" })).toBe("/employee/clients");
    expect(buildDirectoryHref({ page: "2" })).toBe("/employee/clients?page=2");
  });

  it("carries the filters that are set", () => {
    expect(buildDirectoryHref({ q: "acme", stage: "Lead" })).toBe(
      "/employee/clients?q=acme&stage=Lead",
    );
  });
});

describe("hasActiveFilters", () => {
  it("is false on the unfiltered directory", () => {
    expect(hasActiveFilters({ search: "", stage: "", owner: "" })).toBe(false);
  });

  it("is true as soon as any one filter is set", () => {
    expect(hasActiveFilters({ search: "acme", stage: "", owner: "" })).toBe(true);
    expect(hasActiveFilters({ search: "", stage: "Lead", owner: "" })).toBe(true);
    expect(hasActiveFilters({ search: "", stage: "", owner: "Steve" })).toBe(true);
  });
});
