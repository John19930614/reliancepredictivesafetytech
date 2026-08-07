import type { ReactNode } from "react";

/**
 * The console's card chrome: icon + title + optional tag on the left, an
 * optional count chip on the right, then the body. Every card on the page uses
 * it so the seven panels cannot drift apart.
 *
 * Server component — it renders markup and nothing else.
 */
export function TalentCard({
  title,
  icon,
  tag,
  count,
  flush = false,
  children,
}: {
  title: string;
  /** Lucide icon, already sized by the caller. */
  icon?: ReactNode;
  /** Small uppercase label beside the title, e.g. "AI scouting". */
  tag?: ReactNode;
  /** Right-hand chip, e.g. "38 open". Hidden when null. */
  count?: string | null;
  /** Drops the body padding — used by the ledger table, which owns its own. */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="talent-card">
      <div className="talent-card-head">
        <h2>
          {icon ? <span aria-hidden="true">{icon}</span> : null}
          <span>{title}</span>
          {tag}
        </h2>
        {count ? <span className="talent-card-count">{count}</span> : null}
      </div>
      <div className={flush ? "talent-card-body talent-card-body-flush" : "talent-card-body"}>{children}</div>
    </section>
  );
}

/** "AI scouting" / "AI screening" — something an agent does unattended. */
export function TalentAiTag({ label }: { label: string }) {
  return <span className="talent-tag-ai">{label}</span>;
}

/** "Needs your approval" — the human gate. */
export function TalentGateTag({ label }: { label: string }) {
  return <span className="talent-tag-gate">{label}</span>;
}

/**
 * A fresh install has zero rows in every one of these tables. An empty card has
 * to read as "nothing here yet, and here is what will fill it" rather than as a
 * failed load.
 */
export function TalentEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <p className="talent-empty">
      <strong>{title}</strong>
      {hint}
    </p>
  );
}
