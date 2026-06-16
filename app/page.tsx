import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import { DemoRequestForm } from "@/components/DemoRequestForm";
import { SupportTicketForm } from "@/components/SupportTicketForm";
import { RecoveryHashRedirect } from "@/components/auth/RecoveryHashRedirect";
import { COMPANY_NAME, CONTACT_EMAIL, TAGLINE, products, whyReliance } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/server";
import { getApprovedWebsiteContent, getWebsiteContentValue } from "@/lib/website-operations";

export default async function HomePage() {
  const content = await getApprovedWebsiteContent(await createClient());

  return (
    <div className="site-shell">
      <RecoveryHashRedirect />
      <header className="public-header">
        <nav className="container public-nav" aria-label="Public navigation">
          <Link className="brand-mark" href="/">
            <Image alt={`${COMPANY_NAME} logo`} height={64} src="/reliance-seal-transparent.png" width={64} priority />
            <span className="brand-copy">
              <strong>{COMPANY_NAME}</strong>
              <span>{TAGLINE}</span>
            </span>
          </Link>
          <div className="nav-links">
            <a href="#home">Home</a>
            <a href="#products">Products</a>
            <a href="#why">Why Reliance</a>
            <a href="#demo">Demo Request</a>
            <a href="#support">Tech Support</a>
            <a href="#contact">Contact</a>
            <a href="https://safety360docs.com" rel="noreferrer" target="_blank">
              SafetyDocs360 Platform
            </a>
            <Link href="/employee-login">Employee Login</Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="container hero-grid">
            <div>
              <div className="eyebrow">{getWebsiteContentValue(content, "home.hero.eyebrow")}</div>
              <h1>{COMPANY_NAME}</h1>
              <h2>{TAGLINE}</h2>
              <p>{getWebsiteContentValue(content, "home.hero.summary")}</p>
              <div className="prevention-strip" aria-label={`${COMPANY_NAME} prevention workflow`}>
                <span>Collect AI-assisted field data</span>
                <span>Formulate safety trends</span>
                <span>Predict risk patterns</span>
              </div>
              <div className="hero-actions">
                <a className="button button-primary" href="#demo">
                  Request a Demo <ArrowRight size={18} />
                </a>
                <a className="button button-secondary" href="#products">
                  View Products
                </a>
                <a className="button button-secondary" href="https://safety360docs.com" rel="noreferrer" target="_blank">
                  Open SafetyDocs360 Platform
                </a>
                <Link className="button button-secondary" href="/employee-login">
                  <LockKeyhole size={18} /> Employee Login
                </Link>
              </div>
            </div>
            <div className="hero-logo" aria-hidden="true">
              <Image alt="" height={603} src="/reliance-logo-transparent.png" width={2042} priority />
            </div>
          </div>
        </section>

        <section className="section-light" id="products">
          <div className="container">
            <div className="section-heading">
              <div>
                <div className="eyebrow">Products / Platform</div>
                <h2>{getWebsiteContentValue(content, "home.products.heading")}</h2>
              </div>
              <p>{getWebsiteContentValue(content, "home.products.summary")}</p>
            </div>
            <div className="product-grid">
              {products.map((product) => {
                const Icon = product.icon;
                return (
                  <article className="product-card" key={product.title}>
                    <Icon aria-hidden="true" size={28} />
                    <div>
                      <h3>{product.title}</h3>
                      <p>{product.description}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section-dark" id="why">
          <div className="container">
            <div className="section-heading">
              <div>
                <div className="eyebrow">Why Reliance</div>
                <h2>{getWebsiteContentValue(content, "home.why.heading")}</h2>
              </div>
              <p>{getWebsiteContentValue(content, "home.why.summary")}</p>
            </div>
            <div className="value-grid">
              {whyReliance.map((item) => (
                <div className="value-item" key={item}>
                  <CheckCircle2 aria-hidden="true" size={22} />
                  <strong>{item}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section-light" id="demo">
          <div className="container contact-layout">
            <aside className="contact-panel" id="contact">
              <div className="eyebrow">Demo Request / Contact</div>
              <h2>{getWebsiteContentValue(content, "home.contact.heading")}</h2>
              <p>{getWebsiteContentValue(content, "home.contact.summary")}</p>
              <p>
                Contact us:
                <br />
                <strong>{CONTACT_EMAIL}</strong>
              </p>
              <p>
                <ShieldCheck size={18} /> AI outputs are decision-support drafts and require competent human review
                before safety-critical use.
              </p>
            </aside>
            <DemoRequestForm />
          </div>
        </section>

        <section className="section-dark support-ticket-section" id="support">
          <div className="container contact-layout support-ticket-layout">
            <aside className="contact-panel">
              <div className="eyebrow">Tech Support</div>
              <h2>Submit a support ticket</h2>
              <p>Use this for login issues, platform questions, bug reports, or product support requests.</p>
              <p>
                Tickets are routed into the Reliance employee inbox for review and follow-up.
              </p>
            </aside>
            <SupportTicketForm />
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <strong>{COMPANY_NAME}</strong>
            <br />
            {TAGLINE}
          </div>
          <div className="footer-links">
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Use</Link>
            <Link href="/ai-output-disclaimer">AI Output Disclaimer</Link>
            <a href="https://safety360docs.com" rel="noreferrer" target="_blank">
              SafetyDocs360 Platform
            </a>
            <Link href="/employee-login">Employee Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
