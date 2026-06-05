import { describe, expect, it } from "vitest";
import {
  buildMailboxAddress,
  buildThreadKey,
  flattenRecipients,
  normalizeMailAddress,
  parseMailAddress,
  parseMailRecipients,
} from "./utils";

describe("employee mail utilities", () => {
  it("normalizes mailbox addresses and display-name formatted addresses", () => {
    expect(normalizeMailAddress("John <John@Example.COM>")).toBe("john@example.com");
    expect(parseMailAddress('"Jane Safety" <jane@mail.reliancepredictivesafety.com>')).toEqual({
      address: "jane@mail.reliancepredictivesafety.com",
      name: "Jane Safety",
    });
  });

  it("builds safe aliases on the configured mail domain", () => {
    expect(buildMailboxAddress("John Haldemann")).toBe("john.haldemann@mail.reliancepredictivesafety.com");
  });

  it("parses to, cc, and bcc recipients with de-duplication", () => {
    const recipients = parseMailRecipients({
      to: "one@example.com, One <ONE@example.com>",
      cc: "two@example.com",
      bcc: "three@example.com",
    });

    expect(flattenRecipients(recipients).map((recipient) => recipient.address)).toEqual([
      "one@example.com",
      "two@example.com",
      "three@example.com",
    ]);
  });

  it("uses internet message ids for stable thread keys", () => {
    expect(buildThreadKey({ subject: "Hello", internetMessageId: "<abc>" })).toBe(
      buildThreadKey({ subject: "Different", internetMessageId: "<ABC>" }),
    );
  });
});
