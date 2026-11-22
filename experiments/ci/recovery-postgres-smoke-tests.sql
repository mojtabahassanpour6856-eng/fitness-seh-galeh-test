-- Functional smoke tests against disposable CI fixture only.
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
  v_request uuid;
  v_outcome text;
  v_attempt uuid := '20000000-0000-4000-8000-000000000001';
  v_hash text := repeat('a',64);
  v_claimed boolean;
  v_completed boolean;
  v_i integer;
  v_attempts smallint;
BEGIN
  SELECT outcome INTO v_outcome
  FROM public.create_trainee_recovery_request('10000000-0000-4000-8000-000000000001','+989121234567');
  IF v_outcome <> 'created' THEN RAISE EXCEPTION 'create expected created, got %',v_outcome; END IF;

  SELECT outcome INTO v_outcome
  FROM public.create_trainee_recovery_request('10000000-0000-4000-8000-000000000001','+989121234567');
  IF v_outcome <> 'already_open' THEN RAISE EXCEPTION 'duplicate create expected already_open, got %',v_outcome; END IF;

  SELECT id INTO v_request FROM public.trainee_password_recovery_requests
  WHERE trainee_id='10000000-0000-4000-8000-000000000001';

  SELECT outcome INTO v_outcome
  FROM public.approve_and_queue_trainee_recovery(
    v_request,'00000000-0000-4000-8000-000000000099',v_hash,
    clock_timestamp()+interval '10 minutes',v_attempt
  );
  IF v_outcome <> 'not_pending_or_not_owned' THEN RAISE EXCEPTION 'wrong coach approval was not denied: %',v_outcome; END IF;

  SELECT outcome INTO v_outcome
  FROM public.approve_and_queue_trainee_recovery(
    v_request,'00000000-0000-4000-8000-000000000001',v_hash,
    clock_timestamp()+interval '10 minutes',v_attempt
  );
  IF v_outcome <> 'queued' THEN RAISE EXCEPTION 'approve expected queued, got %',v_outcome; END IF;

  SELECT updated INTO v_claimed
  FROM public.record_trainee_recovery_delivery_result(
    v_request,'20000000-0000-4000-8000-000000000099','failed'
  );
  IF v_claimed IS DISTINCT FROM NULL THEN
    RAISE EXCEPTION 'stale delivery attempt unexpectedly updated row';
  END IF;

  SELECT updated INTO v_claimed
  FROM public.record_trainee_recovery_delivery_result(v_request,v_attempt,'sent');
  IF v_claimed IS DISTINCT FROM true THEN RAISE EXCEPTION 'delivery sent update failed'; END IF;

  FOR v_i IN 1..5 LOOP
    SELECT accepted, attempts INTO v_claimed, v_attempts
    FROM public.record_trainee_recovery_failed_attempt(v_request,v_hash);
    IF v_claimed IS DISTINCT FROM true OR v_attempts <> v_i THEN
      RAISE EXCEPTION 'failed attempt % returned accepted %, attempts %',v_i,v_claimed,v_attempts;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.trainee_password_recovery_requests
    WHERE id=v_request AND status='expired' AND token_hash IS NULL
      AND token_expires_at IS NULL AND token_attempts=5
  ) THEN RAISE EXCEPTION 'fifth failed attempt did not expire and clear token'; END IF;

  -- Second trainee exercises the successful claim -> finish path.
  SELECT outcome INTO v_outcome
  FROM public.create_trainee_recovery_request('10000000-0000-4000-8000-000000000002','+989121234568');
  IF v_outcome <> 'created' THEN RAISE EXCEPTION 'second create failed: %',v_outcome; END IF;
  SELECT id INTO v_request FROM public.trainee_password_recovery_requests
  WHERE trainee_id='10000000-0000-4000-8000-000000000002';

  v_attempt := '20000000-0000-4000-8000-000000000002';
  SELECT outcome INTO v_outcome
  FROM public.approve_and_queue_trainee_recovery(
    v_request,'00000000-0000-4000-8000-000000000001',v_hash,
    clock_timestamp()+interval '10 minutes',v_attempt
  );
  IF v_outcome <> 'queued' THEN RAISE EXCEPTION 'second approve failed: %',v_outcome; END IF;

  PERFORM public.record_trainee_recovery_delivery_result(v_request,v_attempt,'sent');
  SELECT claimed INTO v_claimed
  FROM public.claim_trainee_recovery_code(v_request,v_hash);
  IF v_claimed IS DISTINCT FROM true THEN RAISE EXCEPTION 'claim failed'; END IF;

  SELECT outcome INTO v_outcome
  FROM public.create_trainee_recovery_request('10000000-0000-4000-8000-000000000002','+989121234568');
  IF v_outcome <> 'already_open' THEN RAISE EXCEPTION 'create during processing expected already_open, got %',v_outcome; END IF;

  SELECT claimed INTO v_claimed
  FROM public.claim_trainee_recovery_code(v_request,v_hash);
  IF v_claimed IS DISTINCT FROM false THEN RAISE EXCEPTION 'replayed claim unexpectedly succeeded'; END IF;

  SELECT completed INTO v_completed
  FROM public.finish_trainee_recovery(v_request,v_hash);
  IF v_completed IS DISTINCT FROM true THEN RAISE EXCEPTION 'finish failed'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.trainee_password_recovery_requests WHERE id=v_request AND status='completed' AND token_hash IS NULL)
  THEN RAISE EXCEPTION 'completed state not persisted'; END IF;

  SELECT completed INTO v_completed
  FROM public.finish_trainee_recovery(v_request,v_hash);
  IF v_completed IS DISTINCT FROM false THEN RAISE EXCEPTION 'replayed finish unexpectedly succeeded'; END IF;
END $;
