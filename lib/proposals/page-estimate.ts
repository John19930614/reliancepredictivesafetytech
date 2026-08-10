// Print-length estimate for the proposal editor's live preview.
//
// The preview renders the document as one continuous column; print paginates
// it onto letter sheets with different font metrics (proposal-document.css:
// screen is 12.5px/1.5 across a 728px content column, print is 10.5px/1.4
// across 7.6in with 9.95in of content per page). The editor lost its page
// count when the asset's own paginated preview was retired for the single
// React renderer — this restores the number the seller actually watches
// ("did I just push it past 4 pages?") without reintroducing a second
// renderer. It is an estimate; the generated PDF stays authoritative.

/** Letter, minus .rp-doc's print padding (0.45in top, 0.6in bottom) at 96dpi. */
const printPageContentHeightPx = (11 - 0.45 - 0.6) * 96; // 955.2
/** 8.5in minus 0.45in either side, at 96dpi. */
const printContentWidthPx = (8.5 - 0.45 - 0.45) * 96; // 729.6
/** (10.5px × 1.4) / (12.5px × 1.5) — print text runs shorter than screen text. */
const printScreenScale = (10.5 * 1.4) / (12.5 * 1.5);
/** .rp-doc screen padding: 40px top + 40px bottom. */
const screenVerticalPaddingPx = 80;

/**
 * ≈ pages the previewed document would occupy in print.
 *
 * `heightPx`/`widthPx` are the on-screen .rp-doc border-box measurements.
 * Returns at least 1 for anything measurable, and null when the measurements
 * are unusable (unmounted ref, zero-size layout pass) — the caller should show
 * nothing rather than "≈ 0 pages".
 */
export function estimatePrintPages(heightPx: number, widthPx: number): number | null {
  if (!Number.isFinite(heightPx) || !Number.isFinite(widthPx)) return null;
  if (heightPx <= 0 || widthPx <= 0) return null;

  const contentHeight = Math.max(0, heightPx - screenVerticalPaddingPx);
  // A narrower on-screen column wraps more lines than print will; scale the
  // height back to what the print column would produce.
  const widthRatio = Math.min(2, Math.max(0.5, widthPx / printContentWidthPx));
  const printHeight = contentHeight * printScreenScale * widthRatio;

  return Math.max(1, Math.round(printHeight / printPageContentHeightPx));
}

/** "≈ 4 pages in print" / "≈ 1 page in print". */
export function formatPrintPagesLabel(pages: number): string {
  return `≈ ${pages} ${pages === 1 ? "page" : "pages"} in print`;
}
