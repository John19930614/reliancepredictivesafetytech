import Link from "next/link";
import { COMPANY_NAME } from "@/lib/company-data";

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <article>
        <Link href="/">Back to home</Link>
        <h1>Privacy Policy</h1>
        <p>
          This placeholder privacy policy page is prepared for {COMPANY_NAME}. Replace this content with
          attorney-reviewed language before accepting customer data, employee data, SOR records, incident records, or
          uploaded documents.
        </p>
        <p>
          The final policy should describe data collected, business purpose, storage, subprocessors, retention,
          deletion, security controls, and contact instructions.
        </p>
      </article>
    </main>
  );
}
