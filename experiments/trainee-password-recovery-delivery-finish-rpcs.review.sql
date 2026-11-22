-- REVIEW ONLY — additional recovery lifecycle RPCs; NOT EXECUTED.
-- Requires delivery metadata migration and the core RPC draft.

CREATE OR REPLACE FUNCTION public.record_trainee_recovery_delivery_result(
  p_request_id uuid, p_attempt_id uuid, p_result text
)
RETURNS TABLE(updated boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $function$
  UPDATE public.trainee_password_recovery_requests AS r
  SET delivery_state = p_result,
      delivery_updated_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  WHERE p_request_id IS NOT NULL
    AND p_attempt_id IS NOT NULL
    AND p_result IN ('sent','uncertain','failed')
    AND r.id = p_request_id
    AND r.status = 'approved'
    AND r.delivery_state = 'queued'
    AND r.delivery_attempt_id = p_attempt_id
  RETURNING true;
$function$;

CREATE OR REPLACE FUNCTION public.finish_trainee_recovery(
  p_request_id uuid, p_expected_token_hmac text
)
RETURNS TABLE(completed boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $function$
  UPDATE public.trainee_password_recovery_requests AS r
  SET status = 'completed',
      completed_at = pg_catalog.clock_timestamp(),
      token_hash = NULL,
      token_expires_at = NULL,
      updated_at = pg_catalog.clock_timestamp()
  WHERE p_request_id IS NOT NULL
    AND p_expected_token_hmac IS NOT NULL
    AND p_expected_token_hmac ~ '^[0-9a-f]{64}$'
    AND r.id = p_request_id
    AND r.status = 'processing'
    AND r.token_hash = p_expected_token_hmac
  RETURNING true;
$function$;

REVOKE ALL ON FUNCTION public.record_trainee_recovery_delivery_result(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_trainee_recovery_delivery_result(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.finish_trainee_recovery(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_trainee_recovery(uuid, text) TO service_role;

-- Semantics:
-- - 'sent' means provider acceptance is confirmed, not handset delivery.
-- - timeout/network loss/ambiguous response => 'uncertain'; never retry the same code automatically.
-- - 'failed' only for a definite provider rejection.
-- - attempt UUID prevents an old provider response from overwriting a newer attempt.
-- - finish is called only after Auth confirms password update success.
-- - If finish fails after Auth update, do not reopen the request; reconcile manually.
-- - Do not store provider credentials, plaintext code, or raw provider response.

-- Still required before use:
-- 1. Add a dedicated HMAC pepper and bind the HMAC to request ID + attempt ID.
-- 2. Ensure reset Edge Function calls claim only after delivery_state='sent'.
-- 3. Compile and test all functions in an isolated PostgreSQL database.
-- 4. Verify column names/types and function owner/privileges against TEST schema.
-- No DDL, DML, function creation, SMS, password update, or deployment was performed.