import Link from "next/link";
import { ChevronLeft } from "lucide-react";

type MobileHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  action?: React.ReactNode;
};

export function MobileHeader({ eyebrow, title, subtitle, backHref, backLabel, action }: MobileHeaderProps) {
  return (
    <header className="m-header">
      {backHref ? (
        <Link className="m-backlink" href={backHref}>
          <ChevronLeft aria-hidden="true" size={18} strokeWidth={2.2} />
          <span>{backLabel ?? "Back"}</span>
        </Link>
      ) : null}
      <div className="m-header-row">
        <div className="m-header-text">
          {eyebrow ? <p className="m-eyebrow">{eyebrow}</p> : null}
          <h1 className="m-title">{title}</h1>
          {subtitle ? <p className="m-subtitle">{subtitle}</p> : null}
        </div>
        {action ? <div className="m-header-action">{action}</div> : null}
      </div>
    </header>
  );
}
