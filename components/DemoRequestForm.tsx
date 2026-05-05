"use client";

import { useMemo, useState } from "react";
import { Send } from "lucide-react";
import { products } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";

type FormState = "idle" | "submitting" | "success" | "error";

export function DemoRequestForm() {
  const [state, setState] = useState<FormState>("idle");
  const [message, setMessage] = useState("");
  const productNames = useMemo(() => products.map((product) => product.title), []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("submitting");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const interestedProducts = formData.getAll("interested_products").map(String);
    const payload = {
      name: String(formData.get("name") ?? ""),
      company: String(formData.get("company") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      role: String(formData.get("role") ?? ""),
      company_type: String(formData.get("company_type") ?? ""),
      interested_products: interestedProducts,
      message: String(formData.get("message") ?? ""),
    };

    const supabase = createClient();

    if (!supabase) {
      setState("success");
      setMessage("Demo request captured in preview mode. Connect Supabase to store requests automatically.");
      event.currentTarget.reset();
      return;
    }

    const { error } = await supabase.from("demo_requests").insert(payload);

    if (error) {
      setState("error");
      setMessage("We could not save the request yet. Please try again or email the Reliance team directly.");
      return;
    }

    setState("success");
    setMessage("Thank you. Your request was received and the Reliance team will follow up.");
    event.currentTarget.reset();
  }

  return (
    <form className="form-panel" onSubmit={handleSubmit}>
      {state === "success" ? <div className="success-box">{message}</div> : null}
      {state === "error" ? <div className="success-box">{message}</div> : null}

      <div className="form-grid" style={{ marginTop: state === "idle" ? 0 : 16 }}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" required />
        </div>
        <div className="field">
          <label htmlFor="company">Company</label>
          <input id="company" name="company" />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" type="tel" />
        </div>
        <div className="field">
          <label htmlFor="role">Role</label>
          <input id="role" name="role" />
        </div>
        <div className="field">
          <label htmlFor="company_type">Company type</label>
          <select id="company_type" name="company_type" defaultValue="">
            <option value="" disabled>
              Select one
            </option>
            <option>General contractor</option>
            <option>Subcontractor</option>
            <option>Project owner</option>
            <option>Safety consultant</option>
            <option>Pharma / biotech</option>
            <option>Other</option>
          </select>
        </div>

        <div className="field-full">
          <label>Interested products</label>
          <div className="checkbox-grid">
            {productNames.map((product) => (
              <label className="checkbox-pill" key={product}>
                <input name="interested_products" type="checkbox" value={product} />
                {product}
              </label>
            ))}
          </div>
        </div>

        <div className="field-full">
          <label htmlFor="message">Message</label>
          <textarea id="message" name="message" />
        </div>

        <div className="field-full">
          <button className="button button-primary" disabled={state === "submitting"} type="submit">
            <Send size={18} />
            {state === "submitting" ? "Submitting..." : "Submit Demo Request"}
          </button>
        </div>
      </div>
    </form>
  );
}
