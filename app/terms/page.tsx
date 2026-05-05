import Link from "next/link";
import { COMPANY_NAME } from "@/lib/company-data";

export default function TermsPage() {
  return (
    <main className="legal-page">
      <article>
        <Link href="/">Back to home</Link>
        <h1>Terms of Use</h1>
        <p>
          These placeholder terms are for {COMPANY_NAME}. Replace with attorney-reviewed customer, website, and SaaS
          subscription terms before production use.
        </p>
        <p>
          Final terms should address acceptable use, accounts, subscriptions, scope, payment, limitations, warranty,
          liability, termination, intellectual property, and dispute handling.
        </p>
      </article>
    </main>
  );
}
