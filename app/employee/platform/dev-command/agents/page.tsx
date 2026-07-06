import { AGENT_REGISTRY, type AgentGroup } from "@/lib/dev-command/agent-registry";

const GROUP_ORDER: AgentGroup[] = ["Team Lead", "Planning & Build", "Quality, Security, Performance", "Experience & Clarity", "Ship & Support"];

export default function AgentRosterPage() {
  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h1>Agent Roster</h1>
          <p>The fixed team of {AGENT_REGISTRY.length} AI agents that carry every task through the workflow.</p>
        </div>
      </div>

      {GROUP_ORDER.map((group) => {
        const agents = AGENT_REGISTRY.filter((agent) => agent.group === group);
        if (agents.length === 0) return null;

        return (
          <section key={group} style={{ marginBottom: 24 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, color: "var(--portal-muted)" }}>{group}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {agents.map((agent) => (
                <div key={agent.key} className="platform-card" style={{ padding: 14 }}>
                  <strong>{agent.name}</strong>
                  <p style={{ fontSize: 12, color: "var(--portal-muted)", margin: "6px 0" }}>{agent.description}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {agent.forbiddenActions.map((restriction) => (
                      <span key={restriction} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(255,107,107,.08)", color: "#ff9d9d", border: "1px solid rgba(255,107,107,.2)" }}>{restriction}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
