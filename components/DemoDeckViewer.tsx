"use client";

import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface DemoDeckViewerProps {
  slidePath?: string;
  totalPages?: number;
  altPrefix?: string;
}

function getSlideSrc(slidePath: string, page: number) {
  return `${slidePath}/slide-${String(page).padStart(2, "0")}.png`;
}

export function DemoDeckViewer({ slidePath = "/demo-deck-slides", totalPages = 29, altPrefix = "Reliance demo presentation" }: DemoDeckViewerProps) {
  const [page, setPage] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);

  const slideSrc = useMemo(() => getSlideSrc(slidePath, page), [slidePath, page]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === viewerRef.current);
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    [page - 1, page + 1]
      .filter((slidePage) => slidePage >= 1 && slidePage <= totalPages)
      .forEach((slidePage) => {
        const image = new Image();
        image.src = getSlideSrc(slidePath, slidePage);
      });
  }, [page]);

  const goToPreviousPage = () => {
    setPage((currentPage) => Math.max(1, currentPage - 1));
  };

  const goToNextPage = () => {
    setPage((currentPage) => Math.min(totalPages, currentPage + 1));
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
            Page {page} of {totalPages}
          </span>
          <button className="icon-button demo-deck-button" onClick={goToNextPage} type="button" aria-label="Next page" disabled={page === totalPages}>
            <ChevronRight size={18} />
          </button>
        </div>

        <button className="button button-light demo-deck-fullscreen" onClick={toggleFullscreen} type="button">
          {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          {isFullscreen ? "Exit Full Screen" : "Full Screen"}
        </button>
      </div>

      <div className="demo-slide-viewer">
        <img src={slideSrc} alt={`${altPrefix} slide ${page}`} />
      </div>
    </div>
  );
}
