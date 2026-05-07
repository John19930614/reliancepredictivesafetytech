"use client";

import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const TOTAL_DECK_PAGES = 19;

export function DemoDeckViewer() {
  const [page, setPage] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);

  const viewerSrc = useMemo(
    () => `/demo-deck.pdf#page=${page}&toolbar=0&navpanes=0&scrollbar=0&view=FitH`,
    [page],
  );

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === viewerRef.current);
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  const goToPreviousPage = () => {
    setPage((currentPage) => Math.max(1, currentPage - 1));
  };

  const goToNextPage = () => {
    setPage((currentPage) => Math.min(TOTAL_DECK_PAGES, currentPage + 1));
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await viewerRef.current?.requestFullscreen();
  };

  return (
    <div className="demo-deck-shell" ref={viewerRef}>
      <div className="demo-deck-toolbar" aria-label="Presentation controls">
        <div className="demo-deck-page-controls">
          <button className="icon-button demo-deck-button" onClick={goToPreviousPage} type="button" aria-label="Previous page" disabled={page === 1}>
            <ChevronLeft size={18} />
          </button>
          <span className="demo-deck-page-status" aria-live="polite">
            Page {page} of {TOTAL_DECK_PAGES}
          </span>
          <button className="icon-button demo-deck-button" onClick={goToNextPage} type="button" aria-label="Next page" disabled={page === TOTAL_DECK_PAGES}>
            <ChevronRight size={18} />
          </button>
        </div>

        <button className="button button-light demo-deck-fullscreen" onClick={toggleFullscreen} type="button">
          {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          {isFullscreen ? "Exit Full Screen" : "Full Screen"}
        </button>
      </div>

      <div className="demo-pdf-viewer">
        <iframe key={viewerSrc} src={viewerSrc} title={`Reliance demo presentation page ${page}`} />
      </div>
    </div>
  );
}
