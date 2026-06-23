"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2 } from "lucide-react";

export function DocumentBuilderForm() {
  const router = useRouter();
  const [docType, setDocType] = useState<"sop" | "policy">("sop");
  const [showMore, setShowMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      doc_type: docType,
      title: String(formData.get("title") ?? "").trim(),
      industry: String(formData.get("industry") ?? "").trim(),
      jurisdiction: String(formData.get("jurisdiction") ?? "").trim(),
      scope: String(formData.get("scope") ?? "").trim(),
      hazards: String(formData.get("hazards") ?? "").trim(),
      responsible_role: String(formData.get("responsible_role") ?? "").trim(),
      company_standards: String(formData.get("company_standards") ?? "").trim(),
      notes: String(formData.get("notes") ?? "").trim(),
    };

    if (!payload.title) {
      setSubmitting(false);
      setError("Give the document a title.");
      return;
    }

    try {
      const res = await fetch("/api/document-builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Generation failed.");
        setSubmitting(false);
        return;
      }
      router.push(`/employee/document-builder/${data.draftId}`);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form className="form-panel" onSubmit={handleSubmit}>
      <h2>Generate a document</h2>
      <p style={{ color: "var(--portal-muted)", marginTop: 4, fontSize: "0.9rem" }}>
        Draft an SOP or Policy with AI. Every draft is reviewed by a person before it can be published.
      </p>
      {error ? <div className="error-box" style={{ marginTop: 12 }}>{error}</div> : null}

      <div className="form-grid" style={{ gridTemplateColumns: "1fr", marginTop: 16 }}>
        <div className="field">
          <label htmlFor="doc_type">Document type</label>
          <select id="doc_type" name="doc_type" value={docType} onChange={(e) => setDocType(e.target.value as "sop" | "policy")}>
            <option value="sop">Standard Operating Procedure (SOP)</option>
            <option value="policy">Policy</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" name="title" placeholder={docType === "sop" ? "e.g. Forklift Operation SOP" : "e.g. Fall Protection Policy"} required />
        </div>
        <div className="field">
          <label htmlFor="scope">What should it cover?</label>
          <textarea id="scope" name="scope" rows={3} placeholder="Describe the task, area, equipment, or topic this document addresses." />
        </div>

        <button
          type="button"
          className="button button-light"
          style={{ justifySelf: "start" }}
          onClick={() => setShowMore((v) => !v)}
        >
          {showMore ? "Hide extra detail" : "Add more detail (optional)"}
        </button>

        {showMore ? (
          <>
            <div className="field">
              <label htmlFor="industry">Industry / operation</label>
              <input id="industry" name="industry" placeholder="e.g. Construction, warehousing, manufacturing" />
            </div>
            <div className="field">
              <label htmlFor="jurisdiction">Jurisdiction</label>
              <input id="jurisdiction" name="jurisdiction" placeholder="e.g. Federal / OSHA, Texas" />
            </div>
            <div className="field">
              <label htmlFor="hazards">Known hazards</label>
              <textarea id="hazards" name="hazards" rows={2} placeholder="List hazards this document should address." />
            </div>
            <div className="field">
              <label htmlFor="responsible_role">Responsible role / owner</label>
              <input id="responsible_role" name="responsible_role" placeholder="e.g. Site Safety Manager" />
            </div>
            <div className="field">
              <label htmlFor="company_standards">Company standards to incorporate</label>
              <textarea id="company_standards" name="company_standards" rows={2} placeholder="Paste any internal rules or standards to fold in." />
            </div>
            <div className="field">
              <label htmlFor="notes">Additional notes</label>
              <textarea id="notes" name="notes" rows={2} />
            </div>
          </>
        ) : null}

        <button className="button button-primary" disabled={submitting} type="submit" style={{ justifySelf: "start" }}>
          {submitting ? <Loader2 size={18} className="spin" /> : <FilePlus2 size={18} />}
          {submitting ? "Generating… (20–40s)" : "Generate Draft"}
        </button>
      </div>
    </form>
  );
}
