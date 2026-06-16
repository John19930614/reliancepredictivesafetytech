-- employee_time_cards: add composite indexes for common query patterns
--
-- Existing indexes cover:
--   (employee_user_id, week_start desc) -- employee-scoped week lookups
--   (status)                            -- single-status filter
--
-- Missing patterns found in app queries:
--   payroll/page.tsx:    WHERE status = 'approved'   ORDER BY week_start DESC LIMIT 200
--   payroll/actions.ts:  WHERE status = 'approved'
--   command-context.ts:  WHERE status IN ('submitted', 'rejected')
--   time-cards/page.tsx: ORDER BY week_start DESC LIMIT 120  (admin list, no filter)

create index if not exists idx_employee_time_cards_status_week
  on public.employee_time_cards(status, week_start desc);

create index if not exists idx_employee_time_cards_week_start
  on public.employee_time_cards(week_start desc);
