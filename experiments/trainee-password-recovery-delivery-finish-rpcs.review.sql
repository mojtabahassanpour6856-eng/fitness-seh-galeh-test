-- REVIEW ONLY — additional recovery lifecycle RPCs; NOT EXECUTED.
-- Requires delivery metadata migration and the core RPC draft.

CREATE OR REPLACE FUNCTION public.record_trainee_recovery_delivery_result(
  p_request_id uuid,
  p_attempt_id uuid,
  p_result text
)
RETURNS TABLE(updated boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  UPDATE public.trainee_password_recovery_requests AS r
  SET delivery_state = p_result,
      delivery_updated_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  WHERE r.id = p_request_id
    AND r.status = 'approved'
    AND r.delivery_state = 'queued'
    AND r.delivery_attempt_id = p_attempt_id
    AND p_request_id IS NOT NULL
    AND p_attempt_id IS NOT NULL
    AND p_result IN ('sent','uncertain','failed')
  RETURNING true;
$function$;

CREATE OR REPLACE FUNCTION public.finish_trainee_recovery(
  p_request_id uuid,
  p_expected_token_hmac text
)
RETURNS TABLE(completed boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  UPDATE public.trainee_password_recovery_requests AS r
  SET status = 'completed',
      completed_at = pg_catalog.clock_timestamp(),
      token_hash = NULL,
      token_expires_at = NULL,
      updated_at = pg_catalog.clock_timestamp()
  WHERE r.id = p_request_id
    AND r.status = 'processing'
    AND p_request_id IS NOT NULL
    AND p_expected_token_hmac IS NOT NULL
    AND p_expected_token_hmac ~ '^[0-9a-f]{64}
$function$;

REVOKE ALL ON FUNCTION public.record_trainee_recovery_delivery_result(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_trainee_recovery_delivery_result(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.finish_trainee_recovery(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_trainee_recovery(uuid, text) TO service_role;

-- Semantics:
-- - delivery_state='sent' means the provider contract confirms acceptance, not handset delivery.
-- - ambiguous response/timeout/network loss must be recorded as 'uncertain'.
-- - 'failed' is allowed only for a documented definite provider rejection.
-- - Old attempt UUIDs cannot overwrite the current attempt.
-- - finish is called only after Auth confirms password update success.
-- - If finish returns no row after Auth success, keep request non-reusable and trigger manual reconciliation.
-- - Do not restore processing -> approved on generic Auth errors or elapsed time.
-- - Do not store provider credentials, plaintext code, or raw provider response in this table.

-- Required follow-up before use:
-- 1. Basic null/format guards are now present; add schema-specific validation and confirm the HMAC domain binding before use.
-- 2. Consider whether provider acceptance identifiers are available; add only after Mediana confirms contract.
-- 3. Update core approve RPC to re-check trainee active/auth_user_id/phone ownership at approval time.
-- 4. Compile and test all functions in isolated PostgreSQL before any TEST migration.
-- No DDL, DML, function creation, SMS, password update, or deployment was performed.
    AND r.token_hash = p_expected_token_hmac
  RETURNING true;
$function$;

REVOKE ALL ON FUNCTION public.record_trainee_recovery_delivery_result(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_trainee_recovery_delivery_result(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.finish_trainee_recovery(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_trainee_recovery(uuid, text) TO service_role;

-- Semantics:
-- - delivery_state='sent' means the provider contract confirms acceptance, not handset delivery.
-- - ambiguous response/timeout/network loss must be recorded as 'uncertain'.
-- - 'failed' is allowed only for a documented definite provider rejection.
-- - Old attempt UUIDs cannot overwrite the current attempt.
-- - finish is called only after Auth confirms password update success.
-- - If finish returns no row after Auth success, keep request non-reusable and trigger manual reconciliation.
-- - Do not restore processing -> approved on generic Auth errors or elapsed time.
-- - Do not store provider credentials, plaintext code, or raw provider response in this table.

-- Required follow-up before use:
-- 1. Add strict null/format validation for p_request_id, p_attempt_id, p_result, and HMAC.
-- 2. Consider whether provider acceptance identifiers are available; add only after Mediana confirms contract.
-- 3. Update core approve RPC to re-check trainee active/auth_user_id/phone ownership at approval time.
-- 4. Compile and test all functions in isolated PostgreSQL before any TEST migration.
-- No DDL, DML, function creation, SMS, password update, or deployment was performed.