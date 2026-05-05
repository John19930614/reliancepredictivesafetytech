import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import { DemoRequestForm } from "@/components/DemoRequestForm";
import { COMPANY_NAME, CONTACT_EMAIL, TAGLINE, products, whyReliance } from "@/lib/company-data";

export default function HomePage() {
  return (
    <div className="site-shell">
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
            <a href="#contact">Contact</a>
            <Link href="/employee-login">Employee Login</Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="container hero-grid">
            <div>
              <div className="eyebrow">AI-assisted safety intelligence</div>
              <h1>{COMPANY_NAME}</h1>
              <h2>{TAGLINE}</h2>
              <p>
                AI-powered safety technology built to help contractors, safety teams, and project owners generate
                better safety documents, track field risk, and use real data to prevent injuries before they happen.
              </p>
              <div className="hero-actions">
                <a className="button button-primary" href="#demo">
                  Request a Demo <ArrowRight size={18} />
                </a>
                <a className="button button-secondary" href="#products">
                  View Products
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
                <h2>Safety work, made visible.</h2>
              </div>
              <p>
                Reliance brings document generation, field tracking, review workflows, and predictive visibility into a
                professional safety technology suite.
              </p>
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
                <h2>Built for safety teams that need speed and control.</h2>
              </div>
              <p>
                The platform is designed to reduce repetitive admin work while preserving review discipline for
                safety-critical documents and forecasts.
              </p>
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
              <h2>See how predictive safety work can move faster.</h2>
              <p>
                Tell us what you want to solve first: CSEP/PSHSEP generation, SOR scoring, incident tracking,
                corrective actions, permit/JSA workflows, training matrices, or document control.
              </p>
              <p>
                Contact email placeholder:
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
            <Link href="/employee-login">Employee Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
