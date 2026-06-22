import { getSubscriptionTiers, getTenantSubscriptions, createTenantSubscription, updateSubscriptionStatus } from "./actions";

const STATUS_COLORS: Record<string, string> = {
  trial: "#7db8ff",
  active: "#42d392",
  past_due: "#f5a623",
  cancelled: "#ff6b6b",
  paused: "#bfb7a3",
};

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(0)}/mo`;
}

export default async function BillingPage() {
  const [tiers, subscriptions] = await Promise.all([getSubscriptionTiers(), getTenantSubscriptions()]);

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>Billing &amp; Subscription</h1>
          <p>Subscription tiers, usage limits, tenant account management, and billing tracking.</p>
        </div>
        <form action={createTenantSubscription}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <input name="tenant_name" placeholder="Tenant / company name" required className="platform-input" style={{ width: 200 }} />
            <input name="tenant_email" type="email" placeholder="Billing email" className="platform-input" style={{ width: 180 }} />
            <select name="tier_id" className="platform-input" style={{ width: 140 }}>
              <option value="">No tier yet</option>
              {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="submit" className="platform-btn platform-btn-primary">+ Add Tenant</button>
          </div>
        </form>
      </div>

      <h3 style={{ margin: "0 0 12px" }}>Subscription Tiers</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        {tiers.map((tier) => (
          <div key={tier.id} className="platform-card" style={{ padding: 20 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{tier.name}</div>
            <div style={{ fontSize: 22, fontWeight: 900, margin: "8px 0", color: "var(--portal-gold, #d4af37)" }}>
              {formatCents(tier.monthly_price_cents)}
            </div>
            <div style={{ fontSize: 12, color: "var(--portal-muted)", marginBottom: 10 }}>
              {tier.annual_price_cents > 0 && `${formatCents(Math.round(tier.annual_price_cents / 12))}/mo billed annually`}
            </div>
            <p style={{ fontSize: 13, color: "var(--portal-muted)", margin: "0 0 10px" }}>{tier.description}</p>
            {Array.isArray(tier.features) && (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
                {(tier.features as string[]).map((f) => (
                  <li key={f} style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <span style={{ color: "#42d392" }}>✓</span> {f}
                  </li>
                ))}
              </ul>
            )}
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--portal-muted)" }}>
              {tier.max_users ? `Up to ${tier.max_users} users` : "Unlimited users"} •{" "}
              {tier.max_sites ? `${tier.max_sites} site${tier.max_sites > 1 ? "s" : ""}` : "Unlimited sites"}
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ margin: "0 0 12px" }}>Tenant Subscriptions</h3>
      {subscriptions.length === 0 && <div className="platform-empty">No tenant subscriptions yet.</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {subscriptions.map((sub) => {
          const tier = sub.platform_subscription_tiers as { name: string; tier_key: string } | null;
          return (
            <div key={sub.id} className="platform-card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <strong>{sub.tenant_name}</strong>
                  {sub.tenant_email && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--portal-muted)" }}>{sub.tenant_email}</span>}
                  {tier && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--portal-gold, #d4af37)" }}>{tier.name}</span>}
                  {sub.trial_ends_at && sub.status === "trial" && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "#f5a623" }}>
                      Trial ends {new Date(sub.trial_ends_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLORS[sub.status] }}>{sub.status}</span>
                  {sub.status === "trial" && (
                    <form action={updateSubscriptionStatus.bind(null, sub.id, "active")}>
                      <button type="submit" className="platform-btn platform-btn-sm platform-btn-success">Activate</button>
                    </form>
                  )}
                  {sub.status === "active" && (
                    <form action={updateSubscriptionStatus.bind(null, sub.id, "cancelled")}>
                      <button type="submit" className="platform-btn platform-btn-sm platform-btn-danger">Cancel</button>
                    </form>
                  )}
                </div>
              </div>
              {sub.notes && <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--portal-muted)" }}>{sub.notes}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
