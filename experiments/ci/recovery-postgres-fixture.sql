-- Disposable CI-only schema fixture. Never point this at Supabase.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.trainees (
  id uuid PRIMARY KEY,
  approval_status text NOT NULL,
  auth_user_id uuid REFERENCES auth.users(id),
  phone_normalized text NOT NULL,
  coach_user_id uuid NOT NULL REFERENCES auth.users(id)
);
CREATE TABLE public.trainee_password_recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id uuid NOT NULL REFERENCES public.trainees(id) ON DELETE CASCADE,
  phone_normalized text NOT NULL CHECK (phone_normalized ~ '^\+989[0-9]{9}$'),
  status text NOT NULL CHECK (status IN ('pending','approved','processing','rejected','completed','expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  token_hash text,
  token_expires_at timestamptz,
  token_attempts smallint NOT NULL DEFAULT 0 CHECK (token_attempts BETWEEN 0 AND 10),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status IN ('pending','rejected') AND token_hash IS NULL AND token_expires_at IS NULL)
    OR (status IN ('approved','processing') AND token_hash IS NOT NULL AND token_expires_at IS NOT NULL)
    OR status IN ('completed','expired')
  )
);
CREATE UNIQUE INDEX trainee_password_recovery_one_open_request_per_trainee
  ON public.trainee_password_recovery_requests(trainee_id)
  WHERE status IN ('pending','approved');
CREATE INDEX trainee_password_recovery_status_requested_at
  ON public.trainee_password_recovery_requests(status, requested_at DESC);
CREATE INDEX idx_trainee_password_recovery_requests_reviewed_by_fk
  ON public.trainee_password_recovery_requests(reviewed_by);
