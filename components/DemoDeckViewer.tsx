"use client";

import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const TOTAL_DECK_PAGES = 19;
const SLIDE_PATH = "/demo-deck-slides";

function getSlideSrc(page: number) {
  return `${SLIDE_PATH}/slide-${String(page).padStart(2, "0")}.png`;
}

export function DemoDeckViewer() {
  const [page, setPage] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);

  const slideSrc = useMemo(() => getSlideSrc(page), [page]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === viewerRef.current);
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    [page - 1, page + 1]
      .filter((slidePage) => slidePage >= 1 && slidePage <= TOTAL_DECK_PAGES)
      .forEach((slidePage) => {
        const image = new Image();
        image.src = getSlideSrc(slidePage);
      });
  }, [page]);

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

      <div className="demo-slide-viewer">
        <img src={slideSrc} alt={`Reliance demo presentation slide ${page}`} />
      </div>
    </div>
  );
}
