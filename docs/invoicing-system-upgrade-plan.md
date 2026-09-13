# Proposal-to-Invoice Upgrade Plan

Status: owner approved Phase 1 and the security-policy changes on 8 September 2026. Phase 1 is implemented and verified locally; the new migration remains unapplied pending the staging/release gate.

## Module declaration

```text
MODULE_ID: client_invoicing_upgrade
PURPOSE: Convert approved proposal lines into traceable partial invoices without double billing.
ROLES_ALLOWED: active portal owners, portal admins, and employees with both Finance module access and finance authorization
GROUP: Command
PATH_PREFIX: /employee/invoices and /employee/proposals
DATA_OBJECTS: client_proposals, client_proposal_revisions, client_invoices, client_invoice_line_items, company_finance_transactions, company_finance_authorized_users
WORKFLOW_STATES: proposal approved/accepted -> invoice draft -> issued -> paid or void
ACCEPTANCE_CRITERIA:
  - Finance users can select multiple approved proposal lines and bill a partial quantity.
  - The system shows proposed, reserved/invoiced, and remaining quantity and value per proposal line.
  - A transaction-safe write prevents duplicate or excess billing under concurrent use.
  - Each invoice line permanently identifies its accepted proposal revision and source line.
  - Issued invoice documents preserve the approved pricing snapshot and include reference-invoice essentials.
  - Unauthorized roles are denied at both the application and database layers.
```

## What the meeting actually requested

The actionable invoicing discussion is the section beginning around 00:57 and ending around 07:44. The Amazon interview, business-card equipment, personnel follow-ups, weekend scheduling, and other conversation are not product requirements.

The requested workflow is:

1. Finish and retain a numbered proposal that can be sent to the customer.
2. On the final proposal, select any combination of fee lines with checkboxes (the meeting called these “toggles,” but described multi-select checkboxes).
3. Enter the quantity being billed now, up to the approved quantity still available.
4. Generate an invoice containing only those selected quantities and lines.
5. Keep the unbilled balance open for later invoices.
6. Alert the responsible users when proposal lines remain unresolved.
7. Resolve open work by invoicing it, changing it through an approved change order, or closing it with a reason.
8. Retain an auditable, printable accounting record.

Working interpretation for partial quantities: billing 6 of 10 reserves/invoices 6 and leaves 4 available. Unit prices remain fixed to the accepted proposal; price or scope changes require a change order.

## Reference invoice findings

The supplied Wondfo invoice is a one-page consulting invoice with a branded header, seller and bill-to blocks, invoice/proposal references, consultant, job, payment terms, due date, dated service lines, hourly quantity, rate, totals, prepared-by text, and a closing message. Its arithmetic is correct: 25 hours at $125 totals $3,125.

Useful design requirements to carry forward:

- Branded logo/header and clear INVOICE title.
- Client contact/company/address and seller contact details.
- Invoice number, proposal number, issue date, due date, job, consultant, and payment terms.
- Service date, description, unit price, quantity/hours, and line total.
- Separate total quantity/hours, subtotal, tax, and total due.
- Prepared-by, agreement/PO reference, payment/remittance instructions, and closing note.
- Expandable rows, repeating headers on multipage output, and page numbering.

Do not reproduce the source invoice’s inconsistencies: “Due on receipt” conflicts with a due date 15 days later; the invoice body and filename use different numbers; the body uses year 2026 for a 2025 invoice; tax is typed as “NA”; and the service-agreement reference is blank. Continue using the repository’s current proposal-linked sequence (`PROPOSAL-01`, `PROPOSAL-02`, and so on) unless the owner records a different numbering decision.

## Current-system assessment

The repository already has proposal creation/versioning, proposal numbering, an invoice ledger, draft invoice editing, PDF/DOCX generation, audit events, invoice numbering, and in-progress Stripe work. Existing tests and TypeScript checking were green before this plan was written.

The main gaps are:

- Database RLS allows every portal employee to read and create invoices, while the UI promises finance-only access.
- Invoice creation reads the proposal’s mutable current form data rather than the accepted revision.
- Proposal lines lack durable source identifiers on invoice lines.
- Draft creation and line replacement use multiple database calls and can leave partial state on failure.
- Invoice and expected-income records are not reconciled through `company_finance_transactions.related_invoice_id`.
- Service dates are now present in both PDF and DOCX output; keep this covered by document-model tests.
- DOCX output lacks the logo used by PDF output.
- Issuing changes status but does not deliver an immutable invoice to the customer.
- Existing in-progress Stripe changes need duplicate-session, event-ordering, and refund tests before release.

## Delivery plan

### Phase 0 - security and business-rule gate (must precede release)

1. Approve a new migration that makes invoice-header, invoice-line, and payment policies match `getInvoiceAccess()` (the counter table has no direct authenticated policies):
   - owners: `super_admin`, `platform_admin`;
   - other active roles: Finance module access plus an entry in `company_finance_authorized_users`;
   - settlement/void/refund remains admin-only.
2. Add database allow/deny tests for owner, finance-authorized employee, ordinary employee, archived user, and anonymous access.
3. Confirm that accepted proposal revisions are the default billing authority. A non-accepted override, if allowed at all, must be admin-only, require a reason, and be audited.
4. Keep the current proposal-linked invoice number sequence. Do not import the contradictory year/filename behavior from the Wondfo file.

