-- Disposable PostgreSQL functional test for the no-SMS attempt counter.
\\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000001');
INSERT INTO public.trainees(id,approval_status,auth_user_id,phone_normalized,coach_user_id)
VALUES ('10000000-0000-4000-8000-000000000001','active',
        '00000000-0000-4000-8000-000000000001','+989121234567',
        '00000000-0000-4000-8000-000000000001');
INSERT INTO public.trainee_password_recovery_requests
  (id,trainee_id,phone_normalized,status,token_hash,token_expires_at,token_attempts)
VALUES
  ('20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001','+989121234567','approved',
   repeat('a',64),clock_timestamp()+interval '24 hours',0);

DO $$
DECLARE
  v_ok boolean;
  v_count smallint;
  v_locked boolean;
  i integer;
BEGIN
  SELECT accepted,attempts,locked INTO v_ok,v_count,v_locked
  FROM public.record_trainee_recovery_failed_attempt_no_sms(NULL,repeat('a',64));
  IF v_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'NULL request id must be rejected'; END IF;

  FOR i IN 1..5 LOOP
    SELECT accepted,attempts,locked INTO v_ok,v_count,v_locked
    FROM public.record_trainee_recovery_failed_attempt_no_sms(
      '20000000-0000-4000-8000-000000000001',repeat('a',64));
    IF v_ok IS DISTINCT FROM true OR v_count <> i THEN
      RAISE EXCEPTION 'attempt % expected accepted/count %, got %/%',i,i,v_ok,v_count;
    END IF;
    IF v_locked IS DISTINCT FROM (i=5) THEN
      RAISE EXCEPTION 'lock indicator mismatch at attempt %',i;
    END IF;
  END LOOP;

  SELECT accepted INTO v_ok
  FROM public.record_trainee_recovery_failed_attempt_no_sms(
    '20000000-0000-4000-8000-000000000001',repeat('a',64));
  IF v_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'sixth attempt must be rejected'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.trainee_password_recovery_requests
    WHERE id='20000000-0000-4000-8000-000000000001'
      AND status='expired' AND token_attempts=5
      AND token_hash IS NULL AND token_expires_at IS NULL
  ) THEN RAISE EXCEPTION 'fifth attempt must expire and clear the verifier'; END IF;

  INSERT INTO public.trainee_password_recovery_requests
    (id,trainee_id,phone_normalized,status,token_hash,token_expires_at,token_attempts)
  VALUES
    ('20000000-0000-4000-8000-000000000002',
     '10000000-0000-4000-8000-000000000001','+989121234567','pending',
     repeat('b',64),clock_timestamp()+interval '24 hours',0);
  SELECT accepted INTO v_ok
  FROM public.record_trainee_recovery_failed_attempt_no_sms(
    '20000000-0000-4000-8000-000000000002',repeat('b',64));
  IF v_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'pending request must be rejected'; END IF;
  DELETE FROM public.trainee_password_recovery_requests
  WHERE id='20000000-0000-4000-8000-000000000002';

  INSERT INTO public.trainee_password_recovery_requests
    (id,trainee_id,phone_normalized,status,token_hash,token_expires_at,token_attempts)
  VALUES
    ('20000000-0000-4000-8000-000000000003',
     '10000000-0000-4000-8000-000000000001','+989121234567','approved',
     repeat('c',64),clock_timestamp()-interval '1 second',0);
  SELECT accepted INTO v_ok
  FROM public.record_trainee_recovery_failed_attempt_no_sms(
    '20000000-0000-4000-8000-000000000003',repeat('c',64));
  IF v_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'expired request must be rejected'; END IF;
END $$;

DO $ BEGIN
  IF NOT has_function_privilege('service_role',
      'public.record_trainee_recovery_failed_attempt_no_sms(uuid,text)','EXECUTE')
     OR has_function_privilege('anon',
      'public.record_trainee_recovery_failed_attempt_no_sms(uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated',
      'public.record_trainee_recovery_failed_attempt_no_sms(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'RPC execute grants are not least-privilege';
  END IF;
END $;
SELECT 'PASS: service_role-only execute grant';
