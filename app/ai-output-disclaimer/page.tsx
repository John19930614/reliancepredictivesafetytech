import Link from "next/link";
import { COMPANY_NAME } from "@/lib/company-data";

export default function AiOutputDisclaimerPage() {
  return (
    <main className="legal-page">
      <article>
        <Link href="/">Back to home</Link>
        <h1>AI Output Disclaimer</h1>
        <p>
          {COMPANY_NAME} may use AI-assisted workflows to generate drafts, summaries, forecasts, templates, and
          recommendations. AI outputs are not a substitute for competent human safety, legal, engineering, or compliance
          review.
        </p>
        <p>
          Safety-critical outputs, including CSEP/PSHSEP content, JSA content, permit guidance, incident findings,
          corrective actions, and predictive injury indicators, must be reviewed and approved by qualified personnel
          before use.
        </p>
      </article>
    </main>
  );
}
