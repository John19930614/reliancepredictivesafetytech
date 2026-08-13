// Invariants of the document stylesheet that a rendering test cannot see.
//
// THE BUG THIS EXISTS FOR: the fee table's Total row printed white text on a
// near-white band, making the single most important number in the document
// invisible. Nothing was wrong with the markup or the model — two CSS rules
// disagreed and the wrong one won:
//
//   .rp-doc-fee tfoot td   (0,1,2)  background: var(--rp-doc-band-2)
//   .rp-doc-fee-total td   (0,1,1)  background: var(--rp-doc-navy); color: #fff
//
// Specificity beats source order, so the pale tfoot background won while the
// total rule still won the color — because the tfoot rule declares no color.
// White on #eef3f8.
//
// jsdom does not compute the cascade across a real stylesheet, and the vitest
// DOM project renders components rather than loading this file, so neither the
// component suites nor proposal-surfaces.test.ts can catch it. This suite reads
// the stylesheet as text and checks the two properties that would have.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./proposal-document.css", import.meta.url), "utf8");

/** One `selector { body }` rule. Nested at-rules are flattened away first. */
interface Rule {
  selector: string;
  body: string;
}

/**
 * Every rule in the sheet, including those inside @media blocks.
 *
 * Deliberately crude — it strips comments, then strips at-rule wrappers by
 * removing the `@... {` lines and their matching close. Good enough to read
 * declarations out of a stylesheet we control, and it fails loudly (zero rules)
 * rather than silently if the file's shape changes.
 */
function parseRules(source: string): Rule[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(withoutComments)) !== null) {
    const selector = match[1].trim().replace(/\s+/g, " ");
    // Skip at-rule preludes (`@media print`, `@page`) — they carry no
    // declarations of their own, and their inner rules are matched separately
    // because this regex is non-nesting.
    if (selector.startsWith("@")) continue;
    rules.push({ selector, body: match[2] });
  }
  return rules;
}

/** [ids, classes, elements] for ONE compound selector (no commas). */
function specificity(selector: string): [number, number, number] {
  const cleaned = selector.replace(/::?[a-z-]+(\([^)]*\))?/g, " ");
  const ids = (cleaned.match(/#[\w-]+/g) ?? []).length;
  const classes = (cleaned.match(/\.[\w-]+/g) ?? []).length + (cleaned.match(/\[[^\]]+\]/g) ?? []).length;
  const elements = (cleaned.match(/(^|[\s>+~])([a-z][\w-]*)/gi) ?? []).length;
  return [ids, classes, elements];
}

