"use client";

// A submit button that asks before it fires. For destructive server-action
// forms (delete a user, archive an account): the plain <button> submitted on
// first click with no confirmation, while client-side managers confirm — this
// makes the two halves of the portal behave alike.

export function ConfirmSubmit({
  message,
  children,
  className = "button button-light",
  ariaLabel,
  title,
}: {
  /** Shown in the confirm dialog; say exactly what is destroyed and that there is no undo. */
  message: string;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
      title={title}
      type="submit"
    >
      {children}
    </button>
  );
}
