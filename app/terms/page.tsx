import Link from "next/link";
import { COMPANY_NAME, CONTACT_EMAIL } from "@/lib/company-data";

export default function TermsPage() {
  return (
    <main className="legal-page">
      <article>
        <Link href="/">Back to home</Link>
        <h1>Terms of Use</h1>
        <p>
          <strong>Effective date:</strong> June 16, 2026 &nbsp;|&nbsp; <strong>Last updated:</strong> June 16, 2026
        </p>
        <p>
          Please read these Terms of Use ("Terms") carefully before using the Services operated by{" "}
          <strong>{COMPANY_NAME}</strong> ("Reliance," "we," "us," or "our"). By accessing or using the Services you
          agree to be bound by these Terms.
        </p>

        <h2>1. Services</h2>
        <p>
          Reliance provides a B2B SaaS platform comprising the Reliance employee portal, the SafetyDocs360 document
          platform, and related AI-assisted safety and workforce management tools (collectively, the "Services").
          Enterprise access is granted under a separate order form or subscription agreement between Reliance and the
          subscribing organization ("Customer").
        </p>

        <h2>2. Account access</h2>
        <p>
          Access to the Services is provided on an invitation basis to authorized employees and administrators of a
          Customer. You are responsible for maintaining the confidentiality of your credentials and for all activity
          that occurs under your account. Notify us immediately at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> if you believe your account has been compromised.
        </p>

        <h2>3. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Services for any unlawful purpose or in violation of applicable regulations;</li>
          <li>
            Attempt to gain unauthorized access to any portion of the Services or any system connected to the Services;
          </li>
          <li>Transmit malware, spam, or other harmful code;</li>
          <li>
            Reverse engineer, decompile, or disassemble any software component of the Services;
          </li>
          <li>
            Resell, sublicense, or otherwise transfer your access rights to any third party without Reliance's written
            consent;
          </li>
          <li>
            Rely on AI-generated outputs for final safety-critical, legal, or regulatory decisions without independent
            competent human review.
          </li>
        </ul>

        <h2>4. AI outputs — decision support only</h2>
        <p>
          Features powered by artificial intelligence generate drafts, summaries, risk assessments, and workflow
          recommendations as decision-support aids. <strong>All AI outputs require human review and validation</strong>{" "}
          before operational, safety-critical, legal, or compliance use. Reliance expressly disclaims liability for
          losses arising from unreviewed or unchecked reliance on AI-generated content.
        </p>

        <h2>5. Subscriptions and payment</h2>
        <p>
          Subscription fees, payment terms, renewal conditions, and cancellation rights are governed by the order form
          or subscription agreement executed between Reliance and the Customer. In the absence of a signed agreement,
          all fees are due net-30 from invoice date. Reliance reserves the right to suspend access for accounts more
          than fifteen (15) days past due.
        </p>

        <h2>6. Intellectual property</h2>
        <p>
          All right, title, and interest in the Services, including software, design, trademarks, and documentation,
          remain the exclusive property of Reliance. Nothing in these Terms transfers any ownership rights to you.
        </p>
        <p>
          Customer data uploaded to the Services remains the property of the Customer. Reliance is granted a limited
          license to process that data solely as necessary to provide the Services.
        </p>

        <h2>7. Confidentiality</h2>
        <p>
          Each party agrees to protect the other's non-public business information with at least the same degree of care
          it uses for its own confidential information, but no less than reasonable care.
        </p>

        <h2>8. Disclaimer of warranties</h2>
        <p>
          THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE." RELIANCE DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED,
          INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. RELIANCE
          DOES NOT WARRANT THAT THE SERVICES WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS.
        </p>

        <h2>9. Limitation of liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, RELIANCE'S TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATED
          TO THE SERVICES SHALL NOT EXCEED THE FEES PAID BY CUSTOMER IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
          IN NO EVENT SHALL RELIANCE BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES,
          EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
        </p>

        <h2>10. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless Reliance and its officers, employees, and agents from any claims,
          damages, or expenses (including reasonable attorneys' fees) arising from your use of the Services, your
          violation of these Terms, or your violation of any third-party rights.
        </p>

        <h2>11. Termination</h2>
        <p>
          Reliance may suspend or terminate your access to the Services at any time for material breach of these Terms,
          non-payment, or as required by law, with or without notice. Upon termination, your right to use the Services
          ceases immediately. Customer data export and deletion are governed by the Privacy Policy.
        </p>

        <h2>12. Governing law and disputes</h2>
        <p>
          These Terms are governed by the laws of the United States applicable to contracts performed within the United
          States, without regard to conflict-of-law principles. Any dispute arising under these Terms shall first be
          subject to good-faith negotiation for thirty (30) days, after which either party may pursue binding
          arbitration under the rules of the American Arbitration Association.
        </p>

        <h2>13. Changes to these Terms</h2>
        <p>
          Reliance reserves the right to update these Terms. Material changes will be communicated via email or
          in-portal notice at least fourteen (14) days before taking effect. Continued use of the Services after the
          effective date constitutes acceptance of the updated Terms.
        </p>

        <h2>14. Contact</h2>
        <p>
          Questions about these Terms should be directed to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </article>
    </main>
  );
}
