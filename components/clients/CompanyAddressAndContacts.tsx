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
import { Hash, Lock, MapPin, Plus, Save, Star, Trash2, Users } from "lucide-react";
import {
  assignCompanySlug,
  deleteCompanyContact,
  saveCompanyAddress,
  saveCompanyContact,
  setPrimaryCompanyContact,
  type CompanyActionResult,
} from "@/app/employee/clients/[id]/actions";
import { formatAddressLines } from "@/lib/proposals/client-contacts";
import {
  companySlugPattern,
  companySlugRule,
  formatProposalNumber,
  normalizeCompanySlug,
  suggestCompanySlug,
} from "@/lib/proposals/company-slug";

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
  companySlug = null,
  slugLocked = false,
  year,
  address,
  contacts,
}: {
  clientId: string;
  clientName?: string;
  /** Legacy 2–3 letter moniker (HUN). Displayed read-only; never assigned here now. */
  clientCode?: string | null;
  companySlug?: string | null;
  /** True once a proposal has been numbered under the slug — the database will refuse a change. */
  slugLocked?: boolean;
  /** Resolved on the server so the example numbers cannot disagree across a hydration boundary. */
  year: number;
  address: CompanyAddressFields;
  contacts: CompanyContactRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const legacyCode = normalizeCompanySlug(clientCode);
  const [savedSlug, setSavedSlug] = useState(() => normalizeCompanySlug(companySlug));
  const [slugDraft, setSlugDraft] = useState(() => normalizeCompanySlug(companySlug) || suggestCompanySlug(clientName));
  // Assigning a slug renumbers this company's drafts onto it, which ISSUES
  // numbers — so the slug the operator just set is locked from that moment, and
  // the panel must stop offering to change it without waiting for a reload.
  // Only when something was actually renumbered: a company with no drafts has
  // had no number issued and its slug is still free to correct.
  const [lockedByThisSession, setLockedByThisSession] = useState(false);

  // The lock is the database's call, not this component's: the counter table it
  // reads is closed to every signed-in user, so the page can only report what it
  // can see (documents already numbered under the slug). If it guesses wrong and
  // shows the form, the trigger rejects the write and assignCompanySlug says so.
  const slugIsLocked = (slugLocked || lockedByThisSession) && savedSlug !== "";

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

  function run<T extends CompanyActionResult>(
    action: () => Promise<T>,
    success: string,
    after?: (result: T) => void,
  ) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setMessage(success);
      after?.(result);
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
      {/* Proposal numbering — the company slug                            */}
      {/* ---------------------------------------------------------------- */}
      <h3 style={{ fontSize: "1rem", marginTop: 18 }}>
        <Hash size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Proposal numbering
      </h3>

      {slugIsLocked ? (
        // Read-only, with the reason. The slug is not "an admin setting someone
        // forgot to unlock" — documents in the client's hands carry it.
        <div className="portal-card" style={{ marginTop: 8 }}>
          <p style={{ marginTop: 0, fontSize: "0.9rem" }}>
            <Lock size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            This company&apos;s slug is fixed. Proposals have already been issued under it, and renaming it would leave
            those numbers pointing at a company that no longer exists under that name.
          </p>
          <div className="data-table-wrapper">
            <table className="data-table">
              <tbody>
                <tr>
                  <th scope="row">Company slug</th>
                  <td style={{ letterSpacing: "0.08em" }}>
                    <strong>{savedSlug}</strong>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Proposal numbers</th>
                  <td>
                    {formatProposalNumber(savedSlug, year, 1)}, {formatProposalNumber(savedSlug, year, 2)}, … — the
                    sequence restarts at 001 each January.
                  </td>
                </tr>
                {legacyCode ? (
                  <tr>
                    <th scope="row">Legacy code</th>
                    <td>
                      <strong>{legacyCode}</strong> — proposals numbered before 14 August 2026 use it ({legacyCode}-01).
                      Kept so those references stay explicable; nothing new is numbered under it.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const attempted = normalizeCompanySlug(slugDraft);
            const previous = savedSlug;
            run(
              // The third argument is the compare-and-set: "" means "assign,
              // and only if this company still has none". Passing the value we
              // rendered means a change cannot silently clobber one somebody
              // else made while this page sat open.
              () => assignCompanySlug(clientId, attempted, previous || null),
              `Slug ${attempted} saved — this company's draft proposals now number from ${formatProposalNumber(attempted, year, 1)}.`,
              (result) => {
                setSavedSlug(attempted);
                setSlugDraft(attempted);
                if ((result.renumbered ?? 0) > 0) setLockedByThisSession(true);
              },
            );
          }}
        >
          <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem", marginTop: 6 }}>
            {savedSlug
              ? "Still editable — no proposal has been numbered under this slug yet. Once one is, it is fixed for good."
              : "No slug yet."}{" "}
            {companySlugRule} Numbers then run{" "}
            {formatProposalNumber(slugDraft || "WONDFOUSA", year, 1)},{" "}
            {formatProposalNumber(slugDraft || "WONDFOUSA", year, 2)}, … per company per year.
          </p>
          <div className="form-grid" style={{ gridTemplateColumns: "minmax(200px, 360px) auto", alignItems: "end" }}>
            <div className="field">
              <label htmlFor="company-slug">Company slug</label>
              <input
                id="company-slug"
                value={slugDraft}
                // Normalized on the way in, not on submit: normalizeCompanySlug
                // DELETES spaces and punctuation rather than trimming them, so
                // pasting "Wondfo USA, Inc." must visibly become WONDFOUSAINC
                // here rather than being silently rewritten after the fact.
                onChange={(event) => setSlugDraft(normalizeCompanySlug(event.target.value))}
                maxLength={40}
                pattern={companySlugPattern.source.replace(/^\^|\$$/g, "")}
                title={companySlugRule}
                placeholder="e.g. WONDFOUSA"
                disabled={isPending}
                style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
                required
              />
            </div>
            <button className="button button-primary" disabled={isPending} type="submit" style={{ justifySelf: "start" }}>
              <Save size={16} /> {savedSlug ? "Change slug" : "Assign slug"}
            </button>
          </div>
          {legacyCode ? (
            <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", marginTop: 4 }}>
              Legacy code <strong>{legacyCode}</strong> — proposals numbered before 14 August 2026 use it ({legacyCode}
              -01). Read-only, and kept so those references stay explicable.
            </p>
          ) : null}
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
