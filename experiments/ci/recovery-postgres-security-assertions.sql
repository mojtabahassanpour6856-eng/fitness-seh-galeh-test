-- Security assertions for recovery RPC drafts in disposable CI PostgreSQL only.
-- Fails closed if a required function is missing or has unsafe owner/definer/search_path/ACL.
\set ON_ERROR_STOP on

DO $$
DECLARE
  v_count integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'create_trainee_recovery_request',
      'approve_and_queue_trainee_recovery',
      'claim_trainee_recovery_code',
      'record_trainee_recovery_failed_attempt',
      'record_trainee_recovery_delivery_result',
      'finish_trainee_recovery'
    );

  IF v_count <> 6 THEN
    RAISE EXCEPTION 'expected 6 recovery RPCs, found %', v_count;
  END IF;

  SELECT count(*) INTO v_bad
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'create_trainee_recovery_request',
      'approve_and_queue_trainee_recovery',
      'claim_trainee_recovery_code',
      'record_trainee_recovery_failed_attempt',
      'record_trainee_recovery_delivery_result',
      'finish_trainee_recovery'
    )
    AND (
      pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres'
      OR p.prosecdef IS DISTINCT FROM true
      OR NOT (COALESCE(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""'])
      OR NOT pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
      OR pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      OR pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
        WHERE a.grantee = 0
          AND a.privilege_type = 'EXECUTE'
      )
    );

  IF v_bad <> 0 THEN
    RAISE EXCEPTION '% recovery RPC(s) failed owner/SECURITY DEFINER/search_path/execute ACL assertions', v_bad;
  END IF;
END
$$;

SELECT 'recovery RPC security assertions passed' AS result;
