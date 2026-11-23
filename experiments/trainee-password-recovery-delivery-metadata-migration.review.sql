-- REVIEW ONLY — DO NOT EXECUTE YET
-- TEST project: udptdznbvewkublvzmtm
-- Purpose: additive delivery metadata + stronger open-request uniqueness.
-- Preconditions: reviewed aggregate audit on 2026-11-22 found zero duplicate open trainees and zero processing rows.
-- One approved request exists. This migration deliberately leaves its token/status unchanged and leaves delivery_state NULL.
-- No production project. No SMS. No Auth changes.

-- Stage 1: additive nullable metadata. Legacy rows remain NULL and therefore cannot pass a future reset gate requiring delivery_state='sent'.
ALTER TABLE public.trainee_password_recovery_requests
  ADD COLUMN IF NOT EXISTS delivery_state text,
  ADD COLUMN IF NOT EXISTS delivery_attempt_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_updated_at timestamptz;

-- Nullable is intentional for legacy rows. New application code must set queued + attempt UUID atomically on approval.
ALTER TABLE public.trainee_password_recovery_requests
  ADD CONSTRAINT trainee_password_recovery_delivery_state_check
  CHECK (delivery_state IS NULL OR delivery_state IN ('not_started','queued','sent','uncertain','failed'))
  NOT VALID;

ALTER TABLE public.trainee_password_recovery_requests
  VALIDATE CONSTRAINT trainee_password_recovery_delivery_state_check;

-- Stage 2: create the stronger unique invariant before removing the old index.
-- This is a regular index build, not CONCURRENTLY, so it can run inside a transactional migration.
-- It takes a write-blocking table lock while building; schedule only in the disposable TEST project.
CREATE UNIQUE INDEX trainee_password_recovery_one_open_lifecycle_per_trainee
  ON public.trainee_password_recovery_requests (trainee_id)
  WHERE status IN ('pending','approved','processing');

-- Drop the narrower predecessor only after the stronger index has been created successfully.
DROP INDEX public.trainee_password_recovery_one_open_request_per_trainee;

-- Post-migration verification (run separately, read-only):
-- 1) pg_index.indisvalid AND indisready for the new index.
-- 2) pg_get_indexdef confirms predicate includes pending, approved, processing.
-- 3) RLS, policies, owner, grants, FK and unrelated indexes are unchanged.
-- 4) Existing approved row remains approved with delivery_state NULL; do not promote it to sent.

-- Rollback plan (manual, only after checking no processing rows and no new states depend on it):
-- CREATE UNIQUE INDEX trainee_password_recovery_one_open_request_per_trainee
--   ON public.trainee_password_recovery_requests (trainee_id)
--   WHERE status IN ('pending','approved');
-- DROP INDEX public.trainee_password_recovery_one_open_lifecycle_per_trainee;
-- ALTER TABLE public.trainee_password_recovery_requests
--   DROP CONSTRAINT IF EXISTS trainee_password_recovery_delivery_state_check,
--   DROP COLUMN IF EXISTS delivery_state,
--   DROP COLUMN IF EXISTS delivery_attempt_id,
--   DROP COLUMN IF EXISTS delivery_started_at,
--   DROP COLUMN IF EXISTS delivery_updated_at;

-- Important: do not apply this migration until the outstanding approved request has been handled safely
-- and the user explicitly approves a TEST database migration. HMAC cutover is a separate coordinated change.