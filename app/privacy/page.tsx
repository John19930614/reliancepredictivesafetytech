import Link from "next/link";
import { COMPANY_NAME, CONTACT_EMAIL } from "@/lib/company-data";

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <article>
        <Link href="/">Back to home</Link>
        <h1>Privacy Policy</h1>
        <p>
          <strong>Effective date:</strong> June 16, 2026 &nbsp;|&nbsp; <strong>Last updated:</strong> June 16, 2026
        </p>

        <h2>1. Who we are</h2>
        <p>
          {COMPANY_NAME} ("Reliance," "we," "us," or "our") operates the Reliance employee portal and the SafetyDocs360
          platform (collectively, the "Services"). Our contact address is{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <h2>2. Information we collect</h2>
        <p>We collect information that you or your employer provides when using the Services:</p>
        <ul>
          <li>
            <strong>Account and identity data</strong> — name, work email address, job title, and authentication
            credentials managed through our identity provider.
          </li>
          <li>
            <strong>Employee records</strong> — time cards, expense reports, payroll setup tasks, training completion
            records, certifications, and HR documents submitted through the portal.
          </li>
          <li>
            <strong>Safety and operational records</strong> — incident reports, risk assessments, compliance checklists,
            and operational records entered by authorized personnel.
          </li>
          <li>
            <strong>Uploaded files and documents</strong> — safety documents, signed agreements, receipts, and other
            files stored on your behalf.
          </li>
          <li>
            <strong>Communications</strong> — messages sent through the employee chat feature and support tickets
            submitted via the public website.
          </li>
          <li>
            <strong>Usage data</strong> — log data including IP addresses, browser type, pages visited, and timestamps
            generated automatically when you use the Services.
          </li>
          <li>
            <strong>AI interaction data</strong> — prompts and responses generated through the AI Command Center and
            Website Operations AI features.
          </li>
        </ul>

        <h2>3. How we use your information</h2>
        <p>We use the information we collect to:</p>
        <ul>
          <li>Provide, operate, and maintain the Services;</li>
          <li>Authenticate users and enforce role-based access controls;</li>
          <li>Generate workflow notifications, daily digest emails, and in-app alerts;</li>
          <li>Support AI-assisted safety document drafting and workflow decision support;</li>
          <li>Process payroll tracking, expense reimbursement, and time-card review workflows;</li>
          <li>Send transactional and operational emails (account notifications, document delivery, digests);</li>
          <li>Monitor platform health, investigate security incidents, and prevent abuse;</li>
          <li>Comply with applicable legal obligations.</li>
        </ul>
        <p>
          We do not sell your personal information to third parties. We do not use your data for advertising or
          behavioral profiling outside the Services.
        </p>

        <h2>4. AI-generated outputs</h2>
        <p>
          Certain features use large language models to generate drafts, summaries, proposals, and recommendations. All
          AI outputs are decision-support tools only and require competent human review before any safety-critical,
          legal, or compliance use. Prompts and responses may be logged for quality assurance and abuse prevention.
        </p>

        <h2>5. Subprocessors</h2>
        <p>We rely on the following third-party service providers to operate the Services:</p>
        <ul>
          <li>
            <strong>Supabase</strong> — database hosting, authentication, and file storage (data processed in the United
            States);
          </li>
          <li>
            <strong>Vercel</strong> — application hosting and serverless compute;
          </li>
          <li>
            <strong>Resend</strong> — transactional email delivery;
          </li>
          <li>
            <strong>Vercel AI Gateway / OpenAI</strong> — AI model inference for document drafting and workflow
            assistance;
          </li>
          <li>
            <strong>Twilio</strong> — real-time communication infrastructure for video/audio chat features.
          </li>
        </ul>
        <p>Each subprocessor is bound by data processing agreements consistent with applicable privacy law.</p>

        <h2>6. Data retention</h2>
        <p>
          We retain personal data for as long as your account is active or as needed to provide the Services. Upon
          contract termination, account data is retained for ninety (90) days to permit data export, then deleted from
          production systems within thirty (30) days thereafter. Backups may persist for up to an additional ninety (90)
          days. Certain records (e.g., safety incident reports) may be retained longer where required by law.
        </p>

        <h2>7. Security</h2>
        <p>
          We implement industry-standard technical safeguards including TLS encryption in transit, AES-256 encryption at
          rest, row-level security policies enforced at the database layer, and role-based access controls limiting data
          access to authorized personnel. We cannot, however, guarantee absolute security.
        </p>

        <h2>8. Your rights</h2>
        <p>
          Subject to applicable law, you may request access to, correction of, or deletion of your personal data by
          contacting us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We will respond within thirty (30)
          days. Requests to delete data used in active safety, compliance, or payroll records may be subject to legal
          retention requirements.
        </p>

        <h2>9. Cookies and tracking</h2>
        <p>
          The Services use session cookies required for authentication. We do not use third-party advertising trackers
          or persistent cross-site tracking cookies.
        </p>

        <h2>10. Children</h2>
        <p>
          The Services are intended for business use by adults. We do not knowingly collect information from persons
          under 18 years of age.
        </p>

        <h2>11. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy periodically. Material changes will be communicated via email or an
          in-portal notice at least fourteen (14) days before taking effect. Continued use of the Services after the
          effective date constitutes acceptance of the updated policy.
        </p>

        <h2>12. Contact</h2>
        <p>
          Questions about this Privacy Policy or our data practices should be directed to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </article>
    </main>
  );
}
