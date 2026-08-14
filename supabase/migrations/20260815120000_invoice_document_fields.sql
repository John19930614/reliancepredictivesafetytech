-- The fields a real invoice document has to print, and the basis a quantity
-- actually means something on.
--
-- MODULE_ID: active_companies (the invoice panel lives under /employee/clients,
--   which the active_companies catalog entry already covers by prefix.)
--
-- WHY THIS EXISTS. 20260814120000_client_workflow_and_invoices.sql gave the
-- Invoicing step a real numbered record — client, proposal, dates, lines, total.
-- What it does not carry is anything the printed document needs on its face:
-- who delivered the work, what job it was, the terms in words, the client's own
-- agreement or PO number to quote back at them, and who prepared it. Those were
-- being written into `notes` as free text, which is a place to put a sentence,
-- not a place to put a field a renderer can lay out.
--
-- AND WHAT A QUANTITY MEANS. A class quoted at 12 seats x $105 bills $1,260; if
-- 10 people turn up it bills $1,050, and the only honest way to get there is to
-- edit the quantity. But a $2,500 site retainer with a quantity of 1 must NOT
-- become $5,000 because somebody typed 2 into the same box. `qty_basis` is the
-- difference: it says whether the quantity multiplies the price ('attendee',
-- 'session', 'hour') or is only a label on a fixed fee ('flat'). The arithmetic
-- lives in lib/invoices/draft.ts (lineTotalFor) and is enforced server-side in
-- updateDraftInvoiceLines — the browser never posts a total.
--
-- STRICTLY ADDITIVE. No existing column, constraint, index, policy, trigger or
-- function is dropped or altered. In particular the unique index
-- client_invoices_one_live_per_kind, the `kind` column and
-- allocate_client_invoice_number() are untouched: invoice numbering is a
-- separate decision and this migration takes no position on it.
--
-- NO NEW RLS. Both tables already have policies, and the ones that matter here
-- are already exactly right: client_invoice_line_items may be inserted, updated
-- and deleted only while the parent invoice is status='draft', which is the
-- permission the editing action needs and the only one it should have. New
-- columns on an existing table inherit that table's policies, so there is
-- nothing to add and nothing to loosen. client_invoices keeps its updated_at
-- trigger; client_invoice_line_items still has no updated_at column, which is
-- deliberate — a line is a fact of the invoice, not a document of its own.
--
-- ROLLBACK:
--   alter table public.client_invoice_line_items
--     drop column if exists unit,
--     drop column if exists qty_basis,
--     drop column if exists service_date;
--   alter table public.client_invoices
--     drop column if exists consultant_name,
--     drop column if exists job_name,
--     drop column if exists payment_terms,
--     drop column if exists client_agreement_ref,
--     drop column if exists prepared_by,
--     drop column if exists tax_amount;

/* -------------------------------------------------------------------------- */
/* 1. What the invoice document says on its face                              */
/* -------------------------------------------------------------------------- */

-- All nullable and all without a default. These are facts about one engagement,
-- and an invoice that predates the columns genuinely does not have them; a
-- default would put a confident-looking blank or a stamp on every historical row
-- and the renderer could no longer tell "not recorded" from "recorded as empty".
--
-- tax_amount is the exception and is NOT NULL DEFAULT 0: it participates in
-- arithmetic (total = subtotal + tax_amount), and a null in a sum is a null.
-- Zero is also the truthful answer for every row that predates the column —
-- none of them had tax added.
alter table public.client_invoices
  add column if not exists consultant_name text
    check (consultant_name is null or char_length(consultant_name) <= 200),
  add column if not exists job_name text
    check (job_name is null or char_length(job_name) <= 300),
  add column if not exists payment_terms text
    check (payment_terms is null or char_length(payment_terms) <= 1000),
  add column if not exists client_agreement_ref text
    check (client_agreement_ref is null or char_length(client_agreement_ref) <= 120),
  add column if not exists prepared_by text
    check (prepared_by is null or char_length(prepared_by) <= 200),
  add column if not exists tax_amount numeric(14, 2) not null default 0
    check (tax_amount >= 0);

comment on column public.client_invoices.consultant_name is
  'Who delivered the work this invoice bills for, as the client should see it printed. A person, not the account owner and not a role.';

comment on column public.client_invoices.job_name is
  'The client''s name for the job or site this invoice covers, so an accounts-payable clerk can match it to their own record without opening the contract.';

comment on column public.client_invoices.payment_terms is
  'The terms in words, printed verbatim ("Net 30 from invoice date", "Due upon receipt"). The DATE the invoice is due is due_date; this is the clause, and the two are set together so the document cannot contradict itself.';

-- The single most misread column on this table if it is left unexplained.
comment on column public.client_invoices.client_agreement_ref is
  'The CLIENT''s own agreement, contract or purchase-order number, if they issue one — never ours. Many clients will not pay an invoice that does not quote their PO number back at them. Our own references are invoice_number and the linked proposal''s proposal_number; do not put either here.';

comment on column public.client_invoices.prepared_by is
  'Who prepared this invoice, for the document. The AUDITABLE answer is created_by / issued_by, which are auth.users references a person cannot type over; this is the printed courtesy line and is not evidence of anything.';

comment on column public.client_invoices.tax_amount is
  'Tax added to the line subtotal. The invariant the application maintains is total = subtotal + tax_amount, recomputed server-side from the stored lines on every edit (see updateDraftInvoiceLines). Not a rate: a rate would have to be re-derived on every read and would drift from what the client was actually charged.';

/* -------------------------------------------------------------------------- */
/* 2. What a line quantity means                                              */
/* -------------------------------------------------------------------------- */

-- unit and qty_basis are NOT NULL with defaults because every line has an answer
-- to both, including the lines that already exist: an empty unit is "no unit
-- named", and 'flat' is the SAFE default for a row written before the column
-- existed. Defaulting to a scaling basis instead would silently re-price every
-- historical line the first time anyone touched a quantity on it.
--
-- service_date is nullable: plenty of lines (a retainer, a licence) are not
-- delivered on a day.
alter table public.client_invoice_line_items
  add column if not exists unit text not null default ''
    check (char_length(unit) <= 60),
  add column if not exists qty_basis text not null default 'flat'
    check (qty_basis in ('session', 'attendee', 'hour', 'flat')),
  add column if not exists service_date date;

comment on column public.client_invoice_line_items.unit is
  'What one of this line is, as printed: "Seat", "Session", "Hour", "Mile". Free text and stored on the line rather than looked up, so a repriced or renamed catalog cannot relabel an invoice already raised.';

comment on column public.client_invoice_line_items.qty_basis is
  'Whether quantity multiplies unit_amount. session/attendee/hour scale — 10 attendees at 105.00 is 1050.00. flat does NOT — a fixed fee stays at unit_amount whatever the quantity says, so a stray 2 in the quantity box cannot double a retainer. Enforced in lib/invoices/draft.ts (lineTotalFor), never trusted from the browser.';

comment on column public.client_invoice_line_items.service_date is
  'The day this line was delivered, when it was delivered on one — the date a client matches against their own attendance sheet. Null for lines that have no single day.';
