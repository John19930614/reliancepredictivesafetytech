"use client";

// Address and people on a client company record.
//
// This is the "spot we pull the company information from" for proposals: the
// Proposal Builder reads both halves of this panel to fill in the document's
// Prepared For block. Before it existed, company_clients had no address columns
// at all and room for exactly one person, so the proposal generator filled the
// gap with hardcoded placeholder text ("Street Address / City, State ZIP",
// "client@email.com") that the editor then autosaved and PRINTED on documents.
//
// Writes go through Server Actions (app/employee/clients/[id]/actions.ts)
// rather than the direct browser Supabase calls the rest of ClientDetailManager
// still uses: this data is printed verbatim on documents a client signs, so its
// bounds are enforced server-side too.

import { useState, useTransition } from "react";
import { Hash, MapPin, Plus, Save, Star, Trash2, Users } from "lucide-react";
import {
  assignClientCode,
  deleteCompanyContact,
  saveCompanyAddress,
  saveCompanyContact,
  setPrimaryCompanyContact,
  type CompanyActionResult,
} from "@/app/employee/clients/[id]/actions";
import { formatAddressLines } from "@/lib/proposals/client-contacts";
import { clientCodeRule, formatClientDocumentNumber, formatClientInvoiceNumber, suggestClientCode } from "@/lib/proposals/client-codes";

export interface CompanyContactRow {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_primary: boolean | null;
}

export interface CompanyAddressFields {
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  website: string | null;
}

const emptyDraft = { id: "", name: "", title: "", email: "", phone: "", notes: "" };

