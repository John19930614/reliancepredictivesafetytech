"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
          <h2>Something went wrong</h2>
          <p>A critical error occurred. Please reload the page or contact support.</p>
          <button onClick={reset} type="button">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
