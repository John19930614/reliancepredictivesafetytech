import { SearchX } from "lucide-react";
import Link from "next/link";

export default function MobileNotFound() {
  return (
    <div className="m-empty is-page">
      <SearchX aria-hidden="true" size={28} strokeWidth={1.7} />
      <p>Not found.</p>
      <small>That item either does not exist or is not shared with you.</small>
      <div className="m-empty-actions">
        <Link className="m-primary-button" href="/m">
          Back to home
        </Link>
      </div>
    </div>
  );
}
