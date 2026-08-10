"use client";

// Pending-aware submit for server-action forms. Must render INSIDE the <form>
// it submits — useFormStatus reads the nearest form ancestor's status.
//
// Server-action forms previously left their button enabled while the action
// ran, so a slow round-trip (invite links, deletes) invited a second click
// and a duplicate write. Client-side managers already show "Saving…" states;
// this brings the plain-form half of the portal up to the same behavior.

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel = "Working…",
  className = "button button-primary",
  ariaLabel,
  title,
}: {
  children: React.ReactNode;
  /** Label swapped in while the action runs, e.g. "Deleting…". */
  pendingLabel?: string;
  className?: string;
  ariaLabel?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      aria-busy={pending || undefined}
      aria-label={ariaLabel}
      className={className}
      disabled={pending}
      title={title}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