export function CompanyAddressAndContacts({
  clientId,
  clientName = "",
  clientCode = null,
  address,
  contacts,
}: {
  clientId: string;
  clientName?: string;
  clientCode?: string | null;
  address: CompanyAddressFields;
  contacts: CompanyContactRow[];
}) {
  // Only ever used in example copy — the real number takes the year the
  // document is issued in, allocated by the database.
  const exampleYear = new Date().getUTCFullYear();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [savedCode, setSavedCode] = useState((clientCode ?? "").trim().toUpperCase());
  const [codeDraft, setCodeDraft] = useState(() => savedCode || suggestClientCode(clientName));

  const [addressDraft, setAddressDraft] = useState({
    address_line1: address.address_line1 ?? "",
    address_line2: address.address_line2 ?? "",
    city: address.city ?? "",
    state: address.state ?? "",
    postal_code: address.postal_code ?? "",
    country: address.country ?? "",
    website: address.website ?? "",
  });

  const [contactDraft, setContactDraft] = useState(emptyDraft);

  const preview = formatAddressLines(addressDraft);

  function run(action: () => Promise<CompanyActionResult>, success: string, after?: () => void) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setMessage(success);
      after?.();
    });
  }

  return (
    <div className="form-panel" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>Address &amp; contacts</h2>
      <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem" }}>
        Used to fill in the <strong>Prepared For</strong> block on every proposal for this company — the address and
        whichever people that proposal is addressed to.
      </p>

      {error ? <div className="success-box portal-alert portal-alert-error">{error}</div> : null}
      {message ? <div className="success-box portal-alert">{message}</div> : null}

      {/* ---------------------------------------------------------------- */}
      {/* Proposal code                                                    */}
      {/* ---------------------------------------------------------------- */}
      <h3 style={{ fontSize: "1rem", marginTop: 18 }}>
        <Hash size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Proposal code
      </h3>
      {savedCode ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem", marginTop: 6 }}>
          Documents for this company are numbered <strong>{formatClientDocumentNumber(savedCode, exampleYear, 1)}</strong>{" "}
          for proposals and <strong>{formatClientInvoiceNumber(savedCode, exampleYear, 1)}</strong> for invoices. The
          sequence restarts each January; the code stays fixed once documents are numbered under it.
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const attempted = codeDraft;
            run(
              () => assignClientCode(clientId, attempted),
              `Code ${attempted.trim()} assigned — this company's draft proposals now number from ${formatClientDocumentNumber(attempted, exampleYear, 1)}.`,
              () => setSavedCode(attempted.trim().toUpperCase()),
            );
          }}
        >
          <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem", marginTop: 6 }}>
            No code yet. Whoever writes this company&apos;s first proposal assigns it — {clientCodeRule} Numbers then run{" "}
            {formatClientDocumentNumber(codeDraft || "Wondfo", exampleYear, 1)},{" "}
            {formatClientInvoiceNumber(codeDraft || "Wondfo", exampleYear, 1)}, … per
            company.
          </p>
          <div className="form-grid" style={{ gridTemplateColumns: "minmax(120px, 200px) auto", alignItems: "end" }}>
            <div className="field">
              <label htmlFor="company-client-code">Code</label>
              <input
                id="company-client-code"
                value={codeDraft}
                onChange={(event) => setCodeDraft(event.target.value.toUpperCase())}
                maxLength={3}
                pattern="[A-Za-z]{2,3}"
                title={clientCodeRule}
                placeholder="e.g. HUN"
                style={{ textTransform: "uppercase", letterSpacing: "0.12em" }}
                required
              />
            </div>
            <button className="button button-primary" disabled={isPending} type="submit" style={{ justifySelf: "start" }}>
              <Save size={16} /> Assign code
            </button>
          </div>
        </form>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Address                                                          */}
      {/* ---------------------------------------------------------------- */}
      <h3 style={{ fontSize: "1rem", marginTop: 18 }}>
        <MapPin size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Company address
      </h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(() => saveCompanyAddress(clientId, addressDraft), "Address saved.");
        }}
      >
        <div className="form-grid">
          <div className="field">
            <label htmlFor="company-address1">Street address</label>
            <input
              id="company-address1"
              value={addressDraft.address_line1}
              disabled={isPending}
              onChange={(e) => setAddressDraft((d) => ({ ...d, address_line1: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="company-address2">Suite / floor</label>
            <input
              id="company-address2"
              value={addressDraft.address_line2}
              disabled={isPending}
              onChange={(e) => setAddressDraft((d) => ({ ...d, address_line2: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="company-city">City</label>
            <input
              id="company-city"
              value={addressDraft.city}
              disabled={isPending}
              onChange={(e) => setAddressDraft((d) => ({ ...d, city: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="company-state">State</label>
            <input
              id="company-state"
              value={addressDraft.state}
              disabled={isPending}
              onChange={(e) => setAddressDraft((d) => ({ ...d, state: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="company-zip">ZIP code</label>
            <input
              id="company-zip"
              value={addressDraft.postal_code}
              disabled={isPending}
              onChange={(e) => setAddressDraft((d) => ({ ...d, postal_code: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="company-country">Country</label>
            <input
              id="company-country"
              value={addressDraft.country}
              disabled={isPending}
              placeholder="Leave blank for US"
              onChange={(e) => setAddressDraft((d) => ({ ...d, country: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="company-website">Website</label>
            <input
              id="company-website"
              value={addressDraft.website}
              disabled={isPending}
              onChange={(e) => setAddressDraft((d) => ({ ...d, website: e.target.value }))}
            />
          </div>
        </div>

        {/* Shown because the document formats these parts rather than printing
            the fields verbatim — "Milwaukee, WI 53202" is one line, and a
            blank country is omitted rather than left as an empty row. */}
        <div className="field">
          <label>How it will print on a proposal</label>
          {preview.length > 0 ? (
            <div style={{ fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>{preview.join("\n")}</div>
          ) : (
            <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", margin: 0 }}>
              Nothing yet — proposals for this company will show the company name with no address under it.
            </p>
          )}
        </div>

        <button className="button button-primary" type="submit" disabled={isPending}>
          <Save size={16} /> Save address
        </button>
      </form>

      {/* ---------------------------------------------------------------- */}
      {/* Contacts                                                         */}
      {/* ---------------------------------------------------------------- */}
      <h3 style={{ fontSize: "1rem", marginTop: 24 }}>
        <Users size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        People at this company
      </h3>
      <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem" }}>
        A proposal can be addressed to several of them at once. The <strong>primary</strong> contact is the one a new
        proposal starts addressed to.
      </p>

      {contacts.length === 0 ? (
        <div className="empty-state">Nobody recorded yet. Add the first contact below.</div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Email</th>
                <th>Phone</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td>
                    {contact.name}
                    {contact.is_primary ? (
                      <span className="badge badge-green" style={{ marginLeft: 6 }}>
                        Primary
                      </span>
                    ) : null}
                  </td>
                  <td>{contact.title || "—"}</td>
                  <td>{contact.email || "—"}</td>
                  <td>{contact.phone || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="button button-light"
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        setContactDraft({
                          id: contact.id,
                          name: contact.name ?? "",
                          title: contact.title ?? "",
                          email: contact.email ?? "",
                          phone: contact.phone ?? "",
                          notes: contact.notes ?? "",
                        })
                      }
                    >
                      Edit
                    </button>{" "}
                    {!contact.is_primary ? (
                      <button
                        className="button button-light"
                        type="button"
                        disabled={isPending}
                        title="Make this the default addressee for new proposals"
                        onClick={() =>
                          run(
                            () => setPrimaryCompanyContact(clientId, contact.id),
                            `${contact.name} is now the primary contact.`,
                          )
                        }
                      >
                        <Star size={14} /> Primary
                      </button>
                    ) : null}{" "}
                    <button
                      className="button button-light"
                      type="button"
                      disabled={isPending}
                      style={{ color: "#ef4444" }}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Remove ${contact.name} from this company?\n\nProposals already addressed to them are unaffected — a proposal stores the name it was written with.`,
                          )
                        ) {
                          return;
                        }
                        run(() => deleteCompanyContact(clientId, contact.id), `${contact.name} removed.`, () => {
                          if (contactDraft.id === contact.id) setContactDraft(emptyDraft);
                        });
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        style={{ marginTop: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          const editing = contactDraft.id !== "";
          run(
            () =>
              saveCompanyContact(clientId, {
                id: contactDraft.id || null,
                name: contactDraft.name,
                title: contactDraft.title,
                email: contactDraft.email,
                phone: contactDraft.phone,
                notes: contactDraft.notes,
              }),
            editing ? "Contact updated." : "Contact added.",
            () => setContactDraft(emptyDraft),
          );
        }}
      >
        <h4 style={{ margin: "0 0 8px", fontSize: "0.95rem" }}>
          {contactDraft.id ? `Editing ${contactDraft.name || "contact"}` : "Add a contact"}
        </h4>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="contact-name">Name</label>
            <input
              id="contact-name"
              required
              value={contactDraft.name}
              disabled={isPending}
              onChange={(e) => setContactDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="contact-title">Title</label>
            <input
              id="contact-title"
              value={contactDraft.title}
              disabled={isPending}
              placeholder="Safety Director"
              onChange={(e) => setContactDraft((d) => ({ ...d, title: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="contact-email">Email</label>
            <input
              id="contact-email"
              type="email"
              value={contactDraft.email}
              disabled={isPending}
              onChange={(e) => setContactDraft((d) => ({ ...d, email: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="contact-phone">Phone</label>
            <input
              id="contact-phone"
              value={contactDraft.phone}
              disabled={isPending}
              onChange={(e) => setContactDraft((d) => ({ ...d, phone: e.target.value }))}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="contact-notes">Internal note</label>
          <input
            id="contact-notes"
            value={contactDraft.notes}
            disabled={isPending}
            placeholder="Never printed on a proposal"
            onChange={(e) => setContactDraft((d) => ({ ...d, notes: e.target.value }))}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button button-primary" type="submit" disabled={isPending}>
            <Plus size={16} /> {contactDraft.id ? "Save contact" : "Add contact"}
          </button>
          {contactDraft.id ? (
            <button
              className="button button-light"
              type="button"
              disabled={isPending}
              onClick={() => setContactDraft(emptyDraft)}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
