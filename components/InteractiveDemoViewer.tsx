"use client";

import { ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface InteractiveDemoViewerProps {
  src: string;
  title: string;
}

export function InteractiveDemoViewer({ src, title }: InteractiveDemoViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === viewerRef.current);
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await viewerRef.current?.requestFullscreen();
  };

  return (
    <div className="demo-interactive-shell" ref={viewerRef}>
      <div className="demo-deck-toolbar" aria-label="Interactive demo controls">
        <span className="demo-interactive-title">{title}</span>

        <div className="demo-interactive-actions">
          <a className="button button-light demo-deck-fullscreen" href={src} target="_blank" rel="noreferrer">
            Open in New Tab <ExternalLink size={16} />
          </a>
          <button className="button button-light demo-deck-fullscreen" onClick={toggleFullscreen} type="button">
            {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            {isFullscreen ? "Exit Full Screen" : "Full Screen"}
          </button>
        </div>
      </div>

      <iframe key={src} className="demo-interactive-frame" src={src} title={title} loading="lazy" />
    </div>
  );
}
