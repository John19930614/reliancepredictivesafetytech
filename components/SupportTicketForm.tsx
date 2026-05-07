"use client";

import { useState } from "react";
import { LifeBuoy, Send } from "lucide-react";
import { supportTicketCategories, supportTicketPriorities } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";

type FormState = "idle" | "submitting" | "success" | "error";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export function SupportTicketForm() {
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    setState("submitting");
    setMessage("");

    const formData = new FormData(form);
    const payload = {
      submitter_name: clean(formData.get("submitter_name")),
      submitter_email: clean(formData.get("submitter_email")),
      submitter_phone: clean(formData.get("submitter_phone")) || null,
      company: clean(formData.get("company")) || null,
      subject: clean(formData.get("subject")),
      category: clean(formData.get("category")) || "Other",
      priority: clean(formData.get("priority")) || "normal",
      issue_url: clean(formData.get("issue_url")) || null,
      message: clean(formData.get("message")),
    };

    const supabase = createClient();

    if (!supabase) {
      setState("error");
      setMessage("Support tickets need Supabase connected before they can be submitted.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("support_tickets").insert({
      ...payload,
      submitted_by_user_id: user?.id ?? null,
    });

    if (error) {
      setState("error");
      setMessage("We could not submit the ticket yet. Please try again or email support directly.");
      return;
    }

    setState("success");
    setMessage("Your support ticket was submitted and routed to the Reliance support inbox.");
    form.reset();
  }

  return (
    <form className="form-panel support-ticket-form" onSubmit={handleSubmit}>
      <div className="form-title-row">
        <LifeBuoy aria-hidden="true" size={22} />
        <div>
          <h2>Tech support ticket</h2>
          <p>Submit platform issues, access problems, and product-support requests.</p>
        </div>
      </div>

      {message ? <div className={`success-box ${state === "error" ? "portal-alert-error" : ""}`}>{message}</div> : null}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="support-name">Name</label>
          <input id="support-name" name="submitter_name" required />
        </div>
        <div className="field">
          <label htmlFor="support-company">Company</label>
          <input id="support-company" name="company" />
        </div>
        <div className="field">
          <label htmlFor="support-email">Email</label>
          <input id="support-email" name="submitter_email" type="email" required />
        </div>
        <div className="field">
          <label htmlFor="support-phone">Phone</label>
          <input id="support-phone" name="submitter_phone" type="tel" />
        </div>
        <div className="field">
          <label htmlFor="support-category">Category</label>
          <select id="support-category" name="category" defaultValue="Bug report">
            {supportTicketCategories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="support-priority">Priority</label>
          <select id="support-priority" name="priority" defaultValue="normal">
            {supportTicketPriorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority.charAt(0).toUpperCase() + priority.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="field-full">
          <label htmlFor="support-subject">Subject</label>
          <input id="support-subject" name="subject" required />
        </div>
        <div className="field-full">
          <label htmlFor="support-url">Page or account area</label>
          <input id="support-url" name="issue_url" placeholder="Optional URL or screen name" />
        </div>
        <div className="field-full">
          <label htmlFor="support-message">What happened?</label>
          <textarea id="support-message" name="message" required />
        </div>
        <div className="field-full">
          <button className="button button-primary" disabled={state === "submitting"} type="submit">
            <Send size={18} />
            {state === "submitting" ? "Submitting..." : "Submit Support Ticket"}
          </button>
        </div>
      </div>
    </form>
  );
}
