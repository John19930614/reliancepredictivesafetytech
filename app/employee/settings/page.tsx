import { CONTACT_EMAIL } from "@/lib/company-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export default function SettingsPage() {
  const connected = hasSupabaseEnv();

  return (
    <>
      <div className="portal-topline">
        <div>
          <div className="eyebrow">Settings</div>
          <h1>Portal configuration</h1>
          <p>Environment and operating notes for the company portal MVP.</p>
        </div>
      </div>

      <div className="portal-grid">
        <section className="portal-card">
          <h3>Supabase status</h3>
          <p>{connected ? "Public Supabase URL/key are configured." : "Add Supabase environment variables before employee use."}</p>
          <div className="metric">{connected ? "Ready" : "Setup"}</div>
        </section>
        <section className="portal-card">
          <h3>Document bucket</h3>
          <p>Private uploads use the `company-documents` storage bucket and authenticated-only RLS policies.</p>
          <div className="metric">Private</div>
        </section>
        <section className="portal-card">
          <h3>Contact email</h3>
          <p>Placeholder public contact email currently used in the footer and demo area.</p>
          <div className="metric" style={{ fontSize: "1.1rem" }}>
            {CONTACT_EMAIL}
          </div>
        </section>
      </div>
    </>
  );
}
