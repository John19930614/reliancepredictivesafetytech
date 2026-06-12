alter table employee_payroll_run_items
  add column federal_tax numeric(12,2) not null default 0 check (federal_tax >= 0),
  add column state_tax numeric(12,2) not null default 0 check (state_tax >= 0),
  add column social_security numeric(12,2) not null default 0 check (social_security >= 0),
  add column medicare numeric(12,2) not null default 0 check (medicare >= 0),
  add column other_deductions numeric(12,2) not null default 0 check (other_deductions >= 0),
  add column net_pay numeric(12,2) generated always as (
    gross_pay - federal_tax - state_tax - social_security - medicare - other_deductions
  ) stored;
