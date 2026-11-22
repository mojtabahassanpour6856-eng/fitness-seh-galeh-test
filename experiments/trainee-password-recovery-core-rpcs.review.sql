-- REVIEW ONLY — NOT EXECUTED
-- Proposed atomic RPCs for TEST recovery flow after delivery-metadata migration.
-- Requires columns delivery_state and delivery_attempt_id from the separate draft migration.
-- All functions are service_role-only; never expose these RPCs to browser clients.
-- SECURITY DEFINER functions pin search_path='' and schema-qualify all objects.

CREATE OR REPLACE FUNCTION public.create_trainee_recovery_request(
  p_trainee_id uuid,
  p_phone_normalized text
)
RETURNS TABLE(outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_active boolean;
BEGIN
  IF p_trainee_id IS NULL OR p_phone_normalized IS NULL OR p_phone_normalized !~ '^\+989[0-9]{9}$' THEN
    RETURN QUERY SELECT 'invalid'::text;
    RETURN;
  END IF;

  -- One lock key convention for every lifecycle-changing RPC.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_trainee_id::text, 0));

  SELECT (t.approval_status = 'active'
          AND t.auth_user_id IS NOT NULL
          AND t.phone_normalized = p_phone_normalized)
    INTO v_active
  FROM public.trainees AS t
  WHERE t.id = p_trainee_id;

  IF COALESCE(v_active, false) IS NOT TRUE THEN
    RETURN QUERY SELECT 'not_eligible'::text;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.trainee_password_recovery_requests AS r
    WHERE r.trainee_id = p_trainee_id
      AND r.status IN ('pending','approved','processing')
  ) THEN
    RETURN QUERY SELECT 'already_open'::text;
    RETURN;
  END IF;

  INSERT INTO public.trainee_password_recovery_requests
    (trainee_id, phone_normalized, status)
  VALUES (p_trainee_id, p_phone_normalized, 'pending');

  RETURN QUERY SELECT 'created'::text;
EXCEPTION
  WHEN unique_violation THEN
    -- The partial unique index is the final invariant if a writer bypasses the lock convention.
    RETURN QUERY SELECT 'already_open'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_and_queue_trainee_recovery(
  p_request_id uuid,
  p_coach_user_id uuid,
  p_token_hmac text,
  p_expires_at timestamptz,
  p_attempt_id uuid
)
RETURNS TABLE(outcome text, delivery_attempt_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_trainee_id uuid;
  v_changed_id uuid;
BEGIN
  IF p_request_id IS NULL OR p_coach_user_id IS NULL OR p_attempt_id IS NULL
     OR p_token_hmac IS NULL OR p_expires_at IS NULL
     OR p_token_hmac !~ '^[0-9a-f]{64}$'
     OR p_expires_at <= pg_catalog.clock_timestamp()
     OR p_expires_at > pg_catalog.clock_timestamp() + interval '20 minutes' THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT r.trainee_id INTO v_trainee_id
  FROM public.trainee_password_recovery_requests AS r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF v_trainee_id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_trainee_id::text, 0));

  UPDATE public.trainee_password_recovery_requests AS r
  SET status = 'approved',
      reviewed_at = pg_catalog.clock_timestamp(),
      reviewed_by = p_coach_user_id,
      token_hash = p_token_hmac,
      token_expires_at = p_expires_at,
      token_attempts = 0,
      delivery_state = 'queued',
      delivery_attempt_id = p_attempt_id,
      delivery_started_at = pg_catalog.clock_timestamp(),
      delivery_updated_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  FROM public.trainees AS t
  WHERE r.id = p_request_id
    AND r.trainee_id = t.id
    AND t.coach_user_id = p_coach_user_id
    AND t.approval_status = 'active'
    AND t.auth_user_id IS NOT NULL
    AND t.phone_normalized = r.phone_normalized
    AND r.status = 'pending'
  RETURNING r.id INTO v_changed_id;

  IF v_changed_id IS NULL THEN
    RETURN QUERY SELECT 'not_pending_or_not_owned'::text, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'queued'::text, p_attempt_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_trainee_recovery_code(
  p_request_id uuid,
  p_expected_token_hmac text
)
RETURNS TABLE(claimed boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  UPDATE public.trainee_password_recovery_requests AS r
  SET status = 'processing',
      updated_at = pg_catalog.clock_timestamp()
  WHERE r.id = p_request_id
    AND r.status = 'approved'
    AND r.token_hash = p_expected_token_hmac
    AND r.token_expires_at > pg_catalog.clock_timestamp()
    AND r.token_attempts < 5
    AND r.delivery_state = 'sent'
  RETURNING true;
$function$;

-- Function privileges: remove implicit PUBLIC access and grant only to service_role.
REVOKE ALL ON FUNCTION public.create_trainee_recovery_request(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_trainee_recovery_request(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.approve_and_queue_trainee_recovery(uuid, uuid, text, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_and_queue_trainee_recovery(uuid, uuid, text, timestamptz, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.claim_trainee_recovery_code(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_trainee_recovery_code(uuid, text) TO service_role;

-- IMPORTANT REVIEW NOTES:
-- 1. This is a draft, not parser-tested or database-tested.
-- 2. Before use, review PL/pgSQL variable/column ambiguity and compile in an isolated local PostgreSQL instance. The approve RPC re-checks active status, auth_user_id, phone match, and coach ownership.
-- 3. Ensure the unique index covers pending, approved, processing before enabling these RPCs.
-- 4. Approve RPC must not trust coach ID from client JSON; Edge Function supplies only auth.getUser() identity.
-- 5. `claim` returns zero rows on failure; Edge Function must treat this as denied/reused/expired without leaking details.
-- 6. `record_trainee_recovery_failed_attempt` must be updated to require delivery_state='sent' and hash HMAC.
-- 7. Delivery-result, finish, and reconciliation RPCs remain separate drafts.
-- 8. Never apply while the existing expired approved row remains unreconciled.
-- No database operation, SMS, Auth update, or deployment was performed.