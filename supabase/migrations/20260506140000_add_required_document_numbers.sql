alter table public.company_documents
  add column if not exists document_number text;

create unique index if not exists company_documents_document_number_unique_idx
on public.company_documents (lower(btrim(document_number)))
where nullif(btrim(document_number), '') is not null;
