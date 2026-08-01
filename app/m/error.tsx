"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function MobileError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Mobile app error.", error);
  }, [error]);

  return (
    <div className="m-empty is-page">
      <TriangleAlert aria-hidden="true" size={28} strokeWidth={1.7} />
      <p>Something went wrong.</p>
      <small>{error.message || "The screen could not be loaded."}</small>
      <div className="m-empty-actions">
        <button className="m-primary-button" onClick={reset} type="button">
          <RefreshCw aria-hidden="true" size={16} strokeWidth={2.2} />
          Try again
        </button>
        <Link className="m-secondary-button" href="/m">
          Back to home
        </Link>
      </div>
    </div>
  );
}