function compare(a: [number, number, number], b: [number, number, number]): number {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

const rules = parseRules(css);

describe("the stylesheet parses", () => {
  it("finds rules at all, so the assertions below are not vacuous", () => {
    expect(rules.length).toBeGreaterThan(50);
    expect(rules.some((rule) => rule.selector.includes(".rp-doc-fee"))).toBe(true);
  });

  it("computes specificity the way the cascade does", () => {
    expect(specificity(".rp-doc-fee tfoot td")).toEqual([0, 1, 2]);
    expect(specificity(".rp-doc-fee-total td")).toEqual([0, 1, 1]);
    expect(specificity(".rp-doc-fee tfoot tr.rp-doc-fee-total td")).toEqual([0, 2, 3]);
    // The comparison, not just the numbers: (0,1,2) really does beat (0,1,1).
    expect(compare(specificity(".rp-doc-fee tfoot td"), specificity(".rp-doc-fee-total td"))).toBeGreaterThan(0);
  });
});

describe("light text always carries its own background", () => {
  // The class of bug, stated as a rule: any declaration block that sets text to
  // the light panel colour must set a background in the SAME block. A block
  // that sets only the colour is relying on a background declared elsewhere,
  // which is precisely what lost the specificity fight.
  it("never sets the panel colour without a background beside it", () => {
    const offenders = rules
      .filter((rule) => /(^|[\s;])color:\s*var\(--rp-doc-panel\)/.test(rule.body))
      .filter((rule) => !/(^|[\s;])background(-color)?:/.test(rule.body))
      .map((rule) => rule.selector);

    expect(offenders).toEqual([]);
  });
});

describe("the fee table's emphasised rows win their background", () => {
  const tfootRules = rules.filter(
    (rule) => /\.rp-doc-fee tfoot td\b/.test(rule.selector) && /background(-color)?:/.test(rule.body),
  );

  it("has a tfoot rule that sets a background, so this is a real contest", () => {
    expect(tfootRules.length).toBeGreaterThan(0);
  });

  for (const row of ["rp-doc-fee-total", "rp-doc-fee-deposit"]) {
    it(`.${row} outranks every tfoot background rule`, () => {
      const rowRules = rules.filter(
        (rule) => rule.selector.includes(row) && /background(-color)?:/.test(rule.body),
      );
      expect(rowRules.length, `no background rule found for .${row}`).toBeGreaterThan(0);

      for (const rowRule of rowRules) {
        for (const tfootRule of tfootRules) {
          expect(
            compare(specificity(rowRule.selector), specificity(tfootRule.selector)),
            `"${rowRule.selector}" must outrank "${tfootRule.selector}" or its background is discarded`,
          ).toBeGreaterThan(0);
        }
      }
    });
  }
});

describe("print never relies on a fill that may not paint", () => {
  // print-color-adjust is a REQUEST. Chrome and Edge honour it; Firefox and
  // Safari have historically ignored it for backgrounds, and every browser lets
  // the user switch "Background graphics" off. When the fill is dropped, white
  // text on navy is white text on white paper — which is how the Total row came
  // to be invisible on a printed proposal even after the screen was fixed.
  const printBlock = (() => {
    // Comments first: the file's own header mentions "@media print" in prose,
    // and slicing from that match returns the WHOLE stylesheet — which silently
    // made this suite assert against the screen rules instead of the print
    // ones. Caught by the assertion failing on a rule it should never have seen.
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const start = withoutComments.indexOf("@media print");
    expect(start, "no @media print block").toBeGreaterThan(-1);
    return withoutComments.slice(start);
  })();

  const printRules = parseRules(printBlock);

  it("re-inks every light-on-dark row for print", () => {
    // Each of these carries information the client needs — the total, the
    // column labels, the section numbers — and each is light text on a fill in
    // the screen rules.
    for (const selector of [
      ".rp-doc-fee tfoot tr.rp-doc-fee-total td",
      ".rp-doc-fee th",
      ".rp-doc-secno",
    ]) {
      const rule = printRules.find((candidate) => candidate.selector === selector);
      expect(rule, `${selector} has no print rule re-inking it`).toBeDefined();
      // It must set BOTH: a light background and a dark colour. Setting only
      // one is how the screen bug happened in the first place.
      expect(rule!.body, `${selector} print rule sets no background`).toMatch(/background:/);
      expect(rule!.body, `${selector} print rule sets no colour`).toMatch(/color:/);
      // And the colour must not be the light panel colour or white.
      expect(rule!.body, `${selector} still prints light text`).not.toMatch(
        /color:\s*(var\(--rp-doc-panel\)|#fff\b|#ffffff|white)/i,
      );
    }
  });
});

describe("colour-carrying fills survive printing", () => {
  // Backgrounds are dropped by default when printing. The navy and gold fills
  // are not decoration — they mark the total, the deposit and the section
  // numbers — so they are opted back in explicitly.
  it("opts the fee table's fills into print colour", () => {
    const printExact = rules.filter((rule) => /print-color-adjust:\s*exact/.test(rule.body));
    expect(printExact.length).toBeGreaterThan(0);
    const covered = printExact.map((rule) => rule.selector).join(" ");
    for (const needed of ["rp-doc-fee-total", "rp-doc-fee-deposit", "rp-doc-fee th"]) {
      expect(covered, `${needed} is not opted into print colour`).toContain(needed);
    }
  });
});
