/** Shared proposal export filename helpers. */

/** Filename-safe slug of the client/proposal title. */
export function proposalDownloadSlug(title: string): string {
  return (
    title
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .toLowerCase() || "proposal"
  );
}

export function proposalDownloadFilename(title: string, revision: number, extension: "pdf" | "docx"): string {
  return `${proposalDownloadSlug(title)}-v${revision}.${extension}`;
}
