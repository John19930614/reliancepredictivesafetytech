"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="portal-error-page">
      <h2>Something went wrong</h2>
      <p>An unexpected error occurred. Please try again or contact support if the problem persists.</p>
      <button className="button" onClick={reset} type="button">
        Try again
      </button>
    </div>
  );
}
