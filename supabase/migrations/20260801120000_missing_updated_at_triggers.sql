-- Correction: attach the standard updated_at trigger to the four mutable tables
-- that declare an `updated_at` column but never had a BEFORE UPDATE trigger.
--
-- Without the trigger these columns keep their INSERT-time default of now()
-- forever, so `updated_at` silently reports the creation time and cannot be
-- used for staleness checks, sync cursors, or audit reconstruction.
--
-- Reuses the existing public.set_updated_at() function (defined in the initial
-- schema migration) so behaviour matches the other 87 tables.
--
-- Rollback:
--   drop trigger if exists set_employee_calendar_events_updated_at on public.employee_calendar_events;
--   drop trigger if exists set_performance_review_cycles_updated_at on public.performance_review_cycles;
--   drop trigger if exists set_performance_reviews_updated_at on public.performance_reviews;
--   drop trigger if exists set_training_certifications_updated_at on public.training_certifications;

drop trigger if exists set_employee_calendar_events_updated_at on public.employee_calendar_events;
create trigger set_employee_calendar_events_updated_at
before update on public.employee_calendar_events
for each row execute function public.set_updated_at();

drop trigger if exists set_performance_review_cycles_updated_at on public.performance_review_cycles;
create trigger set_performance_review_cycles_updated_at
before update on public.performance_review_cycles
for each row execute function public.set_updated_at();

drop trigger if exists set_performance_reviews_updated_at on public.performance_reviews;
create trigger set_performance_reviews_updated_at
before update on public.performance_reviews
for each row execute function public.set_updated_at();

drop trigger if exists set_training_certifications_updated_at on public.training_certifications;
create trigger set_training_certifications_updated_at
before update on public.training_certifications
for each row execute function public.set_updated_at();
