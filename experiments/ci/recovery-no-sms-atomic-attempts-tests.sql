-- Disposable PostgreSQL functional test for the no-SMS attempt counter.
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_coach uuid := gen_random_uuid();
  v_auth uuid := gen_random_uuid();
  v_trainee uuid := gen_random_uuid();
  v_request uuid := gen_random_uuid();
  v_pending uuid := gen_random_uuid();
  v_expired uuid := gen_random_uuid();
  v_ok boolean;
  v_count smallint;
  v_locked boolean;
  i integer;
BEGIN
  INSERT INTO auth.users(id) VALUES (v_coach), (v_auth);
  INSERT INTO public.trainees(id,approval_status,auth_user_id,phone_normalized,coach_user_id)
  VALUES (v_trainee,'active',v_auth,'+989121234567',v_coach);

  INSERT INTO public.trainee_password_recovery_requests
    (id,trainee_id,phone_normalized,status,token_hash,token_expires_at,token_attempts)
  VALUES
    (v_request,v_trainee,'+989121234567','approved',
     repeat('a',64),clock_timestamp()+interval '24 hours',0);

  SELECT accepted,attempts,locked INTO v_ok,v_count,v_locked
  FROM public.record_trainee_recovery_failed_attempt_no_sms(NULL,repeat('a',64));
  IF v_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'NULL request id must be rejected'; END IF;

  FOR i IN 1..5 LOOP
    SELECT accepted,attempts,locked INTO v_ok,v_count,v_locked
    FROM public.record_trainee_recovery_failed_attempt_no_sms(v_request,repeat('a',64));
    IF v_ok IS DISTINCT FROM true OR v_count <> i THEN
      RAISE EXCEPTION 'attempt % expected accepted/count %, got %/%',i,i,v_ok,v_count;
    END IF;
    IF v_locked IS DISTINCT FROM (i=5) THEN
      RAISE EXCEPTION 'lock indicator mismatch at attempt %',i;
    END IF;
  END LOOP;

  SELECT accepted INTO v_ok
  FROM public.record_trainee_recovery_failed_attempt_no_sms(v_request,repeat('a',64));
  IF v_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'sixth attempt must be rejected'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.trainee_password_recovery_requests
    WHERE id=v_request AND status='expired' AND token_attempts=5
      AND token_hash IS NULL AND token_expires_at IS NULL
  ) THEN RAISE EXCEPTION 'fifth attempt must expire and clear the verifier'; END IF;

  INSERT INTO public.trainee_password_recovery_requests
    (id,trainee_id,phone_normalized,status,token_hash,token_expires_at,token_attempts)
  VALUES (v_pending,v_trainee,'+989121234567','pending',NULL,NULL,0);
  SELECT accepted INTO v_ok
  FROM public.record_trainee_recovery_failed_attempt_no_sms(v_pending,repeat('b',64));
  IF v_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'pending request must be rejected'; END IF;
  DELETE FROM public.trainee_password_recovery_requests WHERE id=v_pending;

  INSERT INTO public.trainee_password_recovery_requests
    (id,trainee_id,phone_normalized,status,token_hash,token_expires_at,token_attempts)
  VALUES (v_expired,v_trainee,'+989121234567','approved',
          repeat('c',64),clock_timestamp()-interval '1 second',0);
  SELECT accepted INTO v_ok
  FROM public.record_trainee_recovery_failed_attempt_no_sms(v_expired,repeat('c',64));
  IF v_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'expired request must be rejected'; END IF;
END $$;

DO $$
BEGIN
  IF NOT has_function_privilege('service_role',
      'public.record_trainee_recovery_failed_attempt_no_sms(uuid,text)','EXECUTE')
     OR has_function_privilege('anon',
      'public.record_trainee_recovery_failed_attempt_no_sms(uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated',
      'public.record_trainee_recovery_failed_attempt_no_sms(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'RPC execute grants are not least-privilege';
  END IF;
END $$;
SELECT 'PASS: service_role-only execute grant';
