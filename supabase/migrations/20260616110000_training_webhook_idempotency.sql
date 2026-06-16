-- Prevent duplicate records from repeated webhook deliveries.
--
-- training_completions: a given learner can only have one completion record
-- per (user, course, timestamp) triplet. Duplicate webhook deliveries must
-- not create additional rows.
--
-- training_certifications: each completion produces at most one certificate.
-- The unique constraint on completion_id lets us upsert safely on retry.

alter table training_completions
  add constraint training_completions_lms_event_unique
  unique (external_lms_user_id, external_lms_course_id, completed_at);

alter table training_certifications
  add constraint training_certifications_completion_id_unique
  unique (completion_id);
