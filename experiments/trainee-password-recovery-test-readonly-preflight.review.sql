-- READ-ONLY PREFLIGHT FOR TEST RECOVERY MIGRATION — safe to run as SELECTs only.
-- Project: udptdznbvewkublvzmtm. Do not run on production.

-- A. Aggregate lifecycle state; never returns identifiers, phone numbers, or token hashes.
SELECT status,
       count(*)::bigint AS row_count,
       count(*) FILTER (WHERE token_expires_at IS NOT NULL
                         AND token_expires_at <= pg_catalog.clock_timestamp())::bigint AS expired_token_count
FROM public.trainee_password_recovery_requests
GROUP BY status
ORDER BY status;

-- B. Duplicate open lifecycle rows; expected zero before widening the unique index.
SELECT count(*)::bigint AS duplicate_trainee_groups
FROM (
  SELECT trainee_id
  FROM public.trainee_password_recovery_requests
  WHERE status IN ('pending','approved','processing')
  GROUP BY trainee_id
  HAVING count(*) > 1
) AS duplicates;

-- C. Required delivery columns and their types.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'trainee_password_recovery_requests'
  AND column_name IN ('delivery_state','delivery_attempt_id','delivery_started_at','delivery_updated_at')
ORDER BY column_name;

-- D. Existing index validity and exact predicate.
SELECT i.relname AS index_name,
       x.indisvalid, x.indisready,
       pg_catalog.pg_get_expr(x.indpred, x.indrelid) AS predicate
FROM pg_catalog.pg_index AS x
JOIN pg_catalog.pg_class AS i ON i.oid = x.indexrelid
WHERE x.indrelid = 'public.trainee_password_recovery_requests'::regclass
ORDER BY i.relname;

-- E. Delivery-state constraint status.
SELECT conname, convalidated, pg_catalog.pg_get_constraintdef(oid) AS definition
FROM pg_catalog.pg_constraint
WHERE conrelid = 'public.trainee_password_recovery_requests'::regclass
  AND conname = 'trainee_password_recovery_delivery_state_check';

-- F. Function ACLs (if the proposed functions have already been installed in a disposable test DB).
SELECT p.proname,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_catalog.pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       p.proacl AS acl
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_trainee_recovery_request',
    'approve_and_queue_trainee_recovery',
    'claim_trainee_recovery_code',
    'record_trainee_recovery_failed_attempt',
    'record_trainee_recovery_delivery_result',
    'finish_trainee_recovery'
  )
ORDER BY p.proname;

-- Interpretation:
-- - Do not reveal or export any individual request data.
-- - Before enabling create/reset, stale approved rows with expired tokens must be reconciled safely.
-- - Duplicate open trainee groups must be zero before creating the stronger unique index.
-- - Missing delivery columns mean the metadata migration has not run; do not deploy v11 against that schema.
-- - Empty function ACL results mean RPCs are not yet installed; that is expected before migration.
-- - This file contains SELECT statements only; no DDL, DML, or function invocation.