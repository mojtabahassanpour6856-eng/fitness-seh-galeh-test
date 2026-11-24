-- Deterministic DB-side tests for ambiguous Auth reset outcomes.
-- Disposable CI PostgreSQL only. No external Auth calls or real trainee data.
\set ON_ERROR_STOP on

INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003');
INSERT INTO public.trainees(id,approval_status,auth_user_id,phone_normalized,coach_user_id) VALUES
 ('10000000-0000-4000-8000-000000000001','active','00000000-0000-4000-8000-000000000002','+989121234567','00000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002','active','00000000-0000-4000-8000-000000000003','+989121234568','00000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_request uuid := '20000000-0000-4000-8000-000000000001';
  v_hash text := repeat('b', 64);
  v_attempt_a uuid := '30000000-0000-4000-8000-000000000001';
  v_attempt_b uuid := '30000000-0000-4000-8000-000000000002';
  v_attempt_c uuid := '30000000-0000-4000-8000-000000000003';
  v_state text;
  v_ok boolean;
  v_marker boolean;
  v_lease timestamptz;
BEGIN
  INSERT INTO public.trainee_password_recovery_requests(
    id, trainee_id, phone_normalized, status, token_hash, token_expires_at,
    token_attempts, code_envelope
  ) VALUES (
    v_request, '10000000-0000-4000-8000-000000000001', '+989121234567',
    'approved', v_hash, pg_catalog.now() + interval '24 hours', 0, 'synthetic-envelope'
  );

  -- Attempt A acquires the only Auth dispatch lease.
  SELECT public.begin_or_resume_trainee_password_reset(v_request, v_hash, v_attempt_a, 120)
    INTO v_state;
  IF v_state <> 'acquired' THEN RAISE EXCEPTION 'attempt A expected acquired, got %', v_state; END IF;

  -- A concurrent caller while A's lease is live must not acquire or dispatch.
  SELECT public.begin_or_resume_trainee_password_reset(v_request, v_hash, v_attempt_b, 120)
    INTO v_state;
  IF v_state <> 'busy' THEN RAISE EXCEPTION 'live lease expected busy, got %', v_state; END IF;

  -- Deterministically simulate A still executing remotely after the local lease expires.
  UPDATE public.trainee_password_recovery_requests
     SET reset_lease_until = pg_catalog.now() - interval '1 second'
   WHERE id = v_request AND reset_attempt_id = v_attempt_a;

  -- Attempt B after expiry must quarantine; it must never receive a new lease.
  SELECT public.begin_or_resume_trainee_password_reset(v_request, v_hash, v_attempt_b, 120)
    INTO v_state;
  IF v_state <> 'blocked_unknown_outcome' THEN
    RAISE EXCEPTION 'expired lease must block as unknown, got %', v_state;
  END IF;

  SELECT reset_reconciliation_required, reset_lease_until
    INTO v_marker, v_lease
    FROM public.trainee_password_recovery_requests WHERE id = v_request;
  IF v_marker IS DISTINCT FROM true OR v_lease IS NOT NULL THEN
    RAISE EXCEPTION 'expired lease was not durably quarantined';
  END IF;

  -- A third caller remains blocked; no later caller can turn expiry into a retry.
  SELECT public.begin_or_resume_trainee_password_reset(v_request, v_hash, v_attempt_c, 120)
    INTO v_state;
  IF v_state <> 'blocked_unknown_outcome' THEN
    RAISE EXCEPTION 'subsequent caller escaped quarantine: %', v_state;
  END IF;

  -- The original late attempt cannot finalize after lease expiry/quarantine.
  SELECT public.finish_trainee_password_reset(v_request, v_attempt_a, v_hash)
    INTO v_ok;
  IF v_ok IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'late attempt unexpectedly finalized after quarantine';
  END IF;

  -- Stale attempt IDs cannot clear or overwrite the quarantine.
  SELECT public.mark_trainee_password_reset_reconciliation_required(v_request, v_attempt_b)
    INTO v_ok;
  IF v_ok IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'stale attempt unexpectedly changed reconciliation state';
  END IF;

  RAISE NOTICE 'ambiguous Auth lease-expiry fail-closed tests passed';
END $$;

-- A separate request proves an explicit ambiguous marker works before lease expiry.
DO $$
DECLARE
  v_request uuid := '20000000-0000-4000-8000-000000000002';
  v_hash text := repeat('c', 64);
  v_attempt uuid := '30000000-0000-4000-8000-000000000004';
  v_state text;
  v_ok boolean;
BEGIN
  INSERT INTO public.trainee_password_recovery_requests(
    id, trainee_id, phone_normalized, status, token_hash, token_expires_at,
    token_attempts, code_envelope
  ) VALUES (
    v_request, '10000000-0000-4000-8000-000000000002', '+989121234568',
    'approved', v_hash, pg_catalog.now() + interval '24 hours', 0, 'synthetic-envelope'
  );

  SELECT public.begin_or_resume_trainee_password_reset(v_request, v_hash, v_attempt, 120)
    INTO v_state;
  IF v_state <> 'acquired' THEN RAISE EXCEPTION 'second request expected acquired, got %', v_state; END IF;

  SELECT public.mark_trainee_password_reset_reconciliation_required(v_request, v_attempt)
    INTO v_ok;
  IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'matching ambiguous marker failed'; END IF;

  SELECT public.begin_or_resume_trainee_password_reset(
    v_request, v_hash, '30000000-0000-4000-8000-000000000005', 120
  ) INTO v_state;
  IF v_state <> 'blocked_unknown_outcome' THEN
    RAISE EXCEPTION 'explicitly quarantined request was not blocked: %', v_state;
  END IF;
END $$;


-- A known provider validation rejection may release only its own still-live lease.
DO $test$
DECLARE
  v_request uuid := '20000000-0000-4000-8000-000000000003';
  v_hash text := repeat('d', 64);
  v_attempt uuid := '30000000-0000-4000-8000-000000000006';
  v_state text;
  v_ok boolean;
  v_status text;
  v_owner uuid;
  v_marker boolean;
BEGIN
  INSERT INTO public.trainee_password_recovery_requests(
    id, trainee_id, phone_normalized, status, token_hash, token_expires_at,
    token_attempts, code_envelope
  ) VALUES (
    v_request, '10000000-0000-4000-8000-000000000001', '+989121234567',
    'approved', v_hash, pg_catalog.now() + interval '24 hours', 0, 'synthetic-envelope'
  );

  SELECT public.begin_or_resume_trainee_password_reset(v_request, v_hash, v_attempt, 120)
    INTO v_state;
  IF v_state <> 'acquired' THEN RAISE EXCEPTION 'definitive rejection fixture not acquired'; END IF;

  SELECT public.release_trainee_password_reset_lease(v_request, v_attempt) INTO v_ok;
  IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'matching live lease did not release'; END IF;

  SELECT status, reset_attempt_id, reset_reconciliation_required
    INTO v_status, v_owner, v_marker
    FROM public.trainee_password_recovery_requests WHERE id = v_request;
  IF v_status <> 'approved' OR v_owner IS NOT NULL OR v_marker IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'safe release did not restore approved state';
  END IF;
END $test$;

-- Even a provider rejection is not allowed to release a lease that has already expired.
DO $test$
DECLARE
  v_request uuid := '20000000-0000-4000-8000-000000000004';
  v_hash text := repeat('e', 64);
  v_attempt uuid := '30000000-0000-4000-8000-000000000007';
  v_state text;
  v_ok boolean;
  v_marker boolean;
BEGIN
  INSERT INTO public.trainee_password_recovery_requests(
    id, trainee_id, phone_normalized, status, token_hash, token_expires_at,
    token_attempts, code_envelope
  ) VALUES (
    v_request, '10000000-0000-4000-8000-000000000002', '+989121234568',
    'approved', v_hash, pg_catalog.now() + interval '24 hours', 0, 'synthetic-envelope'
  );

  SELECT public.begin_or_resume_trainee_password_reset(v_request, v_hash, v_attempt, 120)
    INTO v_state;
  IF v_state <> 'acquired' THEN RAISE EXCEPTION 'expired-lease fixture not acquired'; END IF;

  UPDATE public.trainee_password_recovery_requests
     SET reset_lease_until = pg_catalog.now() - interval '1 second'
   WHERE id = v_request AND reset_attempt_id = v_attempt;

  SELECT public.release_trainee_password_reset_lease(v_request, v_attempt) INTO v_ok;
  IF v_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'expired lease unexpectedly released'; END IF;

  SELECT reset_reconciliation_required INTO v_marker
    FROM public.trainee_password_recovery_requests WHERE id = v_request;
  IF v_marker IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'release function should not silently mutate expired lease';
  END IF;
END $test$;

-- RPCs must remain service-role-only.
DO $$
DECLARE
  v_name text;
  v_sig regprocedure;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'begin_or_resume_trainee_password_reset(uuid,text,uuid,integer)',
    'mark_trainee_password_reset_reconciliation_required(uuid,uuid)',
    'finish_trainee_password_reset(uuid,uuid,text)',
    'release_trainee_password_reset_lease(uuid,uuid)'
  ] LOOP
    v_sig := v_name::regprocedure;
    IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE')
       OR has_function_privilege('anon', v_sig, 'EXECUTE')
       OR has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'unsafe execute ACL for %', v_name;
    END IF;
  END LOOP;
END $$;