Exit gate: RLS tests pass and a staging rehearsal proves that current finance users retain access while ordinary employees are denied.

### Phase 1 - selected-line and partial-quantity invoicing

1. Give every accepted proposal fee line a durable identity using its immutable revision UUID plus zero-based fee-table order (`<revision UUID>:<line order>`), without altering displayed proposal content.
2. Add invoice-line provenance fields for source proposal, accepted revision, source line ID, approved quantity, and approved unit price.
3. Replace the legacy deposit/full/balance picker with a proposal billing panel that shows:
   - selection checkbox;
   - line description and unit;
   - approved quantity and unit price;
   - quantity reserved/invoiced;
   - quantity remaining;
   - quantity to bill now;
   - calculated line amount and invoice preview total.
4. Treat draft quantities as reservations. Issued and paid invoices remain consumed; deleting an unissued draft or voiding an invoice releases its quantities under an explicit audited rule.
5. Create the invoice header and lines through one transaction-safe database function that locks the proposal, validates the accepted revision, rechecks remaining quantities, inserts the snapshot, and returns the new invoice ID/number.
6. Add an idempotency key so a retry or double click returns the existing draft instead of creating a duplicate.
7. Lock generated source lines as a set. To change a draft allocation, delete the draft and generate a new selection; commercial changes use a change order.
8. Show open quantities and linked invoices on the proposal page.

Exit gate: two simultaneous requests cannot reserve more than the accepted quantity, failed writes leave no header or orphan lines, and generated invoices always reconcile to their selected lines.

### Phase 2 - accounting reconciliation and open-item control

1. Link each invoice or invoice allocation to the corresponding accepted-income schedule row through `related_invoice_id` or a dedicated allocation table when one schedule row spans several invoices.
2. Maintain explicit proposed, reserved, invoiced, paid, voided, adjusted, and remaining values from append-only allocations rather than editable totals.
3. Add change orders with before/after values, reason, author, approval, effective date, and new/changed line IDs.
4. Add “close without billing” with a mandatory reason and audit event.
5. Add an open-work queue filtered by client, proposal, owner, age, status, and next review date.
6. Add reminders only after cadence, recipients, snooze behavior, and escalation rules are approved.

Exit gate: proposal value, invoice allocations, expected income, received payments, adjustments, and remaining balance reconcile exactly.

### Phase 3 - document, delivery, and payment completion

1. Extend the canonical invoice document model first, then keep PDF, DOCX, customer page, and email in parity.
2. Add service date, AP contact/email, billing period, total quantity/hours, amount paid, balance due, remittance instructions, tax applicability/rate/jurisdiction, and a persisted payment link when applicable.
3. Add the company logo to DOCX and improve table typography while preserving the existing Reliance navy/gold visual system.
4. Make issuance create an immutable artifact snapshot, delivery record, recipient list, and resend/reminder history.
5. Add a tokenized customer invoice page/download that does not expose employee routes.
6. Complete Stripe only after enforcing one active checkout session, durable webhook event idempotency, ordered reconciliation, explicit refund fields/statuses, and manual ACH/check payment support.

Exit gate: create -> review -> issue -> deliver -> pay/record payment -> void/refund is auditable end to end, and PDF/DOCX/customer/email totals match.

## Test plan

- Unit: line IDs; remaining-quantity calculations; discounts/tax rounding; zero/fractional quantities; no-charge lines; currency formatting; due-date derivation.
- Component: multi-select behavior; partial quantity entry; maximum enforcement; disabled fully billed lines; retry-safe submit; accessible labels and keyboard operation.
- Server action: authentication, finance authorization, accepted-revision provenance, hostile line IDs, overbilling, duplicate idempotency key, and friendly constraint errors.
- Database integration: atomic rollback; concurrent reservations; invoice number allocation/reclaim; contract cap; void/delete release; immutable issued snapshots; finance-ledger reconciliation.
- RLS matrix: anonymous, ordinary employee, finance-authorized employee, admin, owner, and archived account across select/insert/update/delete.
- Document parity: service dates and every monetary field match across the canonical model, PDF, and DOCX; render fixtures with long descriptions and multipage tables.
- End to end: accepted proposal -> partial invoice -> remaining balance -> second invoice -> issue -> payment -> reconciliation.
- Regression: complete repository test suite, TypeScript checking, and production build.

## Migration and rollback strategy

All database work must be introduced in new migration files; previously applied migrations remain untouched. Each phase is rehearsed on a staging branch before production.

Rollback order:

1. Disable the selected-line UI with a feature flag while retaining read compatibility.
2. Revoke execution on new write functions and restore the prior application action.
3. Restore prior RLS policies from the migration’s explicit rollback block if access behavior must be reversed.
4. Leave additive provenance columns in place during rollback so historical evidence is not destroyed.
5. Never delete or renumber issued invoices. Reverse allocations with audited void/adjustment records.

## Decisions still needed

Resolved for Phase 1: the owner authorized the RLS correction; only the explicitly recorded accepted revision may be invoiced; and a partial quantity leaves its unbilled remainder open.

Still needed for later phases:

1. Define who may approve change orders, price overrides, voids, write-offs, and refunds.
2. Define reminder age/cadence, recipients, snooze period, and escalation.
3. Supply authoritative remittance instructions, legal payee, billing contact, tax treatment, and default payment terms.
4. Confirm whether the current in-progress Stripe work belongs in this release or a separate release.
