import { describe, expect, it } from "vitest";
import {
  allowedFileMimeTypes,
  buildStoragePath,
  isAllowedMimeType,
  maxFileNameLength,
  maxFileSizeBytes,
  maxFolderNameLength,
  sanitizeFileName,
  sanitizeFolderName,
  wouldCreateFolderCycle,
} from "./validation";

const fileId = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const clientId = "9b2f0c1e-5a44-4d59-8f3a-2f6f1b7a9c11";

describe("limits", () => {
  it("pins the bounds the upload form and the DB checks advertise", () => {
    expect(maxFileSizeBytes).toBe(25 * 1024 * 1024);
    expect(maxFileNameLength).toBe(200);
    expect(maxFolderNameLength).toBe(120);
  });
});

describe("sanitizeFileName", () => {
  it("defuses path-traversal names", () => {
    for (const hostile of [
      "../../etc/passwd",
      "..\\..\\windows\\system32\\cmd.exe",
      "/etc/shadow",
      "..././..././secret.txt",
    ]) {
      const safe = sanitizeFileName(hostile);
      expect(safe, hostile).not.toMatch(/[\\/]/);
      expect(safe.startsWith("."), hostile).toBe(false);
    }
    // Separators become spaces and the leading dot-run is consumed, so the
    // readable part of the name survives.
    expect(sanitizeFileName("../../etc/passwd")).toBe("etc passwd");
    expect(sanitizeFileName("a/b\\c.pdf")).toBe("a b c.pdf");
  });

  it("strips control characters", () => {
    expect(sanitizeFileName("quarterly\u0000report.pdf")).toBe("quarterly report.pdf");
    expect(sanitizeFileName("line\nbreak.txt")).toBe("line break.txt");
    // Adjacent control characters (BEL, ESC) collapse into a single space, and
    // DEL (\u007f) is scrubbed with the rest.
    expect(sanitizeFileName("audit\u0007\u001b.xlsx")).toBe("audit .xlsx");
    expect(sanitizeFileName("del\u007fchar.png")).toBe("del char.png");
  });

  it("collapses whitespace runs and trims the ends", () => {
    expect(sanitizeFileName("  Site   Safety   Plan.pdf  ")).toBe("Site Safety Plan.pdf");
    expect(sanitizeFileName("tabs\tand\tspaces.docx")).toBe("tabs and spaces.docx");
  });

  it("caps at 200 characters without leaving a dangling space", () => {
    expect(sanitizeFileName("x".repeat(500))).toHaveLength(maxFileNameLength);
    expect(sanitizeFileName(`${"x".repeat(199)} y`)).toHaveLength(199);
  });

  it("returns '' when nothing survives", () => {
    for (const junk of ["", "   ", "...", "././..", "///\\\\", "\u0000\u0001\u0002", " . . . "]) {
      expect(sanitizeFileName(junk), JSON.stringify(junk)).toBe("");
    }
  });
});

describe("sanitizeFolderName", () => {
  it("rejects the path-navigation names outright", () => {
    expect(sanitizeFolderName(".")).toBe("");
    expect(sanitizeFolderName("..")).toBe("");
  });

  it("keeps an ordinary name unchanged", () => {
    expect(sanitizeFolderName("Site Audits 2026")).toBe("Site Audits 2026");
  });

  it("scrubs separators like the file scrub does", () => {
    expect(sanitizeFolderName("clients/hunzinger")).toBe("clients hunzinger");
  });

  it("caps at 120 characters", () => {
    expect(sanitizeFolderName("f".repeat(300))).toHaveLength(maxFolderNameLength);
  });
});

describe("isAllowedMimeType", () => {
  it("accepts every allowlisted type, case-insensitively, with or without parameters", () => {
    expect(isAllowedMimeType("application/pdf")).toBe(true);
    expect(isAllowedMimeType("APPLICATION/PDF")).toBe(true);
    expect(isAllowedMimeType("text/csv;charset=utf-8")).toBe(true);
    for (const mime of allowedFileMimeTypes) {
      expect(isAllowedMimeType(mime), mime).toBe(true);
      expect(isAllowedMimeType(mime.toUpperCase()), `${mime} upper-cased`).toBe(true);
    }
  });

  it("rejects executables, scripts, and the empty string by omission", () => {
    for (const mime of ["application/x-msdownload", "application/x-sh", "text/html", ""]) {
      expect(isAllowedMimeType(mime), JSON.stringify(mime)).toBe(false);
    }
  });
});

describe("buildStoragePath", () => {
  it("shapes company keys as company/<fileId>-<name>", () => {
    expect(buildStoragePath("company", null, fileId, "plan.pdf")).toBe(`company/${fileId}-plan.pdf`);
  });

  it("shapes client keys as client/<clientId>/<fileId>-<name>", () => {
    expect(buildStoragePath("client", clientId, fileId, "plan.pdf")).toBe(`client/${clientId}/${fileId}-plan.pdf`);
  });

  // A client file with no client id would silently land in nobody's library.
  it("refuses a client-scoped path with no client id", () => {
    expect(() => buildStoragePath("client", null, fileId, "plan.pdf")).toThrow();
    expect(() => buildStoragePath("client", "", fileId, "plan.pdf")).toThrow();
  });

  it("keeps the storage key inside [a-zA-Z0-9._/-] whatever the display name holds", () => {
    for (const name of ["safety plan (final).pdf", "Résumé — José.pdf", "a b\tc.png", "💥 report.pdf"]) {
      const path = buildStoragePath("company", null, fileId, name);
      expect(path, name).toMatch(/^company\/[a-zA-Z0-9._-]+$/);
      expect(path, name).not.toContain(" ");
    }
    expect(buildStoragePath("company", null, fileId, "safety plan (final).pdf")).toBe(
      `company/${fileId}-safety-plan--final-.pdf`,
    );
  });
});

describe("wouldCreateFolderCycle", () => {
  it("blocks making a folder its own parent", () => {
    expect(wouldCreateFolderCycle("a", "a", new Map())).toBe(true);
  });

  it("blocks moving a folder under its own descendant", () => {
    // Chain a → b → c (b's parent is a, c's parent is b).
    const parents = new Map<string, string | null>([
      ["a", null],
      ["b", "a"],
      ["c", "b"],
    ]);
    expect(wouldCreateFolderCycle("a", "c", parents)).toBe(true);
    expect(wouldCreateFolderCycle("a", "b", parents)).toBe(true);
    expect(wouldCreateFolderCycle("b", "c", parents)).toBe(true);
  });

  it("allows a move to an unrelated branch", () => {
    const parents = new Map<string, string | null>([
      ["x", null],
      ["y", "x"],
    ]);
    expect(wouldCreateFolderCycle("a", "y", parents)).toBe(false);
  });

  it("allows a move to the root", () => {
    expect(wouldCreateFolderCycle("a", null, new Map([["a", null]]))).toBe(false);
  });

  it("terminates on a corrupt parents map instead of walking forever", () => {
    // A pre-existing cycle that does not involve the folder being moved.
    const corrupt = new Map<string, string | null>([
      ["p", "q"],
      ["q", "p"],
    ]);
    expect(wouldCreateFolderCycle("a", "p", corrupt)).toBe(false);
    // A folder listed as its own parent.
    expect(wouldCreateFolderCycle("b", "a", new Map([["a", "a"]]))).toBe(false);
    // A parent pointing at an id the map has never heard of ends the walk.
    expect(wouldCreateFolderCycle("a", "ghost", new Map([["real", null]]))).toBe(false);
  });
});
